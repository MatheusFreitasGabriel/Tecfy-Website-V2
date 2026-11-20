import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { bulkUpdateDeals } from "@/lib/admin/crm/deals";
import { adminByUid, dealErrorResponse, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { parseBulkDeals } from "@/lib/admin/crm/dealValidation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ações em massa na lista: `{ ids (≤200), action: set_status|set_owner|set_qualification|set_stage, value }`.
 * Vendida/perdida não são em massa (têm fluxo próprio). Resposta: 200 { ids, owner? }.
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request, 16 * 1024);
  if (guard instanceof Response) return guard;
  const parsed = parseBulkDeals(guard.body);
  if (!parsed) return crmResponses.invalid();
  const owner = parsed.action === "set_owner" ? await adminByUid(parsed.value) : null;
  if (parsed.action === "set_owner" && !owner) return crmResponses.invalid();
  try {
    const ids = await bulkUpdateDeals(parsed, owner, guard.actor);
    if (ids.length) invalidateCrm(CRM_TAGS.deals);
    return Response.json({ ids, owner });
  } catch (error) {
    return dealErrorResponse(error, "bulk deals");
  }
}
