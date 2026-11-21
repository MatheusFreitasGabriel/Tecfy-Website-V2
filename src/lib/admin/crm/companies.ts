import "server-only";
import { FieldPath, FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { deleteCnpjIndex, ensureCnpjIndex, readCnpjIndex, writeCnpjIndex } from "./companyIndex";
import { ContactNotFoundError, createContact, toLeadSummary, type PageCursor } from "./contacts";
import { describeCompanyChanges } from "./diff";
import type { Actor } from "./leads";
import { NOTES_SUBCOLLECTION, systemNoteData } from "./notes";
import { companyRegions, companySegments, companySizes, entityStatuses, type EntityStatus } from "./options";
import {
  COMPANIES_COLLECTION,
  CONTACTS_COLLECTION,
  CONTRACTS_COLLECTION,
  DEALS_COLLECTION,
  LEADS_COLLECTION,
  type CompanyData,
  type CompanyDetail,
  type CompanyRow,
  type ContactData,
  type ContactRow,
  type ContractSummary,
  type DealSummary,
} from "./types";

/** O CNPJ já pertence a outra empresa (empresas têm CNPJ único). */
export class DuplicateCnpjError extends Error {
  constructor(public readonly owner: { id: string; name: string }) {
    super("duplicate_cnpj");
  }
}
export class CompanyMissingError extends Error {}

export const COMPANIES_PAGE_SIZE = 2000;
export const COMPANIES_LIST_LIMIT = 10000;
const MAX_ATTEMPTS = 15;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const iso = (v: unknown): string | null => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate().toISOString() : null);
const statusOf = (v: unknown): EntityStatus => (entityStatuses.is(v) ? v : "ativo");

/** Empresas com pelo menos um contrato ativo (= Cliente). Uma consulta só, só o campo company_id. */
export async function activeClientIds(): Promise<Set<string>> {
  const snap = await getAdminDb().collection(CONTRACTS_COLLECTION).where("status", "==", "active").select("company_id").get();
  return new Set(snap.docs.map((d) => str(d.get("company_id"))).filter((v): v is string => Boolean(v)));
}

function toCompanyRow(doc: DocumentSnapshot, clients: Set<string>): CompanyRow {
  const d = doc.data() ?? {};
  const address = (d.address ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    trade_name: str(d.trade_name) ?? "Sem nome",
    legal_name: str(d.legal_name),
    cnpj: str(d.cnpj),
    segment: companySegments.is(d.segment) ? d.segment : null,
    size: companySizes.is(d.size) ? d.size : null,
    email: str(d.email),
    phone: str(d.phone),
    website: str(d.website),
    city: str(address.city),
    region: companyRegions.is(address.region) ? address.region : null,
    status: statusOf(d.status),
    is_client: clients.has(doc.id),
    created_at: iso(d.created_at),
  };
}

/** Uma página de empresas (mais recentes primeiro). Cursor exato (data + id). */
export async function listCompaniesPage(
  after: PageCursor | null,
  clients: Set<string>,
  size = COMPANIES_PAGE_SIZE,
): Promise<{ rows: CompanyRow[]; next: PageCursor | null }> {
  let query = getAdminDb().collection(COMPANIES_COLLECTION).orderBy("created_at", "desc").orderBy(FieldPath.documentId(), "desc");
  if (after) query = query.startAfter(new Timestamp(after.s, after.n), after.id);
  const snap = await query.limit(size).get();
  const last = snap.docs[snap.docs.length - 1];
  const ts = last?.get("created_at") as Timestamp | undefined;
  return {
    rows: snap.docs.map((d) => toCompanyRow(d, clients)),
    next: snap.size === size && ts && typeof ts.seconds === "number" ? { s: ts.seconds, n: ts.nanoseconds, id: last.id } : null,
  };
}

const byNewest = (a: { created_at: string | null }, b: { created_at: string | null }) => (b.created_at ?? "").localeCompare(a.created_at ?? "");

