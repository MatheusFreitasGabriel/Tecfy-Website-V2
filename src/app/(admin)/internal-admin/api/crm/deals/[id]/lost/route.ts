import { CRM_TAGS, companyTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { getDealDetail, markDealLost } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { parseLost } from "@/lib/admin/crm/dealValidation";
import { lostReasons } from "@/lib/admin/crm/options";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Marca como perdida: `{ reason, detail? }` (motivo obrigatório). Resposta: 200 { deal } · 400 · 409 deal_closed (já vendida). */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 4 * 1024);
  if (guard instanceof Response) return guard;
  const parsed = parseLost(guard.body, lostReasons.options.map((o) => o.value));
  if ("errors" in parsed) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
  try {
    await markDealLost(id, parsed.reason, parsed.detail, guard.actor);
    const fresh = await getDealDetail(id);
    if (!fresh) return crmResponses.notFound();
    // Cliente/Prospect e o faturamento dependem dos contratos: empresas também mudam.
    invalidateCrm(CRM_TAGS.deals, CRM_TAGS.companies, companyTag(fresh.company?.id));
    return Response.json({ deal: fresh });
  } catch (error) {
    return dealDetailErrorResponse(error, "markDealLost");
  }
}
