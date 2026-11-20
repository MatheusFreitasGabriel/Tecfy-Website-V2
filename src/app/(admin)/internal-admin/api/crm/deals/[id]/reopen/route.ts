import { CRM_TAGS, companyTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { getDealDetail, reopenDeal } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";

import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Reabre (desfaz venda — remove o contrato — ou perda). Corpo: `{}`. Resposta: 200 { deal }. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 4 * 1024);
  if (guard instanceof Response) return guard;

  try {
    await reopenDeal(id, guard.actor);
    const fresh = await getDealDetail(id);
    if (!fresh) return crmResponses.notFound();
    // Cliente/Prospect e o faturamento dependem dos contratos: empresas também mudam.
    invalidateCrm(CRM_TAGS.deals, CRM_TAGS.companies, companyTag(fresh.company?.id));
    return Response.json({ deal: fresh });
  } catch (error) {
    return dealDetailErrorResponse(error, "reopenDeal");
  }
}
