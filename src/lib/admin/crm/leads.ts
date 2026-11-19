import "server-only";
import {
  FieldPath,
  FieldValue,
  Timestamp as TimestampValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ensureEmailIndex, readEmailIndex, writeEmailIndex } from "./contactIndex";
import { leadEntries, leadQualifications, leadSources, leadStages, leadStatuses } from "./options";
import {
  COMPANIES_COLLECTION,
  CONTACTS_COLLECTION,
  DEALS_COLLECTION,
  LEAD_NOTES_SUBCOLLECTION,
  LEAD_SCHEMA_VERSION,
  LEADS_COLLECTION,
  type ContactData,
  type LeadData,
  type LeadRow,
  type PickerOption,
} from "./types";
import { systemNoteData } from "./notes";
import { CONTACT_COMPANY_FROM_LEAD, CONTACT_COMPANY_NONE, type ParsedCreateLead, type ParsedLinkLead } from "./validation";

export interface Actor {
  uid: string;
  name: string;
}

/** Máximo de leads carregados na tela (os mais recentes). Acima disso a tela avisa. */
export const LEADS_LIST_LIMIT = 5000;

/** Um contato/empresa existente informado no cadastro não foi encontrado. */
export class MissingReferenceError extends Error {}
/** O lead já tem o contato/empresa que se tentou vincular (não substitui vínculos). */
export class AlreadyLinkedError extends Error {}

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

function toIso(value: unknown): string | null {
  if (value && typeof (value as Timestamp).toDate === "function") return (value as Timestamp).toDate().toISOString();
  return null;
}

/** Lê documentos por id em lotes de 300. Devolve só os que existem, por id. */
async function getAllByIds(collection: string, ids: Set<string>) {
  const db = getAdminDb();
  const list = [...ids];
  const snaps: DocumentSnapshot[] = [];
  for (let i = 0; i < list.length; i += 300) {
    snaps.push(...(await db.getAll(...list.slice(i, i + 300).map((id) => db.collection(collection).doc(id)))));
  }
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s]));
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** Documento do lead (+ contato/empresa já lidos) → linha da tela. */
function toLeadRow(doc: DocumentSnapshot, contacts: Map<string, DocumentSnapshot>, companies: Map<string, DocumentSnapshot>): LeadRow {
  const d = doc.data() ?? {};
  const legacy = d.schema_version !== LEAD_SCHEMA_VERSION;
  const contactSnap = str(d.contact_id) ? contacts.get(d.contact_id) : undefined;
  const companySnap = str(d.company_id) ? companies.get(d.company_id) : undefined;

  let contact: LeadRow["contact"] = null;
  if (contactSnap) {
    contact = {
      id: contactSnap.id,
      name: str(contactSnap.get("name")) ?? "Sem nome",
      email: str(contactSnap.get("email")),
      phone: str(contactSnap.get("phone")),
    };
  } else if (legacy && str(d.lead_name)) {
    // Lead antigo do site: a pessoa estava dentro do próprio lead.
    contact = { id: "", name: d.lead_name, email: str(d.lead_email), phone: str(d.lead_phone)?.replace(/\D/g, "") ?? null };
  }

  return {
    id: doc.id,
    title: str(legacy ? d.lead_name : d.title) ?? "Sem nome",
    email: str(d.email) ?? (legacy ? str(d.lead_email) : null),
    phone: str(d.phone) ?? (legacy ? (str(d.lead_phone)?.replace(/\D/g, "") ?? null) : null),
    entry: leadEntries.is(d.entry) ? d.entry : d.origin === "website" ? "website" : "manual",
    stage: leadStages.is(d.stage) ? d.stage : "novo",
    qualification: leadQualifications.is(d.qualification) ? d.qualification : "a_qualificar",
    status: leadStatuses.is(d.status) ? d.status : "novo",
    source: leadSources.is(d.source) ? d.source : legacy && d.origin === "website" ? "website" : null,
    campaign: str(d.campaign),
    created_by_name: str(d.created_by_name) ?? (d.entry === "website" || d.origin === "website" ? "Website" : null),
    owner_uid: str(d.owner_uid),
    owner_name: str(d.owner_name),
    estimated_value_cents: typeof d.estimated_value_cents === "number" ? d.estimated_value_cents : null,
    expected_close_date: str(d.expected_close_date),
    tags: Array.isArray(d.tags) ? d.tags.filter((t: unknown): t is string => typeof t === "string") : [],
    notes: str(d.notes),
    interest_plan: str(d.interest_plan),
    deal_id: str(d.deal_id),
    contact,
    company: companySnap ? { id: companySnap.id, name: str(companySnap.get("trade_name")) ?? "Sem nome" } : null,
    created_at: toIso(d.created_at),
    last_contact_at: toIso(d.last_contact_at),
  };
}

