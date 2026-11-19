import { hasValidAdminGate } from "@/lib/admin/gate";
import { getAdminSession } from "@/lib/admin/session";
import { isEmailConfigured, listLeadEmails } from "@/lib/admin/crm/email";
import { listLeadNotes } from "@/lib/admin/crm/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Tudo que o painel de detalhes precisa, numa requisição: `{ notes, emails, emailConfigured }`.
 * (Antes eram 2 GETs a cada abertura; agora 1, e a tela guarda em memória por lead.)
 * Só leitura: gate do proxy + sessão (GET da mesma origem não manda Origin).
 */
export async function GET(request: Request, { params }: Context) {
  if (!(await hasValidAdminGate(request.headers))) return new Response(null, { status: 404 });
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return Response.json({ error: "invalid_input" }, { status: 400 });
  try {
    const [notes, emails] = await Promise.all([listLeadNotes(id), listLeadEmails(id)]);
    return Response.json({ notes, emails, emailConfigured: isEmailConfigured() });
  } catch (error) {
    console.error("crm lead activity error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
