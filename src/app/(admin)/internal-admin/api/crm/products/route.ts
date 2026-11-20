import { getCachedProductOptions } from "@/lib/admin/crm/cache";
import { crmResponses, guardRead } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Produtos ativos para "Marcar como venda" (só leitura). */
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
