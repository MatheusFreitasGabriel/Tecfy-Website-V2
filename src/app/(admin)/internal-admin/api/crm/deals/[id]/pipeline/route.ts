import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { getDealDetail, moveDealToPipeline } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Leva a negociação para outro funil: `{ pipeline_id, stage_id, version }`.
 * Resposta: 200 { deal } · 400 · 401 · 404 · 409 stale | pipeline_changed | deal_closed.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 1024);
  if (guard instanceof Response) return guard;
  const { pipeline_id, stage_id, version } = guard.body;
  if (!validId(String(pipeline_id ?? "")) || typeof stage_id !== "string" || !/^[a-z0-9]{4,24}$/.test(stage_id) || !Number.isInteger(version)) return crmResponses.invalid();
  try {
    await moveDealToPipeline(id, { pipeline_id: String(pipeline_id), stage_id, version: Number(version) }, guard.actor);
    invalidateCrm(CRM_TAGS.deals);
    return Response.json({ deal: await getDealDetail(id) });
  } catch (error) {
    return dealDetailErrorResponse(error, "move deal pipeline");
  }
}
