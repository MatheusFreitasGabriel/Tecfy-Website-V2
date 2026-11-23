import { CRM_TAGS, invalidateSite, productTag } from "@/lib/admin/crm/cache";
import { guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { validatePromotion, type PromotionForm } from "@/lib/admin/crm/productValidation";
import { ProductNotFoundError, getProduct } from "@/lib/admin/crm/products";
import { PromotionConflictError, PromotionPriceError, createPromotion } from "@/lib/admin/crm/promotions";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";
import { brazilDayKey } from "@/lib/site/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lança (ou agenda) uma promoção: `{ request_id (UUID), promotion: PromotionForm }`. Vai direto pro site.
 * Resposta: 201 { id } · 400 { fields } · 404 · 409 promotion_conflict (já existe ativa/agendada).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 4 * 1024);
  if (guard instanceof Response) return guard;
  const { body, actor } = guard;
  if (typeof body.request_id !== "string" || !UUID.test(body.request_id)) return crmResponses.invalid();
  try {
    const product = await getProduct(id);
    if (!product) return crmResponses.notFound();
    const now = Date.now();
    const parsed = validatePromotion((body.promotion ?? {}) as Partial<PromotionForm>, product, brazilDayKey(now), new Date(now).toISOString());
    if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
    const result = await createPromotion(id, parsed.value, actor, body.request_id.toLowerCase());
    if (result.created) invalidateSite(CRM_TAGS.products, productTag(id));
    return Response.json({ id: result.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ProductNotFoundError) return crmResponses.notFound();
    if (error instanceof PromotionConflictError) return Response.json({ error: "promotion_conflict" }, { status: 409 });
    if (error instanceof PromotionPriceError) return Response.json({ error: "invalid_input", fields: { value: "O desconto precisa deixar o preço menor que o atual." } }, { status: 400 });
    console.error("crm create promotion error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
