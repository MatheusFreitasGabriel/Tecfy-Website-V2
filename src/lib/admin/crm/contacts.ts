import "server-only";
import { FieldPath, FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { deleteEmailIndex, ensureEmailIndex, readEmailIndex, writeEmailIndex } from "./contactIndex";
import { describeContactChanges } from "./diff";
import type { Actor } from "./leads";
import { NOTES_SUBCOLLECTION, systemNoteData } from "./notes";
import { contactChannels, contactConsents, entityStatuses, leadQualifications, leadStages, leadStatuses, type EntityStatus } from "./options";
import {
  COMPANIES_COLLECTION,
  CONTACTS_COLLECTION,
  LEADS_COLLECTION,
  type ContactData,
  type ContactDetail,
  type ContactRow,
  type LeadSummary,
} from "./types";
import { CONTACT_COMPANY_NONE } from "./validation";

/** O e-mail já pertence a outro contato (contatos têm e-mail único). */
export class DuplicateEmailError extends Error {
  constructor(public readonly owner: { id: string; name: string }) {
    super("duplicate_email");
  }
}
export class ContactNotFoundError extends Error {}
/** A empresa escolhida não existe. */
export class CompanyNotFoundError extends Error {}

export const CONTACTS_PAGE_SIZE = 2000;
export const CONTACTS_LIST_LIMIT = 10000;
const MAX_ATTEMPTS = 15;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const iso = (v: unknown): string | null => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate().toISOString() : null);
const statusOf = (v: unknown): EntityStatus => (entityStatuses.is(v) ? v : "ativo");

/** Empresas por id (só os campos do nome), em lotes. */
async function companyNames(ids: Set<string>): Promise<Map<string, string>> {
  const db = getAdminDb();
  const list = [...ids];
  const out = new Map<string, string>();
  for (let i = 0; i < list.length; i += 300) {
    const snaps = await db.getAll(...list.slice(i, i + 300).map((id) => db.collection(COMPANIES_COLLECTION).doc(id)), {
      fieldMask: ["trade_name"],
    });
    for (const s of snaps) if (s.exists) out.set(s.id, str(s.get("trade_name")) ?? "Sem nome");
  }
  return out;
}

function toContactRow(doc: DocumentSnapshot, companies: Map<string, string>): ContactRow {
  const d = doc.data() ?? {};
  const companyId = str(d.company_id);
  return {
    id: doc.id,
    name: str(d.name) ?? "Sem nome",
    role: str(d.role),
    email: str(d.email),
    phone: str(d.phone),
    status: statusOf(d.status),
    company: companyId && companies.has(companyId) ? { id: companyId, name: companies.get(companyId)! } : null,
    created_at: iso(d.created_at),
  };
}

export interface PageCursor {
  s: number;
  n: number;
  id: string;
}

/** Uma página de contatos (mais recentes primeiro), com o nome da empresa. Cursor exato (data + id). */
export async function listContactsPage(after: PageCursor | null, size = CONTACTS_PAGE_SIZE): Promise<{ rows: ContactRow[]; next: PageCursor | null }> {
  let query = getAdminDb().collection(CONTACTS_COLLECTION).orderBy("created_at", "desc").orderBy(FieldPath.documentId(), "desc");
  if (after) query = query.startAfter(new Timestamp(after.s, after.n), after.id);
  const snap = await query.limit(size).get();
  const ids = new Set(snap.docs.map((d) => str(d.get("company_id"))).filter((v): v is string => Boolean(v)));
  const companies = await companyNames(ids);
  const last = snap.docs[snap.docs.length - 1];
  const ts = last?.get("created_at") as Timestamp | undefined;
  return {
    rows: snap.docs.map((d) => toContactRow(d, companies)),
    next: snap.size === size && ts && typeof ts.seconds === "number" ? { s: ts.seconds, n: ts.nanoseconds, id: last.id } : null,
  };
}

export function toLeadSummary(doc: DocumentSnapshot): LeadSummary {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    title: str(d.title) ?? str(d.lead_name) ?? "Sem nome",
    stage: leadStages.is(d.stage) ? d.stage : "novo",
    qualification: leadQualifications.is(d.qualification) ? d.qualification : "a_qualificar",
    status: leadStatuses.is(d.status) ? d.status : "novo",
    owner_name: str(d.owner_name),
    created_at: iso(d.created_at),
  };
}

