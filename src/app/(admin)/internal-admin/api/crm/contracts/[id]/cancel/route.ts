import { CRM_TAGS, companyTag, invalidateCrm, productTag } from "@/lib/admin/crm/cache";
import { guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { parseCancel } from "@/lib/admin/crm/productValidation";
import { CancelDateError, ContractNotFoundError, cancelContract } from "@/lib/admin/crm/products";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Cancela um contrato: `{ date: "AAAA-MM-DD", reason, detail? }`. Sai do faturamento mensal; o mês do
 * cancelamento é o último cobrado. Registra na negociação e no produto. Idempotente.
 * Resposta: 200 { changed } · 400 { fields } · 404.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 4 * 1024);
  if (guard instanceof Response) return guard;
  const parsed = parseCancel(guard.body);
  if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
  try {
    const result = await cancelContract(id, parsed.value, guard.actor);
    if (result.changed) {
      // Faturamento, Cliente/Prospect da empresa e o histórico da negociação mudam.
      invalidateCrm(CRM_TAGS.contracts, CRM_TAGS.companies, CRM_TAGS.deals, productTag(result.productId), companyTag(result.companyId));
    }
    return Response.json({ changed: result.changed });
  } catch (error) {
    if (error instanceof ContractNotFoundError) return crmResponses.notFound();
    if (error instanceof CancelDateError) return Response.json({ error: "invalid_input", fields: { date: "A data é anterior à assinatura do contrato." } }, { status: 400 });
    console.error("crm cancel contract error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