/** Converte snapshots de leads em linhas, buscando contatos/empresas vinculados de uma vez. */
async function rowsFromSnaps(docs: DocumentSnapshot[]): Promise<LeadRow[]> {
  const contactIds = new Set<string>();
  const companyIds = new Set<string>();
  for (const doc of docs) {
    const contactId = str(doc.get("contact_id"));
    const companyId = str(doc.get("company_id"));
    if (contactId) contactIds.add(contactId);
    if (companyId) companyIds.add(companyId);
  }
  const [contacts, companies] = await Promise.all([
    getAllByIds(CONTACTS_COLLECTION, contactIds),
    getAllByIds(COMPANIES_COLLECTION, companyIds),
  ]);
  return docs.map((doc) => toLeadRow(doc, contacts, companies));
}

/**
 * Leads (mais recentes primeiro) com contato e empresa, para a lista e o painel de detalhes.
 * Valores fora das listas atuais (leads de teste antigos, docs pré-v2) caem nos padrões na leitura.
 */
export async function listLeads(limit = LEADS_LIST_LIMIT): Promise<LeadRow[]> {
  const snap = await getAdminDb().collection(LEADS_COLLECTION).orderBy("created_at", "desc").limit(limit).get();
  return rowsFromSnaps(snap.docs);
}

/** Leads por página na leitura em blocos (cada bloco cabe no cache do Next, limite de 2 MB). */
export const LEADS_PAGE_SIZE = 1500;

/** Cursor exato do último lead de uma página: timestamp com nanossegundos + id (sem pular/repetir). */
export interface LeadsCursor {
  s: number;
  n: number;
  id: string;
}

/**
 * Uma página de leads (mais recentes primeiro), continuando depois do cursor.
 * Ordena por created_at e desempata pelo id, então páginas nunca se sobrepõem nem pulam leads.
 */
export async function listLeadsPage(after: LeadsCursor | null, size = LEADS_PAGE_SIZE): Promise<{ rows: LeadRow[]; next: LeadsCursor | null }> {
  let query = getAdminDb().collection(LEADS_COLLECTION).orderBy("created_at", "desc").orderBy(FieldPath.documentId(), "desc");
  if (after) query = query.startAfter(new TimestampValue(after.s, after.n), after.id);
  const snap = await query.limit(size).get();
  const rows = await rowsFromSnaps(snap.docs);
  const last = snap.docs[snap.docs.length - 1];
  const ts = last?.get("created_at") as Timestamp | undefined;
  const next = snap.size === size && ts && typeof ts.seconds === "number" ? { s: ts.seconds, n: ts.nanoseconds, id: last.id } : null;
  return { rows, next };
}

/** Linhas de leads específicos (ex.: o lead recém-criado, para a tela inserir sem recarregar tudo). */
export async function getLeadRows(ids: string[]): Promise<LeadRow[]> {
  const found = await getAllByIds(LEADS_COLLECTION, new Set(ids));
  return rowsFromSnaps([...found.values()]);
}

// ── Contato novo com e-mail único ────────────────────────────────────────────

interface ContactPlan {
  /** Contato que o lead vai usar. */
  id: string;
  /** true = o e-mail já tinha dono: usa o contato existente em vez de duplicar. */
  reused: boolean;
}