const byNewest = (a: { created_at: string | null }, b: { created_at: string | null }) => (b.created_at ?? "").localeCompare(a.created_at ?? "");

/** Página do contato: dados + empresa + leads dele. null = não existe. */
export async function getContactDetail(id: string): Promise<ContactDetail | null> {
  const db = getAdminDb();
  const [doc, leads] = await Promise.all([
    db.collection(CONTACTS_COLLECTION).doc(id).get(),
    db.collection(LEADS_COLLECTION).where("contact_id", "==", id).limit(100).get(),
  ]);
  if (!doc.exists) return null;
  const companyId = str(doc.get("company_id"));
  const companies = companyId ? await companyNames(new Set([companyId])) : new Map<string, string>();
  const d = doc.data() ?? {};
  return {
    ...toContactRow(doc, companies),
    preferred_channel: contactChannels.is(d.preferred_channel) ? d.preferred_channel : null,
    comm_consent: contactConsents.is(d.comm_consent) ? d.comm_consent : "nao_informada",
    notes: str(d.notes),
    created_by_name: str(d.created_by_name),
    leads: leads.docs.map(toLeadSummary).sort(byNewest),
  };
}

/** company_choice do formulário → id da empresa ou null. ("Empresa do lead" não existe fora do lead.) */
function companyIdOf(choice: string): string | null {
  return choice && choice !== CONTACT_COMPANY_NONE && !choice.startsWith("__") ? choice : null;
}

type ContactInput = ContactData & { company_choice: string };

