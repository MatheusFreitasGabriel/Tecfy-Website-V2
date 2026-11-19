import "server-only";
import { createHash } from "node:crypto";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { CONTACTS_COLLECTION, LEADS_COLLECTION } from "./types";

/**
 * Índice de unicidade de e-mail dos contatos:
 *   contact_emails/{sha256(email)} → { contact_id, email, latest_lead_id }
 *
 * Por quê: transações que CONSULTAM ("existe contato com este e-mail?") travam faixas inteiras do
 * índice e se bloqueiam umas às outras sob carga (comprovado no teste de stress: 299/300 falharam).
 * Com um documento de id determinístico, a transação faz só leituras diretas: envios com e-mails
 * diferentes não disputam nada, e envios com o MESMO e-mail são serializados pelo Firestore.
 * `latest_lead_id` permite achar o lead do contato sem consulta (fluxo "voltou pelo site").
 */
export const CONTACT_EMAILS_COLLECTION = "contact_emails";

const normalize = (email: string) => email.trim().toLowerCase();

export function emailIndexRef(db: Firestore, email: string): DocumentReference {
  return db.collection(CONTACT_EMAILS_COLLECTION).doc(createHash("sha256").update(normalize(email)).digest("hex"));
}

export interface EmailIndexEntry {
  contactId: string;
  latestLeadId: string | null;
}

/** Dentro de uma transação (LEITURA — antes das escritas): dono do e-mail, ou null. Sem consultas. */
export async function readEmailIndex(tx: Transaction, db: Firestore, email: string): Promise<EmailIndexEntry | null> {
  const snap = await tx.get(emailIndexRef(db, email));
  const contactId = snap.get("contact_id");
  if (!snap.exists || typeof contactId !== "string" || !contactId) return null;
  const latest = snap.get("latest_lead_id");
  return { contactId, latestLeadId: typeof latest === "string" && latest ? latest : null };
}

/** Dentro de uma transação (fase de escrita): registra/atualiza o dono do e-mail e o último lead. */
export function writeEmailIndex(tx: Transaction, db: Firestore, email: string, contactId: string, latestLeadId?: string): void {
  tx.set(
    emailIndexRef(db, email),
    { contact_id: contactId, email: normalize(email), ...(latestLeadId ? { latest_lead_id: latestLeadId } : {}) },
    { merge: true },
  );
}

/**
 * FORA de transação, antes dela: garante o índice para contatos antigos (criados antes do índice).
 * Se o índice não existe mas há um contato com o e-mail, cria a entrada. Corrida é inofensiva:
 * `create` falha se outro já criou (ignorado). Depois disso a transação só precisa do índice.
 */
export async function ensureEmailIndex(db: Firestore, email: string): Promise<void> {
  const ref = emailIndexRef(db, email);
  if ((await ref.get()).exists) return;
  const legacy = await db.collection(CONTACTS_COLLECTION).where("email", "==", normalize(email)).limit(1).get();
  if (legacy.empty) return;
  const contactId = legacy.docs[0].id;
  // Último lead do contato (para o fluxo "voltou pelo site" registrar no lead certo).
  const leads = await db.collection(LEADS_COLLECTION).where("contact_id", "==", contactId).limit(20).get();
  const latest = leads.docs.sort((a, b) => (b.get("created_at")?.toMillis?.() ?? 0) - (a.get("created_at")?.toMillis?.() ?? 0))[0];
  await ref
    .create({ contact_id: contactId, email: normalize(email), ...(latest ? { latest_lead_id: latest.id } : {}) })
    .catch(() => undefined);
}

/** Dentro de uma transação (escrita): libera o e-mail antigo (contato trocou de e-mail). */
export function deleteEmailIndex(tx: Transaction, db: Firestore, email: string): void {
  tx.delete(emailIndexRef(db, email));
}
