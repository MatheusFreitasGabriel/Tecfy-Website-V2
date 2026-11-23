import { CRM_TAGS, getCachedProductOptions, invalidateCrm } from "@/lib/admin/crm/cache";
import { guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { PRODUCT_MAX_BYTES, validateProductForm, type ProductForm } from "@/lib/admin/crm/productValidation";
import { ProductNotFoundError, createProduct, duplicateProduct } from "@/lib/admin/crm/products";
import { crmResponses, guardRead, isDocId } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Produtos ativos para "Marcar como vendida" (só leitura). */
export async function GET(request: Request) {
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  try {
    return Response.json({ products: await getCachedProductOptions() });
  } catch (error) {
    console.error("crm products error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}

/**
 * Cria um produto: `{ request_id (UUID), product: ProductForm }` ou duplica um: `{ request_id, duplicate_of }`.
 * Idempotente pelo request_id.
 * Resposta: 201 { id } · 400 { fields } · 401.
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request, PRODUCT_MAX_BYTES);
  if (guard instanceof Response) return guard;
  const { body, actor } = guard;
  if (typeof body.request_id !== "string" || !UUID.test(body.request_id)) return crmResponses.invalid();
  if (body.duplicate_of !== undefined) {
    if (!isDocId(body.duplicate_of)) return crmResponses.invalid();
    try {
      const result = await duplicateProduct(body.duplicate_of, actor, body.request_id.toLowerCase());
      if (result.created) invalidateCrm(CRM_TAGS.products);
      return Response.json({ id: result.id }, { status: 201 });
    } catch (error) {
      if (error instanceof ProductNotFoundError) return crmResponses.notFound();
      console.error("crm duplicate product error", error instanceof Error ? error.message : "unknown");
      return crmResponses.internal();
    }
  }
  const parsed = validateProductForm((body.product ?? {}) as Partial<ProductForm>);
  if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
  try {
    const result = await createProduct(parsed.value, actor, body.request_id.toLowerCase());
    if (result.created) invalidateCrm(CRM_TAGS.products);
    return Response.json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error("crm create product error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
