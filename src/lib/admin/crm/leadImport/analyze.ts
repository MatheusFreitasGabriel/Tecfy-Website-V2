import "server-only";
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { maskCep, maskCnpj, maskPhoneNumber } from "@/utils/masks";
import { companyRegions, companySegments, companySizes, contactChannels, contactConsents } from "../options";
import { COMPANIES_COLLECTION, CONTACTS_COLLECTION, type CompanyData, type CompanyRow, type ContactData, type ContactRow, type LeadRow } from "../types";
import { columnOf, digitsOf, domainOf, emailKey, fold, phoneKey, validateImportRow, type ImportField, type ImportRow, type OwnerOption } from "./columns";
import type { FieldDiff, MatchedLead, RowMatch } from "./review";

/**
 * Análise da importação (só leitura): para cada linha, procura empresa, contato e leads já
 * existentes e compara os dados. Recebe as listas do CRM (a rota usa as cacheadas: custo zero com
 * cache quente) e só lê direto do Firestore os contatos/empresas encontrados (para o comparativo).
 */

const CLOSED: LeadRow["status"][] = ["perdido", "arquivado"];

function push<K, V>(map: Map<K, V[]>, key: K | "" | null | undefined, value: V) {
  if (!key) return;
  const list = map.get(key as K);
  if (list) list.push(value);
  else map.set(key as K, [value]);
}

// ── Comparação de campos ─────────────────────────────────────────────────────

type Kind = "text" | "phone" | "email" | "site" | "digits" | "option";
interface DiffSpec {
  field: ImportField;
  /** Caminho no documento do CRM. */
  path: string;
  kind: Kind;
  format?: (v: string) => string;
  /** Só aponta diferença; nunca completa (ex.: nome). */
  identity?: boolean;
}

const COMPANY_SPECS: DiffSpec[] = [
  { field: "trade_name", path: "trade_name", kind: "text", identity: true },
  { field: "legal_name", path: "legal_name", kind: "text" },
  { field: "cnpj", path: "cnpj", kind: "digits", format: maskCnpj },
  { field: "website", path: "website", kind: "site" },
  { field: "company_email", path: "email", kind: "email" },
  { field: "company_phone", path: "phone", kind: "phone", format: maskPhoneNumber },
  { field: "segment", path: "segment", kind: "option", format: (v) => companySegments.label(v) },
  { field: "size", path: "size", kind: "option", format: (v) => companySizes.label(v) },
  { field: "street", path: "address.street", kind: "text" },
  { field: "number", path: "address.number", kind: "text" },
  { field: "district", path: "address.district", kind: "text" },
  { field: "city", path: "address.city", kind: "text" },
  { field: "zip", path: "address.zip", kind: "digits", format: maskCep },
  { field: "region", path: "address.region", kind: "option", format: (v) => companyRegions.label(v) },
  { field: "company_notes", path: "notes", kind: "text" },
];

const CONTACT_SPECS: DiffSpec[] = [
  { field: "contact_name", path: "name", kind: "text", identity: true },
  { field: "contact_email", path: "email", kind: "email" },
  { field: "contact_phone", path: "phone", kind: "phone", format: maskPhoneNumber },
  { field: "role", path: "role", kind: "text" },
  { field: "preferred_channel", path: "preferred_channel", kind: "option", format: (v) => contactChannels.label(v) },
  { field: "comm_consent", path: "comm_consent", kind: "option", format: (v) => contactConsents.label(v) },
  { field: "contact_notes", path: "notes", kind: "text" },
];

const get = (obj: Record<string, unknown>, path: string): string => {
  const value = path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
  return typeof value === "string" ? value : "";
};

const same = (kind: Kind, a: string, b: string): boolean => {
  switch (kind) {
    case "phone":
      return (phoneKey(a) || digitsOf(a)) === (phoneKey(b) || digitsOf(b));
    case "email":
      return emailKey(a) === emailKey(b);
    case "site":
      return domainOf(a) === domainOf(b);
    case "digits":
      return digitsOf(a) === digitsOf(b);
    case "option":
      return a === b;
    default:
      return fold(a) === fold(b);
  }
};