/**
 * LEITURA (antes das escritas da transação, só leitura direta do índice): decide se o contato
 * novo é mesmo novo. Se o e-mail já pertence a um contato, reaproveita esse contato (não duplica)
 * e NÃO grava no índice — assim vários cadastros com o mesmo e-mail não disputam o mesmo documento.
 */
async function planNewContact(tx: Transaction, db: Firestore, data: ContactData): Promise<ContactPlan> {
  if (data.email) {
    const existing = await readEmailIndex(tx, db, data.email);
    if (existing) return { id: existing.contactId, reused: true };
  }
  return { id: db.collection(CONTACTS_COLLECTION).doc().id, reused: false };
}

/** Transações que podem disputar o mesmo e-mail: folga de tentativas. */
const MAX_ATTEMPTS = 15;

// ── Criação manual ───────────────────────────────────────────────────────────

export interface CreateLeadResult {
  id: string;
  /** false = o mesmo request_id já tinha sido gravado (reenvio): nada foi duplicado. */
  created: boolean;
  /** O contato "novo" tinha um e-mail já cadastrado e o existente foi vinculado. */
  contactReused: boolean;
}

/**
 * Cria o lead manual numa transação, junto com empresa e contato novos (se houver).
 * Idempotente: `requestId` (gerado pelo modal a cada envio) vira o id do lead, então um reenvio
 * (clique duplo, rede instável) devolve o mesmo lead em vez de criar outro.
 * `entry: "manual"` é fixado aqui — o cliente não escolhe.
 */
export async function createManualLead(input: ParsedCreateLead, owner: Actor, actor: Actor, requestId: string): Promise<CreateLeadResult> {
  const db = getAdminDb();
  const contacts = db.collection(CONTACTS_COLLECTION);
  const companies = db.collection(COMPANIES_COLLECTION);
  const leadRef = db.collection(LEADS_COLLECTION).doc(`m_${requestId}`);
  if (input.contact.mode === "new" && input.contact.data.email) await ensureEmailIndex(db, input.contact.data.email);

  return db.runTransaction(async (tx) => {
    // 1. Leituras (toda leitura da transação vem antes das escritas).
    const already = await tx.get(leadRef);
    if (already.exists) return { id: leadRef.id, created: false, contactReused: false };

    const mustExist: DocumentReference[] = [];
    if (input.company.mode === "existing") mustExist.push(companies.doc(input.company.id));
    if (input.contact.mode === "existing") mustExist.push(contacts.doc(input.contact.id));
    const contactCompanyChoice = input.contact.mode === "new" ? input.contact.data.company_choice : CONTACT_COMPANY_NONE;
    const contactOwnCompany =
      contactCompanyChoice !== CONTACT_COMPANY_FROM_LEAD && contactCompanyChoice !== CONTACT_COMPANY_NONE ? contactCompanyChoice : null;
    if (contactOwnCompany) mustExist.push(companies.doc(contactOwnCompany));
    if (mustExist.length) {
      const snaps = await tx.getAll(...mustExist);
      if (snaps.some((snap) => !snap.exists)) throw new MissingReferenceError();
    }
    const contactPlan = input.contact.mode === "new" ? await planNewContact(tx, db, input.contact.data) : null;

    const now = FieldValue.serverTimestamp();
    const authorship = { created_by_uid: actor.uid, created_by_name: actor.name, created_at: now, updated_at: now };

    // 2. Empresa do lead.
    let companyId: string | null = null;
    if (input.company.mode === "existing") companyId = input.company.id;
    if (input.company.mode === "new") {
      const ref = companies.doc();
      companyId = ref.id;
      tx.create(ref, { ...input.company.data, origin_lead_id: leadRef.id, ...authorship });
    }

    // 3. Contato do lead.
    let contactId: string | null = null;
    if (input.contact.mode === "existing") contactId = input.contact.id;
    if (input.contact.mode === "new" && contactPlan) {
      contactId = contactPlan.id;
      if (!contactPlan.reused) {
        const contact: Partial<typeof input.contact.data> = { ...input.contact.data };
        delete contact.company_choice; // só decide a empresa; não é gravado
        tx.create(contacts.doc(contactPlan.id), {
          ...contact,
          company_id: contactCompanyChoice === CONTACT_COMPANY_FROM_LEAD ? companyId : contactOwnCompany,
          origin_lead_id: leadRef.id,
          ...authorship,
        });
      }
      if (!contactPlan.reused && input.contact.data.email) writeEmailIndex(tx, db, input.contact.data.email, contactPlan.id, leadRef.id);
    }

    // 4. Lead.
    tx.create(leadRef, {
      ...input.lead,
      owner_uid: owner.uid,
      owner_name: owner.name,
      entry: "manual",
      contact_id: contactId,
      company_id: companyId,
      schema_version: LEAD_SCHEMA_VERSION,
      ...authorship,
    });
    return { id: leadRef.id, created: true, contactReused: Boolean(contactPlan?.reused) };
  }, { maxAttempts: MAX_ATTEMPTS });
}