/** Cria um contato avulso (tela Contatos ou "Adicionar funcionário"). E-mail único. */
export async function createContact(input: ContactInput, actor: Actor, forcedCompanyId?: string): Promise<ContactRow> {
  const db = getAdminDb();
  const ref = db.collection(CONTACTS_COLLECTION).doc();
  const companyId = forcedCompanyId ?? companyIdOf(input.company_choice);
  if (input.email) await ensureEmailIndex(db, input.email);

  const companyName = await db.runTransaction(
    async (tx) => {
      // Leituras
      const owner = input.email ? await readEmailIndex(tx, db, input.email) : null;
      const company = companyId ? await tx.get(db.collection(COMPANIES_COLLECTION).doc(companyId)) : null;
      if (company && !company.exists) throw new CompanyNotFoundError();
      if (owner) {
        const existing = await tx.get(db.collection(CONTACTS_COLLECTION).doc(owner.contactId));
        throw new DuplicateEmailError({ id: owner.contactId, name: str(existing.get("name")) ?? "outro contato" });
      }
      // Escritas
      const { company_choice: _choice, ...data } = input;
      void _choice;
      const now = FieldValue.serverTimestamp();
      tx.create(ref, {
        ...data,
        company_id: companyId,
        status: "ativo",
        origin_lead_id: null,
        created_by_uid: actor.uid,
        created_by_name: actor.name,
        created_at: now,
        updated_at: now,
      });
      if (input.email) writeEmailIndex(tx, db, input.email, ref.id);
      if (company) {
        tx.create(company.ref.collection(NOTES_SUBCOLLECTION).doc(), systemNoteData(`Funcionário adicionado: ${input.name}.`, actor));
      }
      return company ? (str(company.get("trade_name")) ?? "Sem nome") : null;
    },
    { maxAttempts: MAX_ATTEMPTS },
  );

  return {
    id: ref.id,
    name: input.name,
    role: input.role,
    email: input.email,
    phone: input.phone,
    status: "ativo",
    company: companyId && companyName ? { id: companyId, name: companyName } : null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Edita o contato. Nada é sobrescrito sem rastro: grava na timeline "Campo: antes → depois".
 * Trocar o e-mail move o índice de unicidade (falha se o novo e-mail já for de outro contato).
 * Retorna o detalhe atualizado (sem leads) e se algo mudou.
 */
export async function updateContact(id: string, input: ContactInput, actor: Actor): Promise<{ changed: boolean; companyIds: string[] }> {
  const db = getAdminDb();
  const ref = db.collection(CONTACTS_COLLECTION).doc(id);
  if (input.email) await ensureEmailIndex(db, input.email);

  return db.runTransaction(
    async (tx) => {
      // Leituras
      const current = await tx.get(ref);
      if (!current.exists) throw new ContactNotFoundError();
      const before = current.data() ?? {};
      const oldEmail = str(before.email);
      const newEmail = input.email;
      const emailChanged = (oldEmail ?? "") !== (newEmail ?? "");
      const owner = emailChanged && newEmail ? await readEmailIndex(tx, db, newEmail) : null;
      const oldIndex = emailChanged && oldEmail ? await readEmailIndex(tx, db, oldEmail) : null;

      const newCompanyId = companyIdOf(input.company_choice);
      const oldCompanyId = str(before.company_id);
      const companyChanged = newCompanyId !== oldCompanyId;
      const companySnaps = companyChanged
        ? await Promise.all([newCompanyId, oldCompanyId].map((cid) => (cid ? tx.get(db.collection(COMPANIES_COLLECTION).doc(cid)) : null)))
        : [null, null];
      const [newCompany, oldCompany] = companySnaps;
      if (companyChanged && newCompanyId && !newCompany?.exists) throw new CompanyNotFoundError();
      if (owner && owner.contactId !== id) {
        const other = await tx.get(db.collection(CONTACTS_COLLECTION).doc(owner.contactId));
        throw new DuplicateEmailError({ id: owner.contactId, name: str(other.get("name")) ?? "outro contato" });
      }

      // O que mudou
      const { company_choice: _choice, ...data } = input;
      void _choice;
      const changes = describeContactChanges(before, data);
      if (companyChanged) {
        const name = (snap: DocumentSnapshot | null | undefined) => (snap?.exists ? (str(snap.get("trade_name")) ?? "Sem nome") : "—");
        changes.push(`Empresa: ${name(oldCompany)} → ${name(newCompany)}`);
      }
      // Empresas cuja página mostra este contato (para invalidar só elas).
      const companyIds = [oldCompanyId, newCompanyId].filter((v): v is string => Boolean(v));
      if (!changes.length) return { changed: false, companyIds };

      // Escritas
      tx.update(ref, { ...data, company_id: newCompanyId, updated_at: FieldValue.serverTimestamp() });
      if (emailChanged) {
        if (oldEmail && oldIndex?.contactId === id) deleteEmailIndex(tx, db, oldEmail);
        if (newEmail) writeEmailIndex(tx, db, newEmail, id, oldIndex?.latestLeadId ?? undefined);
      }
      tx.create(ref.collection(NOTES_SUBCOLLECTION).doc(), systemNoteData(`Dados alterados — ${changes.join(" · ")}.`, actor));
      if (companyChanged) {
        if (newCompany?.exists) tx.create(newCompany.ref.collection(NOTES_SUBCOLLECTION).doc(), systemNoteData(`Funcionário adicionado: ${data.name}.`, actor));
        if (oldCompany?.exists) tx.create(oldCompany.ref.collection(NOTES_SUBCOLLECTION).doc(), systemNoteData(`Funcionário saiu da empresa: ${data.name}.`, actor));
      }
      return { changed: true, companyIds };
    },
    { maxAttempts: MAX_ATTEMPTS },
  );
}

/** Ativa/inativa o contato (não apaga). Registra na timeline. */
export async function setContactStatus(id: string, status: EntityStatus, actor: Actor): Promise<{ changed: boolean; companyId: string | null }> {
  const db = getAdminDb();
  const ref = db.collection(CONTACTS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) throw new ContactNotFoundError();
    const before = statusOf(current.get("status"));
    const companyId = str(current.get("company_id"));
    if (before === status) return { changed: false, companyId };
    tx.update(ref, { status, updated_at: FieldValue.serverTimestamp() });
    tx.create(
      ref.collection(NOTES_SUBCOLLECTION).doc(),
      systemNoteData(`Status: ${entityStatuses.label(before)} → ${entityStatuses.label(status)}.`, actor),
    );
    return { changed: true, companyId };
  });
}
