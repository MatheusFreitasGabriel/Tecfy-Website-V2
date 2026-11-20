import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { moveDeal } from "@/lib/admin/crm/deals";
import { dealErrorResponse, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { parseMoveDeal } from "@/lib/admin/crm/dealValidation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Arrastar no Kanban: `{ deal_id, stage_id, position, version }` → grava só esta negociação.
 * Resposta: 200 { move } · 400 · 401 · 404 · 409 pipeline_changed (etapa removida enquanto arrastava).
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request, 2048);
  if (guard instanceof Response) return guard;
  const parsed = parseMoveDeal(guard.body);
  if (!parsed) return crmResponses.invalid();
  try {
    const move = await moveDeal(parsed, guard.actor);
    invalidateCrm(CRM_TAGS.deals);
    return Response.json({ move });
  } catch (error) {
    return dealErrorResponse(error, "move deal");
  }
}
