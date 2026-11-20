import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { sendDealEmail } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { isEmailConfigured } from "@/lib/admin/crm/email";
import { getAdminProfile } from "@/lib/admin/session";
import { EMAIL_MAX_BYTES, validateSendEmail } from "@/lib/admin/crm/validation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * E-mail pelo Resend para o contato/empresa da negociação: `{ to, subject, body }`.
 * Resposta: 200 { entry } (registro do histórico) · 400 · 401 · 404 · 502 send_failed · 503 email_not_configured.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, EMAIL_MAX_BYTES);
  if (guard instanceof Response) return guard;
  if (!isEmailConfigured()) return Response.json({ error: "email_not_configured" }, { status: 503 });
  const parsed = validateSendEmail(guard.body);
  if (!parsed.ok) return crmResponses.invalid();
  try {
    const profile = await getAdminProfile(guard.session);
    const entry = await sendDealEmail(id, parsed.value, guard.actor, profile.email);
    invalidateCrm(CRM_TAGS.deals);
    return Response.json({ entry, email: null });
  } catch (error) {
    return dealDetailErrorResponse(error, "deal email");
  }
}
