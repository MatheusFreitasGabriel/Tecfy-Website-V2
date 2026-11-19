import "server-only";
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { leadEntries, leadQualifications, leadSources, leadStages, leadStatuses } from "./options";
import {
  COMPANIES_COLLECTION,
  CONTACTS_COLLECTION,
  DEALS_COLLECTION,
  LEAD_NOTES_SUBCOLLECTION,
  LEAD_SCHEMA_VERSION,
  LEADS_COLLECTION,
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

/** Um contato/empresa existente informado no cadastro não foi encontrado. */
export class MissingReferenceError extends Error {}

/**
 * Cria o lead manual numa transação, junto com a empresa e o contato novos (se houver).
 * Ordem: empresa → contato (empresa do contato = a do lead, nenhuma ou outra existente) → lead.
 * `entry: "manual"` é fixado aqui — o cliente não escolhe.
 */
export async function createManualLead(input: ParsedCreateLead, owner: Actor, actor: Actor): Promise<string> {
  const db = getAdminDb();
  const leads = db.collection(LEADS_COLLECTION);
  const contacts = db.collection(CONTACTS_COLLECTION);
  const companies = db.collection(COMPANIES_COLLECTION);

  const leadRef = leads.doc();
  const authorship = {
    created_by_uid: actor.uid,
    created_by_name: actor.name,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (tx) => {
    // 1. Leituras (toda leitura da transação vem antes das escritas).
    const mustExist: DocumentReference[] = [];
    if (input.company.mode === "existing") mustExist.push(companies.doc(input.company.id));
    if (input.contact.mode === "existing") mustExist.push(contacts.doc(input.contact.id));
    const contactCompanyChoice = input.contact.mode === "new" ? input.contact.data.company_choice : CONTACT_COMPANY_NONE;
    const contactOwnCompany =
      contactCompanyChoice !== CONTACT_COMPANY_FROM_LEAD && contactCompanyChoice !== CONTACT_COMPANY_NONE
        ? contactCompanyChoice
        : null;
    if (contactOwnCompany) mustExist.push(companies.doc(contactOwnCompany));

    if (mustExist.length) {
      const snaps = await tx.getAll(...mustExist);
      if (snaps.some((snap) => !snap.exists)) throw new MissingReferenceError();
    }

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
    if (input.contact.mode === "new") {
      const contact: Partial<typeof input.contact.data> = { ...input.contact.data };
      delete contact.company_choice; // só decide a empresa; não é gravado
      const ref = contacts.doc();
      contactId = ref.id;
      tx.create(ref, {
        ...contact,
        company_id: contactCompanyChoice === CONTACT_COMPANY_FROM_LEAD ? companyId : contactOwnCompany,
        origin_lead_id: leadRef.id,
        ...authorship,
      });
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
  });

  return leadRef.id;
}

export async function countLeads(): Promise<number> {
  const snap = await getAdminDb().collection(LEADS_COLLECTION).count().get();
  return snap.data().count;
}

function toIso(value: unknown): string | null {
  if (value && typeof (value as Timestamp).toDate === "function") return (value as Timestamp).toDate().toISOString();
  return null;
}

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

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

/**
 * Leads (mais recentes primeiro) com contato e empresa, para a lista e o painel de detalhes.
 * Valores fora das listas atuais (leads de teste antigos, docs pré-v2) caem nos padrões na leitura —
 * nada é reescrito no banco.
 */
export async function listLeads(limit = 2000): Promise<LeadRow[]> {
  const db = getAdminDb();
  const snap = await db.collection(LEADS_COLLECTION).orderBy("created_at", "desc").limit(limit).get();

  const contactIds = new Set<string>();
  const companyIds = new Set<string>();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (str(d.contact_id)) contactIds.add(d.contact_id);
    if (str(d.company_id)) companyIds.add(d.company_id);
  }
  const [contacts, companies] = await Promise.all([
    getAllByIds(CONTACTS_COLLECTION, contactIds),
    getAllByIds(COMPANIES_COLLECTION, companyIds),
  ]);

  return snap.docs.map((doc): LeadRow => {
    const d = doc.data();
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
  });
}

// ── Ações em massa ───────────────────────────────────────────────────────────

/** Muda qualificação, etapa ou status dos leads que existem. Retorna quantos foram atualizados. */
export async function updateLeads(
  ids: string[],
  patch: Partial<Pick<LeadData, "qualification" | "stage" | "status">>,
): Promise<number> {
  const existing = await getAllByIds(LEADS_COLLECTION, new Set(ids));
  if (!existing.size) return 0;
  const batch = getAdminDb().batch();
  for (const snap of existing.values()) batch.update(snap.ref, { ...patch, updated_at: FieldValue.serverTimestamp() });
  await batch.commit();
  return existing.size;
}

/**
 * Distribui leads para um responsável. Não é edição de dados: registra na timeline de cada lead
 * "Responsável atribuído: X" com quem fez e quando. Leads que já são desse responsável são pulados.
 */
export async function assignOwner(ids: string[], owner: Actor, actor: Actor): Promise<number> {
  const existing = await getAllByIds(LEADS_COLLECTION, new Set(ids));
  const targets = [...existing.values()].filter((snap) => snap.get("owner_uid") !== owner.uid);
  if (!targets.length) return 0;

  const batch = getAdminDb().batch();
  for (const snap of targets) {
    const previous = str(snap.get("owner_name"));
    batch.update(snap.ref, { owner_uid: owner.uid, owner_name: owner.name, updated_at: FieldValue.serverTimestamp() });
    batch.create(
      snap.ref.collection(LEAD_NOTES_SUBCOLLECTION).doc(),
      systemNoteData(previous ? `Responsável trocado: ${previous} → ${owner.name}.` : `Responsável atribuído: ${owner.name}.`, actor),
    );
  }
  await batch.commit();
  return targets.length;
}

/** O lead já tem o contato/empresa que se tentou vincular (não substitui vínculos). */
export class AlreadyLinkedError extends Error {}

/**
 * Vincula contato e/ou empresa a um lead que ainda não tem — existentes ou novos (criados aqui).
 * Não troca vínculos já feitos. Contato novo com "empresa do lead" usa a empresa do lead
 * (a já vinculada ou a que está sendo vinculada agora). Registra na timeline.
 */
export async function linkLeadRelations(leadId: string, input: ParsedLinkLead, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const leadRef = db.collection(LEADS_COLLECTION).doc(leadId);
  const contacts = db.collection(CONTACTS_COLLECTION);
  const companies = db.collection(COMPANIES_COLLECTION);
  const authorship = {
    created_by_uid: actor.uid,
    created_by_name: actor.name,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (tx) => {
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
    const nameOf = (ref: DocumentReference) => {
      const snap = snaps.find((s) => s.ref.path === ref.path);
      return str(snap?.get("name")) ?? str(snap?.get("trade_name")) ?? "Sem nome";
    };

    const patch: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
    const log: string[] = [];

    let companyId = currentCompany;
    if (input.company.mode === "existing") {
      companyId = input.company.id;
      log.push(`Empresa vinculada: ${nameOf(companies.doc(companyId))}.`);
    } else if (input.company.mode === "new") {
      const ref = companies.doc();
      companyId = ref.id;
      tx.create(ref, { ...input.company.data, origin_lead_id: leadId, ...authorship });
      log.push(`Empresa cadastrada e vinculada: ${input.company.data.trade_name}.`);
    }
    if (input.company.mode !== "none") patch.company_id = companyId;

    if (input.contact.mode === "existing") {
      patch.contact_id = input.contact.id;
      log.push(`Contato vinculado: ${nameOf(contacts.doc(input.contact.id))}.`);
    } else if (input.contact.mode === "new") {
      const contact: Partial<typeof input.contact.data> = { ...input.contact.data };
      delete contact.company_choice; // só decide a empresa; não é gravado
      const ref = contacts.doc();
      tx.create(ref, {
        ...contact,
        company_id: contactChoice === CONTACT_COMPANY_FROM_LEAD ? companyId : contactOwnCompany,
        origin_lead_id: leadId,
        ...authorship,
      });
      patch.contact_id = ref.id;
      log.push(`Contato cadastrado e vinculado: ${input.contact.data.name}.`);
    }

    tx.update(leadRef, patch);
    tx.create(leadRef.collection(LEAD_NOTES_SUBCOLLECTION).doc(), systemNoteData(log.join(" "), actor));
  });
}

/** Apaga só os leads (contatos, empresas e negociações vinculados continuam). */
export async function deleteLeads(ids: string[]): Promise<number> {
  const existing = await getAllByIds(LEADS_COLLECTION, new Set(ids));
  if (!existing.size) return 0;
  const batch = getAdminDb().batch();
  for (const snap of existing.values()) batch.delete(snap.ref);
  await batch.commit();
  return existing.size;
}

/**
 * Converte leads em negociação: cria `deals/{id}` para cada lead ainda sem `deal_id` e marca o lead
 * (etapa "Em negociação", status "Convertido", `converted_at`). Numa transação; leads já convertidos
 * ou inexistentes são pulados (idempotente). Retorna quantos foram convertidos.
 */
export async function convertLeads(ids: string[], actor: Actor): Promise<number> {
  const db = getAdminDb();
  const leads = db.collection(LEADS_COLLECTION);
  const deals = db.collection(DEALS_COLLECTION);

  return db.runTransaction(async (tx) => {
    const snaps = await tx.getAll(...ids.map((id) => leads.doc(id)));
    let converted = 0;
    for (const snap of snaps) {
      const d = snap.data();
      if (!d || str(d.deal_id)) continue;
      const dealRef = deals.doc();
      const now = FieldValue.serverTimestamp();
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
      converted += 1;
    }
    return converted;
  });
}

/** Contatos para a busca "Buscar contato existente" (até 500, em ordem alfabética). */
export async function listContactOptions(limit = 500): Promise<PickerOption[]> {
  const snap = await getAdminDb().collection(CONTACTS_COLLECTION).orderBy("name").select("name", "email").limit(limit).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    label: String(doc.get("name") ?? "Sem nome"),
    hint: typeof doc.get("email") === "string" ? doc.get("email") : null,
  }));
}

/** Empresas para a busca "Buscar empresa existente" (até 500, em ordem alfabética). */
export async function listCompanyOptions(limit = 500): Promise<PickerOption[]> {
  const snap = await getAdminDb()
    .collection(COMPANIES_COLLECTION)
    .orderBy("trade_name")
    .select("trade_name", "cnpj", "address.city")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => {
    const cnpj = doc.get("cnpj");
    const city = doc.get("address.city");
    const hint = [typeof cnpj === "string" ? formatCnpj(cnpj) : null, typeof city === "string" ? city : null]
      .filter(Boolean)
      .join(" · ");
    return { id: doc.id, label: String(doc.get("trade_name") ?? "Sem nome"), hint: hint || null };
  });
}

function formatCnpj(d: string): string {
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
}
