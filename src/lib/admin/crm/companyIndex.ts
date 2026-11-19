import "server-only";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { COMPANIES_COLLECTION } from "./types";

/**
 * Índice de unicidade de CNPJ das empresas: company_cnpjs/{cnpj (só dígitos)} → { company_id }.
 * Mesmo padrão do índice de e-mail dos contatos: a transação só faz leitura direta por id
 * (nada de consulta), então cadastros simultâneos com o mesmo CNPJ não criam duas empresas.
 */
export const COMPANY_CNPJS_COLLECTION = "company_cnpjs";

const digits = (cnpj: string) => cnpj.replace(/\D/g, "");

export function cnpjIndexRef(db: Firestore, cnpj: string): DocumentReference {
  return db.collection(COMPANY_CNPJS_COLLECTION).doc(digits(cnpj));
}

/** Dentro de uma transação (LEITURA): empresa dona do CNPJ, ou null. */
export async function readCnpjIndex(tx: Transaction, db: Firestore, cnpj: string): Promise<string | null> {
  const snap = await tx.get(cnpjIndexRef(db, cnpj));
  const id = snap.get("company_id");
  return snap.exists && typeof id === "string" && id ? id : null;
}

/** Dentro de uma transação (escrita): registra o CNPJ como da empresa. */
export function writeCnpjIndex(tx: Transaction, db: Firestore, cnpj: string, companyId: string): void {
  tx.set(cnpjIndexRef(db, cnpj), { company_id: companyId, cnpj: digits(cnpj) });
}

/** Dentro de uma transação (escrita): libera o CNPJ antigo (empresa trocou de CNPJ). */
export function deleteCnpjIndex(tx: Transaction, db: Firestore, cnpj: string): void {
  tx.delete(cnpjIndexRef(db, cnpj));
}

/** FORA de transação, antes dela: cria a entrada para empresas antigas (antes do índice). */
export async function ensureCnpjIndex(db: Firestore, cnpj: string): Promise<void> {
  const ref = cnpjIndexRef(db, cnpj);
  if ((await ref.get()).exists) return;
  const legacy = await db.collection(COMPANIES_COLLECTION).where("cnpj", "==", digits(cnpj)).limit(1).get();
  if (legacy.empty) return;
  await ref.create({ company_id: legacy.docs[0].id, cnpj: digits(cnpj) }).catch(() => undefined);
}
