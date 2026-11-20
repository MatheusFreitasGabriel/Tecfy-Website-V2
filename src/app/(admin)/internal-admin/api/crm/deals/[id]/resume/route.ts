import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { getDealDetail, resumeDeal } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Retoma a negociação pausada. Corpo: `{}`. Resposta: 200 { deal }. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 1024);
  if (guard instanceof Response) return guard;
  try {
    await resumeDeal(id, guard.actor);
    invalidateCrm(CRM_TAGS.deals);
    return Response.json({ deal: await getDealDetail(id) });
  } catch (error) {
    return dealDetailErrorResponse(error, "resume deal");
  }
}
