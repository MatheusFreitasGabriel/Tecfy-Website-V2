import { CRM_TAGS, invalidateSite } from "@/lib/admin/crm/cache";
import { guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { crmResponses, isDocId } from "@/lib/admin/crm/routeHelpers";
import { PublicationNotFoundError, publishSite, restorePublication } from "@/lib/admin/crm/siteCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Seção de planos do site:
 *  - `{ action: "publish" }` → publica o catálogo atual (produtos ativos marcados "no site");
 *  - `{ action: "restore", publication_id }` → volta para uma publicação anterior.
 * Resposta: 200 { plans } · 404.
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request, 1024);
  if (guard instanceof Response) return guard;
  const { body, actor } = guard;
  try {
    if (body.action === "publish") {
      const result = await publishSite(actor);
      invalidateSite(CRM_TAGS.products);
      return Response.json(result);
    }
    if (body.action === "restore" && isDocId(body.publication_id)) {
      const result = await restorePublication(body.publication_id, actor);
      invalidateSite();
      return Response.json(result);
    }
    return crmResponses.invalid();
  } catch (error) {
    if (error instanceof PublicationNotFoundError) return crmResponses.notFound();
    console.error("crm site publish error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