/** Página da empresa: dados + funcionários + leads + negociações + produtos/contratos. null = não existe. */
export async function getCompanyDetail(id: string): Promise<CompanyDetail | null> {
  const db = getAdminDb();
  const [doc, employees, leads, deals, contracts] = await Promise.all([
    db.collection(COMPANIES_COLLECTION).doc(id).get(),
    db.collection(CONTACTS_COLLECTION).where("company_id", "==", id).limit(300).get(),
    db.collection(LEADS_COLLECTION).where("company_id", "==", id).limit(100).get(),
    db.collection(DEALS_COLLECTION).where("company_id", "==", id).limit(100).get(),
    db.collection(CONTRACTS_COLLECTION).where("company_id", "==", id).limit(100).get(),
  ]);
  if (!doc.exists) return null;

  const contractRows: ContractSummary[] = contracts.docs.map((c) => ({
    id: c.id,
    product_name: str(c.get("product_name")) ?? "Produto",
    monthly_value: typeof c.get("monthly_value") === "number" ? c.get("monthly_value") : 0,
    status: c.get("status") === "active" ? "active" : "cancelled",
    signed_at: iso(c.get("signed_at")),
  }));
  const isClient = contractRows.some((c) => c.status === "active");
  const d = doc.data() ?? {};
  const address = (d.address ?? {}) as Record<string, unknown>;
  const companyName = str(d.trade_name) ?? "Sem nome";

  const employeeRows: ContactRow[] = employees.docs
    .map((c) => ({
      id: c.id,
      name: str(c.get("name")) ?? "Sem nome",
      role: str(c.get("role")),
      email: str(c.get("email")),
      phone: str(c.get("phone")),
      status: statusOf(c.get("status")),
      company: { id, name: companyName },
      created_at: iso(c.get("created_at")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const dealRows: DealSummary[] = deals.docs
    .map((x) => ({
      id: x.id,
      title: str(x.get("title")) ?? "Sem nome",
      status: str(x.get("status")) ?? "open",
      owner_name: str(x.get("owner_name")),
      estimated_value_cents: typeof x.get("estimated_value_cents") === "number" ? x.get("estimated_value_cents") : null,
      created_at: iso(x.get("created_at")),
    }))
    .sort(byNewest);

  return {
    ...toCompanyRow(doc, new Set(isClient ? [id] : [])),
    website: str(d.website),
    address: {
      street: str(address.street),
      number: str(address.number),
      zip: str(address.zip),
      district: str(address.district),
      city: str(address.city),
      region: companyRegions.is(address.region) ? address.region : null,
    },
    notes: str(d.notes),
    created_by_name: str(d.created_by_name),
    employees: employeeRows,
    leads: leads.docs.map(toLeadSummary).sort(byNewest),
    deals: dealRows,
    contracts: contractRows,
  };
}

/** Cria uma empresa avulsa (tela Empresas). CNPJ único. */
export async function createCompany(data: CompanyData, actor: Actor): Promise<CompanyRow> {
  const db = getAdminDb();
  const ref = db.collection(COMPANIES_COLLECTION).doc();
  if (data.cnpj) await ensureCnpjIndex(db, data.cnpj);

  await db.runTransaction(
    async (tx) => {
      const owner = data.cnpj ? await readCnpjIndex(tx, db, data.cnpj) : null;
      if (owner) {
        const existing = await tx.get(db.collection(COMPANIES_COLLECTION).doc(owner));
        throw new DuplicateCnpjError({ id: owner, name: str(existing.get("trade_name")) ?? "outra empresa" });
      }
      const now = FieldValue.serverTimestamp();
      tx.create(ref, {
        ...data,
        status: "ativo",
        origin_lead_id: null,
        created_by_uid: actor.uid,
        created_by_name: actor.name,
        created_at: now,
        updated_at: now,
      });
      if (data.cnpj) writeCnpjIndex(tx, db, data.cnpj, ref.id);
    },
    { maxAttempts: MAX_ATTEMPTS },
  );

  const snap = await ref.get();
  return toCompanyRow(snap, new Set());
}

/** Edita a empresa com histórico "Campo: antes → depois". Trocar o CNPJ move o índice de unicidade. */
export async function updateCompany(id: string, data: CompanyData, actor: Actor): Promise<{ changed: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(COMPANIES_COLLECTION).doc(id);
  if (data.cnpj) await ensureCnpjIndex(db, data.cnpj);

  return db.runTransaction(
    async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists) throw new CompanyMissingError();
      const before = current.data() ?? {};
      const oldCnpj = str(before.cnpj);
      const cnpjChanged = (oldCnpj ?? "") !== (data.cnpj ?? "");
      const owner = cnpjChanged && data.cnpj ? await readCnpjIndex(tx, db, data.cnpj) : null;
      const oldOwner = cnpjChanged && oldCnpj ? await readCnpjIndex(tx, db, oldCnpj) : null;
      if (owner && owner !== id) {
        const other = await tx.get(db.collection(COMPANIES_COLLECTION).doc(owner));
        throw new DuplicateCnpjError({ id: owner, name: str(other.get("trade_name")) ?? "outra empresa" });
      }

      const changes = describeCompanyChanges(before, data);
      if (!changes.length) return { changed: false };

      tx.update(ref, { ...data, updated_at: FieldValue.serverTimestamp() });
      if (cnpjChanged) {
        if (oldCnpj && oldOwner === id) deleteCnpjIndex(tx, db, oldCnpj);
        if (data.cnpj) writeCnpjIndex(tx, db, data.cnpj, id);
      }
      tx.create(ref.collection(NOTES_SUBCOLLECTION).doc(), systemNoteData(`Dados alterados — ${changes.join(" · ")}.`, actor));
      return { changed: true };
    },
    { maxAttempts: MAX_ATTEMPTS },
  );
}

/** Ativa/inativa a empresa (não apaga). Registra na timeline. */
export async function setCompanyStatus(id: string, status: EntityStatus, actor: Actor): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection(COMPANIES_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) throw new CompanyMissingError();
    const before = statusOf(current.get("status"));
    if (before === status) return false;
    tx.update(ref, { status, updated_at: FieldValue.serverTimestamp() });
    tx.create(ref.collection(NOTES_SUBCOLLECTION).doc(), systemNoteData(`Status: ${entityStatuses.label(before)} → ${entityStatuses.label(status)}.`, actor));
    return true;
  });
}

