import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { validateEmail, validatePhone } from "@/shemas/validationSchema";

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

    const productionHostnames = ["tecfy.dev", "www.tecfy.dev"];
    const isHostnameValid =
      turnstileResponse.hostname &&
      productionHostnames.includes(turnstileResponse.hostname);

    const isActionValid = turnstileResponse.action === "contact_form_submit";

    if (!isHostnameValid || !isActionValid) {
      return Response.json({ error: "turnstile_failed" }, { status: 403 });
    }

    const normalizedEmail = lead_email.trim().toLowerCase();

    try {
      await adminDb
        .collection("leads")
        .doc(normalizedEmail)
        .create({
          lead_name: trimmedName,
          lead_email: lead_email.trim(),
          lead_phone,
          interest_plan: typeof interest_plan === "string" ? interest_plan.trim() : "",
          created_at: FieldValue.serverTimestamp(),
          source: "website_contact_form",
        });

      return Response.json({ ok: true }, { status: 201 });
    } catch (error: unknown) {
      const firebaseError = error as { code?: number };
      if (firebaseError.code === 6) {
        return Response.json({ error: "duplicate_lead" }, { status: 409 });
      }

      console.error("Firestore write error:", error);
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
  } catch (error) {
    console.error("Route handler error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
