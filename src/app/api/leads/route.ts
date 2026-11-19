import { after } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { NOTIFICATIONS_COLLECTION, leadCreatedNotification, leadReturnedNotification } from "@/lib/admin/notifications";
import { systemNoteData } from "@/lib/admin/crm/notes";
import { notifyNewWebsiteLead } from "@/lib/admin/notifyNewLead";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { validateEmail, validatePhone } from "@/shemas/validationSchema";
import { capitalizeName, maskPhoneNumber } from "@/utils/masks";
import { verifyTurnstile } from "@/lib/turnstile";
import { CONTACTS_COLLECTION, LEADS_COLLECTION, LEAD_NOTES_SUBCOLLECTION, LEAD_SCHEMA_VERSION } from "@/lib/admin/crm/types";

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

    // 8. Escrever no Firestore: Contato (a pessoa) + Lead (a oportunidade) vinculados.
    //    Quem já é conhecido não é recusado: o retorno fica registrado no lead existente (lead quente).
    const normalizedEmail = lead_email.trim().toLowerCase();
    const personName = capitalizeName(trimmedName);
    const planLabel = trimmedPlan ? `Plano ${trimmedPlan.charAt(0).toUpperCase()}${trimmedPlan.slice(1)}` : "Website";

    try {
      const adminDb = getAdminDb();
      const leadRef = adminDb.collection(LEADS_COLLECTION).doc();
      const contactRef = adminDb.collection(CONTACTS_COLLECTION).doc();

      const phoneDigits = lead_phone.replace(/\D/g, "");

      const result = await adminDb.runTransaction(async (tx) => {
        // Já é conhecido? (contato com o mesmo e-mail, ou lead antigo do site com esse e-mail)
        const [existingContact, existingLegacyLead] = await Promise.all([
          tx.get(adminDb.collection(CONTACTS_COLLECTION).where("email", "==", normalizedEmail).limit(1)),
          tx.get(adminDb.collection(LEADS_COLLECTION).where("lead_email", "==", normalizedEmail).limit(1)),
        ]);
        const knownContactId = existingContact.empty ? null : existingContact.docs[0].id;

        // Lead mais recente desse contato (sem orderBy no Firestore para não exigir índice composto).
        let returningLead: DocumentReference | null = existingLegacyLead.empty ? null : existingLegacyLead.docs[0].ref;
        if (knownContactId) {
          const leadsOfContact = await tx.get(adminDb.collection(LEADS_COLLECTION).where("contact_id", "==", knownContactId).limit(20));
          const latest = leadsOfContact.docs.sort(
            (a, b) => (b.get("created_at")?.toMillis?.() ?? 0) - (a.get("created_at")?.toMillis?.() ?? 0),
          )[0];
          if (latest) returningLead = latest.ref;
        }

        const now = FieldValue.serverTimestamp();

        // Voltou pelo site: registra no lead que já existe e toca o sino de novo (não duplica o lead).
        if (returningLead) {
          tx.update(returningLead, { last_inbound_at: now, updated_at: now });
          tx.create(
            returningLead.collection(LEAD_NOTES_SUBCOLLECTION).doc(),
            systemNoteData(
              `Entrou em contato novamente pelo site. Dados enviados: ${personName} · ${normalizedEmail} · ${maskPhoneNumber(phoneDigits)} · interesse: ${planLabel}.`,
              { uid: null, name: "Website" },
            ),
          );
          tx.create(adminDb.collection(NOTIFICATIONS_COLLECTION).doc(), leadReturnedNotification(returningLead.id, personName, planLabel));
          return { returning: true };
        }

        // Lead novo. Se o contato já existe (o lead dele foi excluído), reaproveita o contato.
        const contactId = knownContactId ?? contactRef.id;
        if (!knownContactId) {
          tx.create(contactRef, {
            name: personName,
            email: normalizedEmail,
            phone: phoneDigits,
            role: null,
            preferred_channel: null,
            notes: null,
            comm_consent: "nao_informada",
            company_id: null,
            origin_lead_id: leadRef.id,
            created_by_uid: null,
            created_by_name: "Website",
            created_at: now,
            updated_at: now,
          });
        }

        tx.create(leadRef, {
          title: `${personName} · ${planLabel}`,
          // Contato rápido direto no lead (além do contato vinculado).
          email: normalizedEmail,
          phone: phoneDigits,
          owner_uid: null,
          owner_name: null,
          stage: "novo",
          qualification: "a_qualificar",
          status: "novo",
          source: "website",
          entry: "website",
          campaign: null,
          interest_plan: trimmedPlan || null,
          estimated_value_cents: null,
          expected_close_date: null,
          tags: [],
          notes: null,
          contact_id: contactId,
          company_id: null,
          schema_version: LEAD_SCHEMA_VERSION,
          created_by_uid: null,
          created_by_name: "Website",
          created_at: now,
          updated_at: now,
        });

        // Sino do painel: notificação gravada junto com o lead (tudo ou nada).
        tx.create(adminDb.collection(NOTIFICATIONS_COLLECTION).doc(), leadCreatedNotification(leadRef.id, personName, planLabel));
        return { returning: false };
      });

      // E-mail para contato@ e webhook: depois da resposta, sem atrasar o visitante.
      after(() =>
        notifyNewWebsiteLead({ name: personName, email: normalizedEmail, phone: phoneDigits, planLabel, returning: result.returning }),
      );

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