/**
 * Adiciona um funcionário à empresa: contato existente (passa a pertencer a esta empresa; se estava em
 * outra, sai dela) ou contato novo (criado já vinculado). Registra nas timelines envolvidas.
 */
export async function addCompanyMember(
  companyId: string,
  member: { mode: "existing"; id: string } | { mode: "new"; data: ContactData & { company_choice: string } },
  actor: Actor,
): Promise<{ contact: ContactRow; previousCompanyId: string | null }> {
  const db = getAdminDb();
  if (member.mode === "new") return { contact: await createContact(member.data, actor, companyId), previousCompanyId: null };

  const companyRef = db.collection(COMPANIES_COLLECTION).doc(companyId);
  const contactRef = db.collection(CONTACTS_COLLECTION).doc(member.id);
  return db.runTransaction(async (tx) => {
    const [company, contact] = await Promise.all([tx.get(companyRef), tx.get(contactRef)]);
    if (!company.exists) throw new CompanyMissingError();
    if (!contact.exists) throw new ContactNotFoundError();
    const previousId = str(contact.get("company_id"));
    const previous = previousId && previousId !== companyId ? await tx.get(db.collection(COMPANIES_COLLECTION).doc(previousId)) : null;
    const companyName = str(company.get("trade_name")) ?? "Sem nome";
    const contactName = str(contact.get("name")) ?? "Sem nome";

    if (previousId !== companyId) {
      tx.update(contactRef, { company_id: companyId, updated_at: FieldValue.serverTimestamp() });
      tx.create(companyRef.collection(NOTES_SUBCOLLECTION).doc(), systemNoteData(`Funcionário adicionado: ${contactName}.`, actor));
      tx.create(
        contactRef.collection(NOTES_SUBCOLLECTION).doc(),
        systemNoteData(
          previous?.exists ? `Empresa: ${str(previous.get("trade_name")) ?? "—"} → ${companyName}.` : `Vinculado à empresa ${companyName}.`,
          actor,
        ),
      );
      if (previous?.exists) tx.create(previous.ref.collection(NOTES_SUBCOLLECTION).doc(), systemNoteData(`Funcionário saiu da empresa: ${contactName}.`, actor));
    }
    const row: ContactRow = {
      id: contact.id,
      name: contactName,
      role: str(contact.get("role")),
      email: str(contact.get("email")),
      phone: str(contact.get("phone")),
      status: statusOf(contact.get("status")),
      company: { id: companyId, name: companyName },
      created_at: iso(contact.get("created_at")),
    };
    return { contact: row, previousCompanyId: previousId && previousId !== companyId ? previousId : null };
  });
}
