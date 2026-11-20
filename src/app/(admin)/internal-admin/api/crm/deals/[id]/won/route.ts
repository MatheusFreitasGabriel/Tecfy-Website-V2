import { CRM_TAGS, companyTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { getDealDetail, markDealWon } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { parseWon } from "@/lib/admin/crm/dealValidation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Marca como vendida: `{ product_id, monthly_value: "R$ 1.200,00", signed_date: "AAAA-MM-DD" }`.
 * Cria o contrato (empresa vira Cliente; entra no faturamento). Exige empresa vinculada.
 * Resposta: 200 { deal } · 400 { fields } · 401 · 404 · 409 needs_company.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 4 * 1024);
  if (guard instanceof Response) return guard;
  const parsed = parseWon(guard.body);
  if ("errors" in parsed) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
  try {
    await markDealWon(id, parsed, guard.actor);
    const fresh = await getDealDetail(id);
    if (!fresh) return crmResponses.notFound();
    // Cliente/Prospect e o faturamento dependem dos contratos: empresas também mudam.
    invalidateCrm(CRM_TAGS.deals, CRM_TAGS.companies, companyTag(fresh.company?.id));
    return Response.json({ deal: fresh });
  } catch (error) {
    return dealDetailErrorResponse(error, "markDealWon");
  }
}
