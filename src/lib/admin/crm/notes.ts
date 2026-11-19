import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { LEAD_NOTES_SUBCOLLECTION, LEADS_COLLECTION, type LeadNoteRow } from "./types";
import type { Actor } from "./leads";

/**
 * Timeline de observações do lead (leads/{id}/notes). As observações são só acrescentadas:
 * não existe edição nem exclusão — ficam como registro histórico.
 * `kind: "system"` = registro automático (responsável atribuído, contato vinculado, retorno pelo site).
 */

export class LeadNotFoundError extends Error {}

const toIso = (value: unknown) =>
  value && typeof (value as Timestamp).toDate === "function" ? (value as Timestamp).toDate().toISOString() : null;

/** Dados de um registro automático na timeline (para gravar dentro de um batch/transação). */
export function systemNoteData(text: string, author: { uid: string | null; name: string }) {
  return { kind: "system" as const, text, author_uid: author.uid, author_name: author.name, created_at: FieldValue.serverTimestamp() };
}

/** Observações do lead, mais recentes primeiro. */
export async function listLeadNotes(leadId: string, limit = 100): Promise<LeadNoteRow[]> {
  const snap = await getAdminDb()
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(LEAD_NOTES_SUBCOLLECTION)
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    kind: doc.get("kind") === "system" ? "system" : "note",
    text: String(doc.get("text") ?? ""),
    author_name: typeof doc.get("author_name") === "string" ? doc.get("author_name") : null,
    created_at: toIso(doc.get("created_at")),
  }));
}

/**
 * Acrescenta uma observação (com autor e horário do servidor) e devolve como ficou gravada.
 * Sem transação e sem tocar no documento do lead: cada observação é um documento novo, então
 * muitas observações ao mesmo tempo no mesmo lead não disputam nada (o teste de stress com
 * transação + updated_at no lead perdia 498 de 500).
 */
export async function addLeadNote(leadId: string, text: string, actor: Actor): Promise<LeadNoteRow> {
  const leadRef = getAdminDb().collection(LEADS_COLLECTION).doc(leadId);
  if (!(await leadRef.get()).exists) throw new LeadNotFoundError();
  const noteRef = leadRef.collection(LEAD_NOTES_SUBCOLLECTION).doc();
  // Horário fixado aqui (servidor) para poder devolver a nota já pronta para a timeline.
  const createdAt = Timestamp.now();
  await noteRef.create({ kind: "note", text, author_uid: actor.uid, author_name: actor.name, created_at: createdAt });
  return { id: noteRef.id, kind: "note", text, author_name: actor.name, created_at: createdAt.toDate().toISOString() };
}
