import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { getDealDetail, pauseDeal } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { parsePause } from "@/lib/admin/crm/dealValidation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Pausa: `{ reason?, resume_date? }` (a data cria a tarefa "Retomar negociação"). Resposta: 200 { deal }. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 4 * 1024);
  if (guard instanceof Response) return guard;
  const parsed = parsePause(guard.body);
  if ("errors" in parsed) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
  try {
    await pauseDeal(id, parsed, guard.actor);
    invalidateCrm(CRM_TAGS.deals, CRM_TAGS.tasks);
    return Response.json({ deal: await getDealDetail(id) });
  } catch (error) {
    return dealDetailErrorResponse(error, "pause deal");
  }
}
