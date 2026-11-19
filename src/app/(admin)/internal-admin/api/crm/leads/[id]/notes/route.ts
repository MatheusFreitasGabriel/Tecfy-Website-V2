import { hasValidAdminGate } from "@/lib/admin/gate";
import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { LeadNotFoundError, addLeadNote, listLeadNotes } from "@/lib/admin/crm/notes";
import { NOTE_MAX_BYTES, validateNoteText } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const isId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const invalidInput = () => Response.json({ error: "invalid_input" }, { status: 400 });

/**
 * Timeline de observações do lead: `{ notes }` (mais recentes primeiro).
 * Só leitura: gate do proxy + sessão (GET da mesma origem não manda Origin; ver rota de e-mails).
 */
export async function GET(request: Request, { params }: Context) {
  if (!(await hasValidAdminGate(request.headers))) return new Response(null, { status: 404 });
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isId(id)) return invalidInput();
  try {
    return Response.json({ notes: await listLeadNotes(id) });
  } catch (error) {
    console.error("crm list notes error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * Acrescenta uma observação: `{ text }`. Autor e horário vêm do servidor.
 * Resposta: 201 { note } · 400 invalid_input · 401 · 404 not_found · 500.
 */
export async function POST(request: Request, { params }: Context) {
  const body = await readGuardedJson(request, NOTE_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isId(id)) return invalidInput();
  const parsed = validateNoteText(body.text);
  if (!parsed.ok) return invalidInput();

  try {
    const profile = await getAdminProfile(session);
    const note = await addLeadNote(id, parsed.value, { uid: session.uid, name: profile.name ?? profile.email ?? session.uid });
    return Response.json({ note }, { status: 201 });
  } catch (error) {
    if (error instanceof LeadNotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    console.error("crm add note error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
