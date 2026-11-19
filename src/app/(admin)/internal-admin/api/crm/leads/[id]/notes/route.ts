import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { LeadNotFoundError, addLeadNote } from "@/lib/admin/crm/notes";
import { NOTE_MAX_BYTES, validateNoteText } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const invalidInput = () => Response.json({ error: "invalid_input" }, { status: 400 });

/**
 * Acrescenta uma observação na timeline: `{ text }`. Autor e horário vêm do servidor.
 * (A leitura das observações fica em `…/activity`, junto com os e-mails.)
 * Resposta: 201 { note } · 400 invalid_input · 401 · 404 not_found · 500.
 */
export async function POST(request: Request, { params }: Context) {
  const body = await readGuardedJson(request, NOTE_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return invalidInput();
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