/** `parsed` = dados limpos da planilha (formato do CRM); `crm` = documento atual. */
function diff(specs: DiffSpec[], parsed: Record<string, unknown>, crm: DocumentData): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const spec of specs) {
    const sheet = get(parsed, spec.path);
    if (!sheet) continue;
    if (spec.field === "comm_consent" && sheet === "nao_informada") continue; // padrão, não é dado
    const current = get(crm, spec.path);
    if (current && same(spec.kind, sheet, current)) continue;
    if (!current && spec.identity) continue;
    const fmt = spec.format ?? ((v: string) => v);
    out.push({
      field: spec.field,
      label: columnOf(spec.field).header,
      sheet: fmt(sheet),
      crm: current ? fmt(current) : null,
      kind: current ? "diferente" : "novo",
    });
  }
  return out;
}

/** Empresa do CRM + campos que estavam VAZIOS preenchidos com a planilha (nada é sobrescrito). */
export function fillCompany(crm: DocumentData, sheet: CompanyData): { data: CompanyData; filled: string[] } {
  const address = (crm.address ?? {}) as Record<string, string | null>;
  const pick = (current: unknown, incoming: string | null) => (typeof current === "string" && current ? current : incoming);
  const data: CompanyData = {
    trade_name: typeof crm.trade_name === "string" && crm.trade_name ? crm.trade_name : sheet.trade_name,
    legal_name: pick(crm.legal_name, sheet.legal_name),
    cnpj: pick(crm.cnpj, sheet.cnpj),
    website: pick(crm.website, sheet.website),
    email: pick(crm.email, sheet.email),
    phone: pick(crm.phone, sheet.phone),
    segment: pick(crm.segment, sheet.segment) as CompanyData["segment"],
    size: pick(crm.size, sheet.size) as CompanyData["size"],
    address: {
      street: pick(address.street, sheet.address.street),
      number: pick(address.number, sheet.address.number),
      zip: pick(address.zip, sheet.address.zip),
      district: pick(address.district, sheet.address.district),
      city: pick(address.city, sheet.address.city),
      region: pick(address.region, sheet.address.region) as CompanyData["address"]["region"],
    },
    notes: pick(crm.notes, sheet.notes),
  };
  const filled = diff(COMPANY_SPECS, sheet as unknown as Record<string, unknown>, crm).filter((d) => d.kind === "novo").map((d) => d.label);
  return { data, filled };
}

export function fillContact(crm: DocumentData, sheet: ContactData): { data: ContactData; filled: string[] } {
  const pick = (current: unknown, incoming: string | null) => (typeof current === "string" && current ? current : incoming);
  const consent = typeof crm.comm_consent === "string" && crm.comm_consent !== "nao_informada" ? crm.comm_consent : sheet.comm_consent;
  const data: ContactData = {
    name: typeof crm.name === "string" && crm.name ? crm.name : sheet.name,
    email: pick(crm.email, sheet.email),
    phone: pick(crm.phone, sheet.phone),
    role: pick(crm.role, sheet.role),
    preferred_channel: pick(crm.preferred_channel, sheet.preferred_channel) as ContactData["preferred_channel"],
    notes: pick(crm.notes, sheet.notes),
    comm_consent: consent as ContactData["comm_consent"],
  };
  const filled = diff(CONTACT_SPECS, sheet as unknown as Record<string, unknown>, { ...crm, comm_consent: crm.comm_consent === "nao_informada" ? "" : crm.comm_consent })
    .filter((d) => d.kind === "novo")
    .map((d) => d.label);
  return { data, filled };
}

// ── Análise ──────────────────────────────────────────────────────────────────