// ── Ações em massa ───────────────────────────────────────────────────────────
// Todas em transação: relê os leads, ignora os que sumiram (ex.: excluídos por outra pessoa no
// meio do caminho) e grava tudo ou nada. Um batch simples falharia inteiro por causa de 1 lead excluído.

/** Muda qualificação, etapa ou status. Retorna os ids realmente atualizados. */
export async function updateLeads(ids: string[], patch: Partial<Pick<LeadData, "qualification" | "stage" | "status">>): Promise<string[]> {
  const db = getAdminDb();
  const refs = ids.map((id) => db.collection(LEADS_COLLECTION).doc(id));
  return db.runTransaction(async (tx) => {
    const snaps = await tx.getAll(...refs);
    const existing = snaps.filter((s) => s.exists);
    for (const snap of existing) tx.update(snap.ref, { ...patch, updated_at: FieldValue.serverTimestamp() });
    return existing.map((s) => s.id);
  });
}

/**
 * Distribui leads para um responsável (não é edição de dados): registra na timeline de cada lead
 * "Responsável atribuído/trocado" com quem fez e quando. Leads que já são desse responsável são pulados.
 * Retorna os ids atribuídos.
 */
export async function assignOwner(ids: string[], owner: Actor, actor: Actor): Promise<string[]> {
  const db = getAdminDb();
  const refs = ids.map((id) => db.collection(LEADS_COLLECTION).doc(id));
  return db.runTransaction(async (tx) => {
    const snaps = await tx.getAll(...refs);
    const targets = snaps.filter((s) => s.exists && s.get("owner_uid") !== owner.uid);
    for (const snap of targets) {
      const previous = str(snap.get("owner_name"));
      tx.update(snap.ref, { owner_uid: owner.uid, owner_name: owner.name, updated_at: FieldValue.serverTimestamp() });
      tx.create(
        snap.ref.collection(LEAD_NOTES_SUBCOLLECTION).doc(),
        systemNoteData(previous ? `Responsável trocado: ${previous} → ${owner.name}.` : `Responsável atribuído: ${owner.name}.`, actor),
      );
    }
    return targets.map((s) => s.id);
  });
}

/** Apaga só os leads (contatos, empresas e negociações vinculados continuam). Retorna os ids apagados. */
export async function deleteLeads(ids: string[]): Promise<string[]> {
  const db = getAdminDb();
  const refs = ids.map((id) => db.collection(LEADS_COLLECTION).doc(id));
  return db.runTransaction(async (tx) => {
    const snaps = await tx.getAll(...refs);
    const existing = snaps.filter((s) => s.exists);
    for (const snap of existing) tx.delete(snap.ref);
    return existing.map((s) => s.id);
  });
}

/**
 * Converte leads em negociação: cria `deals/{id}` para cada lead ainda sem `deal_id` e marca o lead
 * (etapa "Em negociação", status "Convertido", `converted_at`). Idempotente: conversões simultâneas
 * do mesmo lead geram UMA negociação (a transação repete e vê o `deal_id`). Retorna lead → deal.
 */
