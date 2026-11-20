import { CRM_TAGS, companyTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { createDeal } from "@/lib/admin/crm/deals";
import { activePipelines, adminByUid, dealErrorResponse, freshDealRow, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { parseCreateDealPayload } from "@/lib/admin/crm/dealValidation";
import { getCachedAdmins } from "@/lib/admin/crm/cache";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cria uma negociação manual. Corpo: `{ request_id, deal: DealForm, contact_id?, company_id? }`
 * (contato OU empresa obrigatório). Idempotente pelo request_id.
 * Resposta: 201 { deal } · 400 · 401 · 409 pipeline_changed | missing_link · 500.
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request);
  if (guard instanceof Response) return guard;
  const [admins, pipelines] = await Promise.all([getCachedAdmins(), activePipelines()]);
  const parsed = parseCreateDealPayload(guard.body, admins.map((a) => a.uid), pipelines);
  if (!parsed) return crmResponses.invalid();
  const owner = await adminByUid(parsed.deal.owner_uid);
  if (!owner) return crmResponses.invalid();
  try {
    const { id } = await createDeal(parsed, owner, guard.actor);
    invalidateCrm(CRM_TAGS.deals, companyTag(parsed.company_id));
    return Response.json({ deal: await freshDealRow(id) }, { status: 201 });
  } catch (error) {
    return dealErrorResponse(error, "create deal");
  }
}