const toMatchedLead = (lead: LeadRow, reason: string): MatchedLead => ({
  id: lead.id,
  title: lead.title,
  status: lead.status,
  stage: lead.stage,
  owner_name: lead.owner_name,
  created_at: lead.created_at,
  reason,
});

export interface CrmSnapshot {
  companies: CompanyRow[];
  contacts: ContactRow[];
  leads: LeadRow[];
}

/**
 * `crm` = listas atuais do CRM. A rota passa as listas cacheadas (`crm/cache.ts`); este módulo não
 * usa o cache direto, como as demais funções de `crm/*` (podem rodar fora do Next, ex.: testes).
 */
export async function analyzeImportRows(rows: ImportRow[], admins: OwnerOption[], defaultOwnerUid: string, crm: CrmSnapshot): Promise<RowMatch[]> {
  const { companies, contacts, leads } = crm;

  const companyByCnpj = new Map<string, (typeof companies)[number]>();
  const companyBySite = new Map<string, (typeof companies)[number]>();
  const companyByName = new Map<string, (typeof companies)[number]>();
  const companyByPhone = new Map<string, (typeof companies)[number]>();
  for (const c of companies) {
    if (c.cnpj) companyByCnpj.set(c.cnpj, c);
    if (c.website && domainOf(c.website)) companyBySite.set(domainOf(c.website), c);
    if (fold(c.trade_name)) companyByName.set(fold(c.trade_name), c);
    if (phoneKey(c.phone)) companyByPhone.set(phoneKey(c.phone), c);
  }

  const contactByEmail = new Map<string, (typeof contacts)[number]>();
  const contactByPhone = new Map<string, (typeof contacts)[number]>();
  const contactByNameInCompany = new Map<string, (typeof contacts)[number]>();
  for (const c of contacts) {
    if (emailKey(c.email)) contactByEmail.set(emailKey(c.email), c);
    if (phoneKey(c.phone)) contactByPhone.set(phoneKey(c.phone), c);
    if (c.company) contactByNameInCompany.set(`${c.company.id}|${fold(c.name)}`, c);
  }

  const leadsByCompany = new Map<string, LeadRow[]>();
  const leadsByContact = new Map<string, LeadRow[]>();
  const leadsByEmail = new Map<string, LeadRow[]>();
  const leadsByPhone = new Map<string, LeadRow[]>();
  for (const l of leads) {
    push(leadsByCompany, l.company?.id, l);
    push(leadsByContact, l.contact?.id, l);
    push(leadsByEmail, emailKey(l.email), l);
    if (l.contact?.email && emailKey(l.contact.email) !== emailKey(l.email)) push(leadsByEmail, emailKey(l.contact.email), l);
    push(leadsByPhone, phoneKey(l.phone), l);
    if (l.contact?.phone && phoneKey(l.contact.phone) !== phoneKey(l.phone)) push(leadsByPhone, phoneKey(l.contact.phone), l);
  }

  const ownerUids = admins.map((a) => a.uid);
  const results = rows.map((row) => {
    const v = row.values;
    const match: RowMatch = { line: row.line, company: null, companyMaybe: null, contact: null, openLeads: [], closedLeads: [], companyDiff: [], contactDiff: [] };

    // Empresa: CNPJ → site → nome fantasia.
    const cnpj = digitsOf(v.cnpj);
    const domain = domainOf(v.website);
    const companyHit =
      (cnpj && companyByCnpj.get(cnpj) && { c: companyByCnpj.get(cnpj)!, by: "cnpj" as const }) ||
      (domain && companyBySite.get(domain) && { c: companyBySite.get(domain)!, by: "site" as const }) ||
      (fold(v.trade_name) && companyByName.get(fold(v.trade_name)) && { c: companyByName.get(fold(v.trade_name))!, by: "nome" as const }) ||
      null;
    if (companyHit) match.company = { id: companyHit.c.id, name: companyHit.c.trade_name, by: companyHit.by };
    else {
      const maybe = [v.company_phone, v.lead_phone].map(phoneKey).find((p) => p && companyByPhone.has(p));
      if (maybe) match.companyMaybe = { id: companyByPhone.get(maybe)!.id, name: companyByPhone.get(maybe)!.trade_name };
    }

    // Contato: e-mail → telefone → mesmo nome na mesma empresa.
    const emails = [v.contact_email, v.lead_email].map(emailKey).filter(Boolean);
    const phones = [v.contact_phone, v.lead_phone].map(phoneKey).filter(Boolean);
    const byEmail = emails.map((e) => contactByEmail.get(e)).find(Boolean);
    const byPhone = byEmail ? null : phones.map((p) => contactByPhone.get(p)).find(Boolean);
    const byName = byEmail || byPhone || !match.company || !v.contact_name.trim() ? null : contactByNameInCompany.get(`${match.company.id}|${fold(v.contact_name)}`);
    const contactHit = byEmail ? { c: byEmail, by: "email" as const } : byPhone ? { c: byPhone, by: "telefone" as const } : byName ? { c: byName, by: "nome" as const } : null;
    if (contactHit) match.contact = { id: contactHit.c.id, name: contactHit.c.name, by: contactHit.by, company_name: contactHit.c.company?.name ?? null };

    // Leads parecidos.
    const found = new Map<string, MatchedLead>();
    const add = (list: LeadRow[] | undefined, reason: string) => list?.forEach((l) => !found.has(l.id) && found.set(l.id, toMatchedLead(l, reason)));
    if (match.contact) add(leadsByContact.get(match.contact.id), `mesmo contato (${match.contact.name})`);
    if (match.company) add(leadsByCompany.get(match.company.id), `mesma empresa (${match.company.name})`);
    emails.forEach((e) => add(leadsByEmail.get(e), `mesmo e-mail (${e})`));
    phones.forEach((p) => add(leadsByPhone.get(p), `mesmo telefone (${maskPhoneNumber(p)})`));
    for (const l of found.values()) (CLOSED.includes(l.status) ? match.closedLeads : match.openLeads).push(l);

    return match;
  });

  // Comparativo: lê só os contatos/empresas encontrados.
  const db = getAdminDb();
  const companyIds = [...new Set(results.map((m) => m.company?.id).filter((id): id is string => Boolean(id)))];
  const contactIds = [...new Set(results.map((m) => m.contact?.id).filter((id): id is string => Boolean(id)))];
  const readAll = async (collection: string, ids: string[]) => {
    const out = new Map<string, DocumentData>();
    for (let i = 0; i < ids.length; i += 300) {
      const snaps = await db.getAll(...ids.slice(i, i + 300).map((id) => db.collection(collection).doc(id)));
      for (const s of snaps) if (s.exists) out.set(s.id, s.data() ?? {});
    }
    return out;
  };
  const [companyDocs, contactDocs] = await Promise.all([readAll(COMPANIES_COLLECTION, companyIds), readAll(CONTACTS_COLLECTION, contactIds)]);

  rows.forEach((row, index) => {
    const match = results[index];
    const parsed = validateImportRow(row.values, defaultOwnerUid || ownerUids[0] || null, ownerUids);
    if (!parsed.ok) return; // linha com erro: compara de novo depois de corrigida
    const companyDoc = match.company ? companyDocs.get(match.company.id) : undefined;
    const contactDoc = match.contact ? contactDocs.get(match.contact.id) : undefined;
    if (companyDoc && parsed.parsed.company) match.companyDiff = diff(COMPANY_SPECS, parsed.parsed.company as unknown as Record<string, unknown>, companyDoc);
    if (contactDoc && parsed.parsed.contact) {
      match.contactDiff = diff(CONTACT_SPECS, parsed.parsed.contact as unknown as Record<string, unknown>, {
        ...contactDoc,
        comm_consent: contactDoc.comm_consent === "nao_informada" ? "" : contactDoc.comm_consent,
      });
    }
  });

  return results;
}
