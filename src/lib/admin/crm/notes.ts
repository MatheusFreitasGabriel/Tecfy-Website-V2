import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { COMPANIES_COLLECTION, CONTACTS_COLLECTION, LEADS_COLLECTION, type LeadNoteRow } from "./types";
import type { Actor } from "./leads";

/**
 * Timeline de observações (leads, contatos e empresas): {coleção}/{id}/notes.
 * Só acrescenta — não existe edição nem exclusão (registro histórico).
 * `kind: "system"` = registro automático (responsável, vínculo, dados alterados, retorno pelo site).
 */

export type NotesParent = typeof LEADS_COLLECTION | typeof CONTACTS_COLLECTION | typeof COMPANIES_COLLECTION;
export const NOTES_SUBCOLLECTION = "notes";

export class LeadNotFoundError extends Error {}
/** Registro pai (contato/empresa) não existe. */
export class ParentNotFoundError extends LeadNotFoundError {}

const toIso = (value: unknown) =>
  value && typeof (value as Timestamp).toDate === "function" ? (value as Timestamp).toDate().toISOString() : null;

/** Dados de um registro automático na timeline (para gravar dentro de um batch/transação). */
export function systemNoteData(text: string, author: { uid: string | null; name: string }) {
  return { kind: "system" as const, text, author_uid: author.uid, author_name: author.name, created_at: FieldValue.serverTimestamp() };
}

/** Observações de um registro, mais recentes primeiro. */
export async function listNotes(parent: NotesParent, id: string, limit = 100): Promise<LeadNoteRow[]> {
  const snap = await getAdminDb().collection(parent).doc(id).collection(NOTES_SUBCOLLECTION).orderBy("created_at", "desc").limit(limit).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    kind: doc.get("kind") === "system" ? "system" : "note",
    text: String(doc.get("text") ?? ""),
    author_name: typeof doc.get("author_name") === "string" ? doc.get("author_name") : null,
    created_at: toIso(doc.get("created_at")),
  }));
}

/**
 * Acrescenta uma observação (autor e horário do servidor) e devolve como ficou gravada.
 * Sem transação e sem tocar no documento pai: cada observação é um documento novo, então muitas
 * observações simultâneas não disputam nada (validado no teste de stress: 500/500).
 */
export async function addNote(parent: NotesParent, id: string, text: string, actor: Actor): Promise<LeadNoteRow> {
  const ref = getAdminDb().collection(parent).doc(id);
  if (!(await ref.get()).exists) throw parent === LEADS_COLLECTION ? new LeadNotFoundError() : new ParentNotFoundError();
  const noteRef = ref.collection(NOTES_SUBCOLLECTION).doc();
  const createdAt = Timestamp.now();
  await noteRef.create({ kind: "note", text, author_uid: actor.uid, author_name: actor.name, created_at: createdAt });
  return { id: noteRef.id, kind: "note", text, author_name: actor.name, created_at: createdAt.toDate().toISOString() };
}

// Atalhos usados pela tela de Leads.
export const listLeadNotes = (leadId: string, limit?: number) => listNotes(LEADS_COLLECTION, leadId, limit);
export const addLeadNote = (leadId: string, text: string, actor: Actor) => addNote(LEADS_COLLECTION, leadId, text, actor);