export async function convertLeads(ids: string[], actor: Actor): Promise<{ id: string; deal_id: string }[]> {
  const db = getAdminDb();
  const leads = db.collection(LEADS_COLLECTION);
  const deals = db.collection(DEALS_COLLECTION);

  return db.runTransaction(async (tx) => {
    const snaps = await tx.getAll(...ids.map((id) => leads.doc(id)));
    const converted: { id: string; deal_id: string }[] = [];
    const now = FieldValue.serverTimestamp();
    for (const snap of snaps) {
      const d = snap.data();
      if (!d || str(d.deal_id)) continue;
      const dealRef = deals.doc();
      tx.create(dealRef, {
        lead_id: snap.id,
        title: str(d.title) ?? str(d.lead_name) ?? "Sem nome",
        contact_id: str(d.contact_id),
        company_id: str(d.company_id),
        owner_uid: str(d.owner_uid),
        owner_name: str(d.owner_name),
        estimated_value_cents: typeof d.estimated_value_cents === "number" ? d.estimated_value_cents : null,
        expected_close_date: str(d.expected_close_date),
        status: "open",
        created_by_uid: actor.uid,
        created_by_name: actor.name,
        created_at: now,
        updated_at: now,
      });
      tx.update(snap.ref, { deal_id: dealRef.id, converted_at: now, stage: "em_negociacao", status: "convertido", updated_at: now });
      converted.push({ id: snap.id, deal_id: dealRef.id });
    }
    return converted;
  });
}

// ── Vincular contato/empresa depois ──────────────────────────────────────────

export interface LinkResult {
  contact: LeadRow["contact"];
  company: LeadRow["company"];
}

/**
 * Vincula contato e/ou empresa a um lead que ainda não tem — existentes ou novos (criados aqui).
 * Não troca vínculos já feitos. Contato novo com e-mail já cadastrado reaproveita o existente.
 * Registra na timeline. Devolve o que o lead passou a ter (a tela atualiza sem recarregar).
 */
