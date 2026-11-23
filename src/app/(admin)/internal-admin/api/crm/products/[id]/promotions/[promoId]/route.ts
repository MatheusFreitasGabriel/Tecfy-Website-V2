import { CRM_TAGS, invalidateSite, productTag } from "@/lib/admin/crm/cache";
import { guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { ProductNotFoundError } from "@/lib/admin/crm/products";
import { PromotionNotFoundError, endPromotion } from "@/lib/admin/crm/promotions";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `{ action: "end" }` → encerra agora a promoção ativa (ou cancela a agendada). Sai do site na hora.
 * Resposta: 200 { changed } · 404.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; promoId: string }> }) {
  const { id, promoId } = await params;
  if (!validId(id) || !validId(promoId)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 1024);
  if (guard instanceof Response) return guard;
  const { body, actor } = guard;
  if (body.action !== "end") return crmResponses.invalid();
  try {
    const result = await endPromotion(id, promoId, actor);
    if (result.changed) invalidateSite(CRM_TAGS.products, productTag(id));
    return Response.json(result);
  } catch (error) {
    if (error instanceof ProductNotFoundError || error instanceof PromotionNotFoundError) return crmResponses.notFound();
    console.error("crm end promotion error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
