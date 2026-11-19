import { after } from "next/server";
import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { registerWebsiteLead } from "@/lib/admin/crm/websiteLead";
import { notifyNewWebsiteLead } from "@/lib/admin/notifyNewLead";
import { getClientIp } from "@/lib/admin/requestContext";
import { allowSiteSubmission } from "@/lib/siteRateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { validateEmail, validatePhone } from "@/shemas/validationSchema";
import { capitalizeName } from "@/utils/masks";

export const runtime = "nodejs";

// Planos válidos
const VALID_PLANS = ["landing", "starter", "pro", "ultimate", "startup", "equity", ""];

// Limites de tamanho
const MAX_NAME_LENGTH = 200;
const MAX_PHONE_LENGTH = 20;
const MAX_BODY_SIZE = 10 * 1024; // 10KB

const invalidInput = () => Response.json({ error: "invalid_input" }, { status: 400 });

/**
 * Formulário de contato do site.
 * Ordem (do mais barato ao mais caro): tamanho/JSON → validação → Turnstile → rate limit (Firestore)
 * → transação (contato + lead + notificação, ou "voltou pelo site") → avisos por e-mail/webhook.
 * O IP vem de x-real-ip / x-forwarded-for (definidos pela Vercel); nunca de cf-connecting-ip,
 * que o visitante consegue forjar quando o site não passa pelo proxy da Cloudflare.
 */
export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request.headers);

    // 1. Tamanho e JSON
    const contentLength = Number(request.headers.get("content-length") ?? "NaN");
    if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_SIZE) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }
    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_SIZE) return Response.json({ error: "payload_too_large" }, { status: 413 });
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalidInput();
      body = parsed as Record<string, unknown>;
    } catch {
      return invalidInput();
    }
    const { lead_name, lead_email, lead_phone, interest_plan, turnstile_token } = body;

    // 2. Validação
    if (typeof lead_name !== "string" || typeof lead_email !== "string" || typeof lead_phone !== "string" || typeof turnstile_token !== "string") {
      return invalidInput();
    }
    const trimmedName = lead_name.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH) return invalidInput();
    if (lead_phone.length === 0 || lead_phone.length > MAX_PHONE_LENGTH || !validatePhone(lead_phone)) return invalidInput();
    if (!validateEmail(lead_email) || lead_email.length > 254) return invalidInput();
    if (turnstile_token.length === 0 || turnstile_token.length > 4096) return invalidInput();
    const trimmedPlan = (typeof interest_plan === "string" ? interest_plan.trim() : "").toLowerCase();
    if (!VALID_PLANS.includes(trimmedPlan)) return invalidInput();

    // 3. Turnstile (antes de qualquer acesso ao banco: bot não gera custo nem gravação)
    if (!(await verifyTurnstile(turnstile_token, clientIp, "contact_form_submit"))) {
      return Response.json({ error: "turnstile_failed" }, { status: 403 });
    }

    // 4. Rate limit por IP (Firestore, vale entre instâncias)
    if (!(await allowSiteSubmission(clientIp))) {
      return Response.json({ error: "too_many_requests" }, { status: 429 });
    }

    // 5. Gravação (transação). Quem já é conhecido não é recusado: o retorno vai para o lead existente.
    const lead = {
      name: capitalizeName(trimmedName),
      email: lead_email.trim().toLowerCase(),
      phone: lead_phone.replace(/\D/g, ""),
      plan: trimmedPlan,
    };
    let result;
    try {
      result = await registerWebsiteLead(lead);
    } catch {
      console.error("Firestore write error");
      return Response.json({ error: "internal_error" }, { status: 500 });
    }

    // Lista do painel desatualizada → próxima leitura busca do Firestore.
    invalidateCrm(CRM_TAGS.leads, CRM_TAGS.contacts);

    // 6. E-mail para contato@ e webhook: depois da resposta, sem atrasar o visitante.
    after(() =>
      notifyNewWebsiteLead({ name: lead.name, email: lead.email, phone: lead.phone, planLabel: result.planLabel, returning: result.returning }),
    );

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    console.error("Route handler error");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
