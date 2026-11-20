import { CRM_TAGS, companyTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { deleteDeal, getDealDetail, updateDeal } from "@/lib/admin/crm/dealDetail";
import { adminByUid, dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { parseDealUpdate } from "@/lib/admin/crm/dealValidation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Edita a negociação: `{ version, changes: { title?, value?, expected_close_date?, qualification?,
 * status?, context?, owner_uid?, stage_id?, custom? } }`. Cada campo alterado vai para o histórico.
 * Resposta: 200 { deal } · 400 { fields } · 401 · 404 · 409 stale (alguém mudou antes) | deal_closed.
 */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request);
  if (guard instanceof Response) return guard;
  const parsed = parseDealUpdate(guard.body);
  if (!parsed) return crmResponses.invalid();
  if ("errors" in parsed) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
  const owner = parsed.changes.owner_uid ? await adminByUid(parsed.changes.owner_uid) : null;
  if (parsed.changes.owner_uid && !owner) return crmResponses.invalid();
  try {
    await updateDeal(id, parsed.version, parsed.changes, owner, guard.actor);
    const deal = await getDealDetail(id);
    invalidateCrm(CRM_TAGS.deals, companyTag(deal?.company?.id));
    return Response.json({ deal });
  } catch (error) {
    return dealDetailErrorResponse(error, "update deal");
  }
}

/**
 * Exclui a negociação (criada por engano). Vendida não (409 deal_sold). O lead de origem volta a
 * poder ser convertido; contato/empresa/lead não são apagados. Corpo: `{}`. Resposta: 200 { ok }.
 */
export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 1024);
  if (guard instanceof Response) return guard;
  try {
    const { leadId, companyId } = await deleteDeal(id, guard.actor);
    invalidateCrm(CRM_TAGS.deals, CRM_TAGS.tasks, leadId ? CRM_TAGS.leads : null, companyTag(companyId));
    return Response.json({ ok: true });
  } catch (error) {
    return dealDetailErrorResponse(error, "delete deal");
  }
}
