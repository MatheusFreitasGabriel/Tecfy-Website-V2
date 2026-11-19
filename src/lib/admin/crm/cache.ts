import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { listAdminUsers } from "./admins";
import { LEADS_LIST_LIMIT, listCompanyOptions, listContactOptions, listLeadsPage, type LeadsCursor } from "./leads";
import { COMPANIES_LIST_LIMIT, activeClientIds, getCompanyDetail, listCompaniesPage } from "./companies";
import { CONTACTS_LIST_LIMIT, getContactDetail, listContactsPage, type PageCursor } from "./contacts";
import type { CompanyRow, ContactRow, LeadRow } from "./types";
import { listTemplates } from "./templatesStore";

/**
 * Cache de leitura do CRM (Next Data Cache). Abrir/atualizar a tela de Leads só lê o Firestore
 * quando algo mudou: toda rota que grava chama `invalidateCrm(...)` com as tags afetadas.
 *
 * Só page/rotas usam este arquivo. As funções de `crm/*` continuam sem cache (testes de stress
 * chamam elas direto, fora do Next).
 */
export const CRM_TAGS = {
  leads: "crm-leads",
  /** Só a lista da tela de Leads (mostra nome de contato/empresa): edição de contato/empresa invalida só ela. */
  leadsList: "crm-leads-list",
  contacts: "crm-contacts",
  companies: "crm-companies",
  admins: "crm-admins",
  templates: "crm-templates",
} as const;
export type CrmTag = (typeof CRM_TAGS)[keyof typeof CRM_TAGS];

/** Expira na hora (a próxima leitura busca do Firestore). Use depois de cada gravação. */
export function invalidateCrm(...tags: (CrmTag | string | null | undefined)[]): void {
  for (const tag of new Set(tags)) if (tag) revalidateTag(tag, { expire: 0 });
}

/** Tag de UM contato / UMA empresa: editar um registro não derruba o cache de todos os outros. */
export const contactTag = (id: string | null | undefined) => (id ? `crm-contact-${id}` : null);
export const companyTag = (id: string | null | undefined) => (id ? `crm-company-${id}` : null);

/**
 * Uma página de leads (até 1.500), cacheada pelo cursor. Páginas separadas porque o cache do Next
 * recusa itens acima de 2 MB (5.000 leads numa peça só = 2,2 MB no teste de stress).
 */
const getCachedLeadsPage = unstable_cache(
  async (cursorKey: string) => listLeadsPage(cursorKey ? (JSON.parse(cursorKey) as LeadsCursor) : null),
  ["crm-leads-page-v1"],
  { tags: [CRM_TAGS.leads, CRM_TAGS.leadsList], revalidate: 3600 },
);

/** Leads + contato/empresa vinculados, até o limite. `truncated` = há leads mais antigos fora da lista. */
export async function getCachedLeads(): Promise<{ leads: LeadRow[]; truncated: boolean }> {
  const leads: LeadRow[] = [];
  let cursor: LeadsCursor | null = null;
  do {
    const page: { rows: LeadRow[]; next: LeadsCursor | null } = await getCachedLeadsPage(cursor ? JSON.stringify(cursor) : "");
    leads.push(...page.rows);
    cursor = page.next;
  } while (cursor && leads.length < LEADS_LIST_LIMIT);
  return { leads: leads.slice(0, LEADS_LIST_LIMIT), truncated: Boolean(cursor) || leads.length > LEADS_LIST_LIMIT };
}

export const getCachedContactOptions = unstable_cache(() => listContactOptions(), ["crm-contacts-v1"], {
  tags: [CRM_TAGS.contacts],
  revalidate: 3600,
});

export const getCachedCompanyOptions = unstable_cache(() => listCompanyOptions(), ["crm-companies-v1"], {
  tags: [CRM_TAGS.companies],
  revalidate: 3600,
});

/** Usuários do painel (Firebase Auth listUsers) — mudam raramente. */
export const getCachedAdmins = unstable_cache(() => listAdminUsers(), ["crm-admins-v1"], {
  tags: [CRM_TAGS.admins],
  revalidate: 600,
});

export const getCachedTemplates = unstable_cache(() => listTemplates(), ["crm-templates-v1"], {
  tags: [CRM_TAGS.templates],
  revalidate: 3600,
});

// ── Contatos e empresas (telas próprias) ─────────────────────────────────────

const getCachedContactsPage = unstable_cache(
  async (cursorKey: string) => listContactsPage(cursorKey ? (JSON.parse(cursorKey) as PageCursor) : null),
  ["crm-contacts-page-v1"],
  { tags: [CRM_TAGS.contacts, CRM_TAGS.companies], revalidate: 3600 },
);

/** Lista de contatos (com o nome da empresa), em páginas cacheadas. */
export async function getCachedContacts(): Promise<{ contacts: ContactRow[]; truncated: boolean }> {
  const contacts: ContactRow[] = [];
  let cursor: PageCursor | null = null;
  do {
    const page: { rows: ContactRow[]; next: PageCursor | null } = await getCachedContactsPage(cursor ? JSON.stringify(cursor) : "");
    contacts.push(...page.rows);
    cursor = page.next;
  } while (cursor && contacts.length < CONTACTS_LIST_LIMIT);
  return { contacts: contacts.slice(0, CONTACTS_LIST_LIMIT), truncated: Boolean(cursor) };
}

const getCachedClientIds = unstable_cache(async () => [...(await activeClientIds())], ["crm-clients-v1"], {
  tags: [CRM_TAGS.companies],
  revalidate: 3600,
});

const getCachedCompaniesPage = unstable_cache(
  async (cursorKey: string) => {
    const clients = new Set(await getCachedClientIds());
    return listCompaniesPage(cursorKey ? (JSON.parse(cursorKey) as PageCursor) : null, clients);
  },
  ["crm-companies-page-v1"],
  { tags: [CRM_TAGS.companies], revalidate: 3600 },
);

/** Lista de empresas (com Cliente/Prospect), em páginas cacheadas. */
export async function getCachedCompanies(): Promise<{ companies: CompanyRow[]; truncated: boolean }> {
  const companies: CompanyRow[] = [];
  let cursor: PageCursor | null = null;
  do {
    const page: { rows: CompanyRow[]; next: PageCursor | null } = await getCachedCompaniesPage(cursor ? JSON.stringify(cursor) : "");
    companies.push(...page.rows);
    cursor = page.next;
  } while (cursor && companies.length < COMPANIES_LIST_LIMIT);
  return { companies: companies.slice(0, COMPANIES_LIST_LIMIT), truncated: Boolean(cursor) };
}

/** Página do contato (inclui leads dele → também depende de crm-leads). */
/**
 * Página do contato. Tags: o próprio contato + leads (lista de leads dele) + empresas (nome da empresa).
 * Editar OUTRO contato não invalida esta página.
 */
export function getCachedContactDetail(id: string) {
  return unstable_cache(() => getContactDetail(id), ["crm-contact-detail-v2", id], {
    tags: [contactTag(id)!, CRM_TAGS.leads, CRM_TAGS.companies],
    revalidate: 3600,
  })();
}

/** Página da empresa (funcionários, leads, negociações, contratos). */
/**
 * Página da empresa. Tags: a própria empresa + leads (leads/negociações dela). Mudanças nos
 * funcionários invalidam a tag da empresa afetada (as rotas de contato sabem qual é).
 */
export function getCachedCompanyDetail(id: string) {
  return unstable_cache(() => getCompanyDetail(id), ["crm-company-detail-v2", id], {
    tags: [companyTag(id)!, CRM_TAGS.leads],
    revalidate: 3600,
  })();
}
