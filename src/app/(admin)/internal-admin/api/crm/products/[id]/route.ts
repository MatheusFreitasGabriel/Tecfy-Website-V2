import { CRM_TAGS, invalidateCrm, invalidateSite, productTag } from "@/lib/admin/crm/cache";
import { guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { PRODUCT_MAX_BYTES, validatePriceChange, validateProductForm, type ProductForm } from "@/lib/admin/crm/productValidation";
import { ProductInUseError, ProductNotFoundError, cancelPriceChange, deleteProduct, getProduct, moveProduct, schedulePriceChange, setProductActive, updateProduct } from "@/lib/admin/crm/products";
import { brazilDayKey } from "@/lib/site/plans";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown, label: string): Response {
  if (error instanceof ProductNotFoundError) return crmResponses.notFound();
  if (error instanceof ProductInUseError) return Response.json({ error: "product_in_use" }, { status: 409 });
  console.error(`crm ${label} error`, error instanceof Error ? error.message : "unknown");
  return crmResponses.internal();
}

/**
 * Edita o produto. Um destes corpos:
 *  - `{ product: ProductForm }` → cadastro completo (histórico com o que mudou);
 *  - `{ active: boolean }`      → ativar/desativar;
 *  - `{ move: "up" | "down" }`  → posição no catálogo;
 *  - `{ price_change: { new_price, effective_date } | null }` → agenda / cancela reajuste (vai direto pro site).
 * Resposta: 200 { changed } · 400 { fields } · 404.
 */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, PRODUCT_MAX_BYTES);
  if (guard instanceof Response) return guard;
  const { body, actor } = guard;
  try {
    if (body.move === "up" || body.move === "down") {
      await moveProduct(id, body.move);
      invalidateCrm(CRM_TAGS.products);
      return Response.json({ changed: true });
    }
    if ("price_change" in body) {
      if (body.price_change === null) {
        const result = await cancelPriceChange(id, actor);
        if (result.changed) invalidateSite(CRM_TAGS.products, productTag(id));
        return Response.json(result);
      }
      const snap = await getProduct(id);
      if (!snap) return crmResponses.notFound();
      const parsed = validatePriceChange((body.price_change ?? {}) as Record<string, unknown>, snap, brazilDayKey(Date.now()));
      if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
      await schedulePriceChange(id, parsed.value, actor);
      invalidateSite(CRM_TAGS.products, productTag(id));
      return Response.json({ changed: true });
    }
    if (typeof body.active === "boolean") {
      const result = await setProductActive(id, body.active, actor);
      if (result.changed) invalidateCrm(CRM_TAGS.products, productTag(id));
      return Response.json(result);
    }
    const parsed = validateProductForm((body.product ?? {}) as Partial<ProductForm>);
    if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
    const result = await updateProduct(id, parsed.value, actor);
    if (result.changed) invalidateCrm(CRM_TAGS.products, productTag(id));
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "update product");
  }
}

/** Exclui um produto que nunca foi vendido. Com contratos: 409 product_in_use (desative em vez disso). */
export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 1024);
  if (guard instanceof Response) return guard;
  try {
    await deleteProduct(id);
    invalidateCrm(CRM_TAGS.products, productTag(id));
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error, "delete product");
  }
}
