import { hasValidAdminGate } from "@/lib/admin/gate";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedCompanyOptions, getCachedContactOptions } from "@/lib/admin/crm/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cadastros para as buscas "contato/empresa existente": `GET ?type=contacts|companies` → `{ options }`.
 * Chamado só quando um modal que precisa abre (antes vinha em todo carregamento da tela).
 * Cacheado no servidor; invalidado quando um contato/empresa é criado.
 */
export async function GET(request: Request) {
  if (!(await hasValidAdminGate(request.headers))) return new Response(null, { status: 404 });
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const type = new URL(request.url).searchParams.get("type");
  try {
    if (type === "contacts") return Response.json({ options: await getCachedContactOptions() });
    if (type === "companies") return Response.json({ options: await getCachedCompanyOptions() });
    return Response.json({ error: "invalid_input" }, { status: 400 });
  } catch (error) {
    console.error("crm options error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
