import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { setPipelineArchived, updatePipeline } from "@/lib/admin/crm/deals";
import { dealErrorResponse, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { isDocId, validatePipelineForm, type PipelineForm } from "@/lib/admin/crm/dealValidation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edita o funil: `{ pipeline: PipelineForm, stage_moves?: { etapaRemovida: etapaDestino } }`
 * ou arquiva/restaura: `{ archived: boolean }`.
 * Resposta: 200 { pipeline, moved } | { archived } · 400 · 401 · 404/409.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDocId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request);
  if (guard instanceof Response) return guard;
  try {
    if (typeof guard.body.archived === "boolean") {
      if (!(await setPipelineArchived(id, guard.body.archived))) return crmResponses.notFound();
      invalidateCrm(CRM_TAGS.pipelines, CRM_TAGS.deals);
      return Response.json({ archived: guard.body.archived });
    }
    const parsed = guard.body.pipeline && typeof guard.body.pipeline === "object" ? validatePipelineForm(guard.body.pipeline as Partial<PipelineForm>) : null;
    if (!parsed) return crmResponses.invalid();
    if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
    const rawMoves = guard.body.stage_moves && typeof guard.body.stage_moves === "object" ? (guard.body.stage_moves as Record<string, unknown>) : {};
    const moves: Record<string, string> = {};
    for (const [from, to] of Object.entries(rawMoves).slice(0, 10)) if (typeof to === "string" && /^[a-z0-9]{4,24}$/.test(to)) moves[from] = to;
    const result = await updatePipeline(id, parsed.value, moves, guard.actor);
    invalidateCrm(CRM_TAGS.pipelines, CRM_TAGS.deals);
    return Response.json(result);
  } catch (error) {
    return dealErrorResponse(error, "update pipeline");
  }
}