export async function linkLeadRelations(leadId: string, input: ParsedLinkLead, actor: Actor): Promise<LinkResult> {
  const db = getAdminDb();
  const leadRef = db.collection(LEADS_COLLECTION).doc(leadId);
  const contacts = db.collection(CONTACTS_COLLECTION);
  const companies = db.collection(COMPANIES_COLLECTION);
  if (input.contact.mode === "new" && input.contact.data.email) await ensureEmailIndex(db, input.contact.data.email);

  return db.runTransaction(async (tx) => {
    const lead = await tx.get(leadRef);
    if (!lead.exists) throw new MissingReferenceError();
    const currentContact = str(lead.get("contact_id"));
    const currentCompany = str(lead.get("company_id"));
    if ((input.contact.mode !== "none" && currentContact) || (input.company.mode !== "none" && currentCompany)) {
      throw new AlreadyLinkedError();
    }

    // Leituras: registros existentes informados precisam existir.
    const contactChoice = input.contact.mode === "new" ? input.contact.data.company_choice : CONTACT_COMPANY_NONE;
    const contactOwnCompany = contactChoice !== CONTACT_COMPANY_FROM_LEAD && contactChoice !== CONTACT_COMPANY_NONE ? contactChoice : null;
    const mustExist: DocumentReference[] = [];
    if (input.company.mode === "existing") mustExist.push(companies.doc(input.company.id));
    if (input.contact.mode === "existing") mustExist.push(contacts.doc(input.contact.id));
    if (contactOwnCompany) mustExist.push(companies.doc(contactOwnCompany));
    const snaps = mustExist.length ? await tx.getAll(...mustExist) : [];
    if (snaps.some((s) => !s.exists)) throw new MissingReferenceError();
    const snapOf = (ref: DocumentReference) => snaps.find((s) => s.ref.path === ref.path);
    const contactPlan = input.contact.mode === "new" ? await planNewContact(tx, db, input.contact.data) : null;
    // Contato reaproveitado: lê para mostrar o nome/dados reais dele.
    const reusedSnap = contactPlan?.reused ? await tx.get(contacts.doc(contactPlan.id)) : null;

    const now = FieldValue.serverTimestamp();
    const authorship = { created_by_uid: actor.uid, created_by_name: actor.name, created_at: now, updated_at: now };
    const patch: Record<string, unknown> = { updated_at: now };
    const log: string[] = [];
    const result: LinkResult = { contact: null, company: null };

    let companyId = currentCompany;
    if (input.company.mode === "existing") {
      companyId = input.company.id;
      const name = str(snapOf(companies.doc(companyId))?.get("trade_name")) ?? "Sem nome";
      result.company = { id: companyId, name };
      log.push(`Empresa vinculada: ${name}.`);
    } else if (input.company.mode === "new") {
      const ref = companies.doc();
      companyId = ref.id;
      tx.create(ref, { ...input.company.data, origin_lead_id: leadId, ...authorship });
      result.company = { id: companyId, name: input.company.data.trade_name };
      log.push(`Empresa cadastrada e vinculada: ${input.company.data.trade_name}.`);
    }
    if (input.company.mode !== "none") patch.company_id = companyId;

    if (input.contact.mode === "existing") {
      const snap = snapOf(contacts.doc(input.contact.id));
      result.contact = {
        id: input.contact.id,
        name: str(snap?.get("name")) ?? "Sem nome",
        email: str(snap?.get("email")),
        phone: str(snap?.get("phone")),
      };
      patch.contact_id = input.contact.id;
      log.push(`Contato vinculado: ${result.contact.name}.`);
    } else if (input.contact.mode === "new" && contactPlan) {
      const data = input.contact.data;
      if (contactPlan.reused && reusedSnap) {
        result.contact = {
          id: contactPlan.id,
          name: str(reusedSnap.get("name")) ?? data.name,
          email: str(reusedSnap.get("email")),
          phone: str(reusedSnap.get("phone")),
        };
        log.push(`Contato vinculado (o e-mail já era de ${result.contact.name}): ${result.contact.name}.`);
      } else {
        const contact: Partial<typeof data> = { ...data };
        delete contact.company_choice; // só decide a empresa; não é gravado
        tx.create(contacts.doc(contactPlan.id), {
          ...contact,
          company_id: contactChoice === CONTACT_COMPANY_FROM_LEAD ? companyId : contactOwnCompany,
          origin_lead_id: leadId,
          ...authorship,
        });
        result.contact = { id: contactPlan.id, name: data.name, email: data.email, phone: data.phone };
        log.push(`Contato cadastrado e vinculado: ${data.name}.`);
      }
      if (!contactPlan.reused && data.email) writeEmailIndex(tx, db, data.email, contactPlan.id, leadId);
      patch.contact_id = contactPlan.id;
    }

    tx.update(leadRef, patch);
    tx.create(leadRef.collection(LEAD_NOTES_SUBCOLLECTION).doc(), systemNoteData(log.join(" "), actor));
    return result;
  }, { maxAttempts: MAX_ATTEMPTS });
}

// ── Opções das buscas ────────────────────────────────────────────────────────

/** Contatos para a busca "Buscar contato existente" (até 1000, em ordem alfabética). */
export async function listContactOptions(limit = 1000): Promise<PickerOption[]> {
  const snap = await getAdminDb().collection(CONTACTS_COLLECTION).orderBy("name").select("name", "email").limit(limit).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    label: String(doc.get("name") ?? "Sem nome"),
    hint: typeof doc.get("email") === "string" ? doc.get("email") : null,
  }));
}

/** Empresas para a busca "Buscar empresa existente" (até 1000, em ordem alfabética). */
export async function listCompanyOptions(limit = 1000): Promise<PickerOption[]> {
  const snap = await getAdminDb()
    .collection(COMPANIES_COLLECTION)
    .orderBy("trade_name")
    .select("trade_name", "cnpj", "address.city")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => {
    const cnpj = doc.get("cnpj");
    const city = doc.get("address.city");
    const hint = [typeof cnpj === "string" ? formatCnpj(cnpj) : null, typeof city === "string" ? city : null].filter(Boolean).join(" · ");
    return { id: doc.id, label: String(doc.get("trade_name") ?? "Sem nome"), hint: hint || null };
  });
}

function formatCnpj(d: string): string {
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
}
