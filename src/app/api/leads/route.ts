import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { validateEmail, validatePhone } from "@/shemas/validationSchema";
import { capitalizeName } from "@/utils/masks";

export const runtime = "nodejs";

interface TurnstileResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  error_codes?: string[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { lead_name, lead_email, lead_phone, interest_plan, turnstile_token } = body;

    if (
      typeof lead_name !== "string" ||
      typeof lead_email !== "string" ||
      typeof lead_phone !== "string" ||
      typeof turnstile_token !== "string"
    ) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }

    const trimmedName = lead_name.trim();
    if (trimmedName.length === 0) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }

    if (!validateEmail(lead_email)) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }

    if (!validatePhone(lead_phone)) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }

    if (turnstile_token.length === 0) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let turnstileResponse: TurnstileResponse;
    try {
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: process.env.TURNSTILE_SECRET_KEY!,
            response: turnstile_token,
            remoteip: clientIp,
          }).toString(),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        return Response.json({ error: "turnstile_failed" }, { status: 403 });
      }

      turnstileResponse = await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      return Response.json({ error: "turnstile_failed" }, { status: 403 });
    }

    if (!turnstileResponse.success) {
      return Response.json({ error: "turnstile_failed" }, { status: 403 });
    }

    // Em produção só aceita os domínios reais; em dev, localhost também.
    const allowedHostnames =
      process.env.NODE_ENV === "production"
        ? ["tecfy.dev", "www.tecfy.dev"]
        : ["tecfy.dev", "www.tecfy.dev", "localhost", "127.0.0.1"];

    const isHostnameValid =
      turnstileResponse.hostname &&
      allowedHostnames.includes(turnstileResponse.hostname);

    const isActionValid = turnstileResponse.action === "contact_form_submit";

    if (!isHostnameValid || !isActionValid) {
      console.error("Turnstile validation failed:", {
        hostname: turnstileResponse.hostname,
        action: turnstileResponse.action,
        error_codes: turnstileResponse.error_codes,
      });
      return Response.json({ error: "turnstile_failed" }, { status: 403 });
    }

    const normalizedEmail = lead_email.trim().toLowerCase();

    try {
      const leadRef = adminDb.collection("leads").doc(); // uid aleatório
      const counterRef = adminDb.collection("counters").doc("leads");

      const result = await adminDb.runTransaction(async (tx) => {
        // Firestore exige todas as leituras antes das escritas.

        // 1. Bloqueia email duplicado.
        const existing = await tx.get(
          adminDb
            .collection("leads")
            .where("lead_email", "==", normalizedEmail)
            .limit(1)
        );
        if (!existing.empty) {
          return { duplicate: true as const };
        }

        // 2. id sequencial via contador atômico (1, 2, 3...).
        const counterSnap = await tx.get(counterRef);
        const current = (counterSnap.get("value") as number | undefined) ?? 0;
        const nextId = current + 1;

        // 3. Escritas.
        tx.set(counterRef, { value: nextId }, { merge: true });
        tx.set(leadRef, {
          id: nextId,
          id_linked_company: "1",
          lead_name: capitalizeName(trimmedName),
          lead_email: normalizedEmail,
          lead_phone,
          interest_plan: typeof interest_plan === "string" ? interest_plan.trim() : "",
          lead_status: "not contacted",
          origin: "website",
          position: "new",
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });

        return { duplicate: false as const };
      });

      if (result.duplicate) {
        return Response.json({ error: "duplicate_lead" }, { status: 409 });
      }

      return Response.json({ ok: true }, { status: 201 });
    } catch (error: unknown) {
      console.error("Firestore write error:", error);
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
  } catch (error) {
    console.error("Route handler error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
