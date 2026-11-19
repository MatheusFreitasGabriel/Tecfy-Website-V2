import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { ParentNotFoundError, addNote, listNotes } from "@/lib/admin/crm/notes";
import { actorOf, crmResponses, guardRead, isDocId } from "@/lib/admin/crm/routeHelpers";
import { CONTACTS_COLLECTION } from "@/lib/admin/crm/types";
import { NOTE_MAX_BYTES, validateNoteText } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Timeline do contato: `{ notes }` (mais recentes primeiro). */
export async function GET(request: Request, { params }: Context) {
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!isDocId(id)) return crmResponses.invalid();
  try {
    return Response.json({ notes: await listNotes(CONTACTS_COLLECTION, id) });
  } catch (error) {
    console.error("crm contact notes error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}

/** Nova observação no contato: `{ text }`. Resposta: 201 { note } · 400 · 401 · 404 · 500. */
export async function POST(request: Request, { params }: Context) {
  const body = await readGuardedJson(request, NOTE_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return crmResponses.unauthorized();
  const { id } = await params;
  if (!isDocId(id)) return crmResponses.invalid();
  const parsed = validateNoteText(body.text);
  if (!parsed.ok) return crmResponses.invalid();
  try {
    return Response.json({ note: await addNote(CONTACTS_COLLECTION, id, parsed.value, await actorOf(session)) }, { status: 201 });
  } catch (error) {
    if (error instanceof ParentNotFoundError) return crmResponses.notFound();
    console.error("crm add contact note error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
