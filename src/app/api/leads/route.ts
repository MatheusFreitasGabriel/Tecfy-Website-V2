import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { validateEmail, validatePhone } from "@/shemas/validationSchema";
import { capitalizeName } from "@/utils/masks";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";


// Rate limiting em memória
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hora
const MAX_REQUESTS_PER_HOUR = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];

  const recentRequests = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= MAX_REQUESTS_PER_HOUR) {
    return false;
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return true;
}

// Planos válidos
const VALID_PLANS = [
  "landing",
  "starter",
  "pro",
  "ultimate",
  "startup",
  "equity",
  "",
];

// Limites de tamanho
const MAX_NAME_LENGTH = 200;
const MAX_PHONE_LENGTH = 20;
const MAX_BODY_SIZE = 10 * 1024; // 10KB

export async function POST(request: Request) {
  try {
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    // 1. Rate limiting
    if (!checkRateLimit(clientIp)) {
      return Response.json({ error: "too_many_requests" }, { status: 429 });
    }

    // 2. Validar tamanho do body
    const contentLength = request.headers.get("content-length");
    if (!contentLength || parseInt(contentLength) > MAX_BODY_SIZE) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }

    const body = await request.json();
    const { lead_name, lead_email, lead_phone, interest_plan, turnstile_token } = body;

    // 3. Validar tipos
    if (
      typeof lead_name !== "string" ||
      typeof lead_email !== "string" ||
      typeof lead_phone !== "string" ||
      typeof turnstile_token !== "string"
    ) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }

    // 4. Validar tamanhos
    const trimmedName = lead_name.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }

    if (lead_phone.length === 0 || lead_phone.length > MAX_PHONE_LENGTH) {
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

    // 5. Validar plano
    const trimmedPlan = (typeof interest_plan === "string" ? interest_plan.trim() : "").toLowerCase();
    if (!VALID_PLANS.includes(trimmedPlan)) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }

    // 6. Verificar Turnstile
    if (!(await verifyTurnstile(turnstile_token, clientIp, "contact_form_submit"))) {
      return Response.json({ error: "turnstile_failed" }, { status: 403 });
    }

    // 8. Escrever no Firestore
    const normalizedEmail = lead_email.trim().toLowerCase();

    try {
      const adminDb = getAdminDb();
      const leadRef = adminDb.collection("leads").doc();

      const result = await adminDb.runTransaction(async (tx) => {
        const existing = await tx.get(
          adminDb
            .collection("leads")
            .where("lead_email", "==", normalizedEmail)
            .limit(1)
        );
        if (!existing.empty) {
          return { duplicate: true as const };
        }

        tx.set(leadRef, {
          id_linked_company: "1",
          lead_name: capitalizeName(trimmedName),
          lead_email: normalizedEmail,
          lead_phone,
          interest_plan: trimmedPlan,
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
    } catch {
      console.error("Firestore write error");
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
  } catch {
    console.error("Route handler error");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
