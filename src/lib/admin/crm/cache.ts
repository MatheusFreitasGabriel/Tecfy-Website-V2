import "server-only";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { SITE_PLANS_TAG } from "@/lib/site/plans";
import { listAdminUsers } from "./admins";
import { LEADS_LIST_LIMIT, listCompanyOptions, listContactOptions, listLeadsPage, type LeadsCursor } from "./leads";
import { COMPANIES_LIST_LIMIT, activeClientIds, getCompanyDetail, listCompaniesPage } from "./companies";
import { CONTACTS_LIST_LIMIT, getContactDetail, listContactsPage, type PageCursor } from "./contacts";
import type { CompanyRow, ContactRow, LeadRow } from "./types";
import { listTemplates } from "./templatesStore";
import { DEALS_LIST_LIMIT, listDealsPage, listOpenTaskDue, listPipelineSetup, placeDeals, type DealsCursor } from "./deals";
import type { DealRow, TaskRow } from "./types";

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
  deals: "crm-deals",
  pipelines: "crm-pipelines",
  tasks: "crm-tasks",
  products: "crm-products",
  /** Histórico da tela "Importar lista". */
  imports: "crm-imports",
  /** Contratos (venda, reabrir, cancelar): números da tela Produtos. */
  contracts: "crm-contracts",
  /** O que está publicado no site (retrato + publicações), visto pelo painel. */
  site: "crm-site",
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

/** Últimas importações de planilha (tela Importar lista). */
export const getCachedImports = unstable_cache(async () => (await import("./leadImport/commit")).listImports(), ["crm-imports-v1"], {
  tags: [CRM_TAGS.imports],
  revalidate: 3600,
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
  ["crm-companies-page-v2"],
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

// ── Negociações ─────────────────────────────────────────────────────────────

/** Quadros e funis (poucos documentos; muda só na tela de gerenciar funis). */
export const getCachedPipelineSetup = unstable_cache(() => listPipelineSetup(), ["crm-pipelines-v1"], {
  tags: [CRM_TAGS.pipelines],
  revalidate: 3600,
});

/** Vencimentos das tarefas abertas (indicadores "hoje"/"atrasadas" e alertas dos cards). */
export const getCachedOpenTaskDue = unstable_cache(() => listOpenTaskDue(), ["crm-open-tasks-v1"], {
  tags: [CRM_TAGS.tasks],
  revalidate: 3600,
});

/** Uma página de negociações (até 1.000) — mostra nome de contato/empresa, então depende deles. */
const getCachedDealsPage = unstable_cache(
  async (cursorKey: string) => listDealsPage(cursorKey ? (JSON.parse(cursorKey) as DealsCursor) : null),
  ["crm-deals-page-v1"],
  { tags: [CRM_TAGS.deals, CRM_TAGS.contacts, CRM_TAGS.companies], revalidate: 3600 },
);

/** Negociações já posicionadas num funil/etapa válidos, com os vencimentos das tarefas. */
export async function getCachedDeals(): Promise<{ deals: DealRow[]; truncated: boolean }> {
  const setupPromise = getCachedPipelineSetup();
  const tasksPromise = getCachedOpenTaskDue();
  const deals: DealRow[] = [];
  let cursor: DealsCursor | null = null;
  do {
    const page: { rows: DealRow[]; next: DealsCursor | null } = await getCachedDealsPage(cursor ? JSON.stringify(cursor) : "");
    deals.push(...page.rows);
    cursor = page.next;
  } while (cursor && deals.length < DEALS_LIST_LIMIT);
  const [setup, tasks] = await Promise.all([setupPromise, tasksPromise]);
  return { deals: placeDeals(deals.slice(0, DEALS_LIST_LIMIT), setup.pipelines, tasks), truncated: Boolean(cursor) };
}

/** Produtos ativos para "Marcar como venda" (só leitura; a tela Produtos é do usuário). 5 min de cache. */
export const getCachedProductOptions = unstable_cache(async () => (await import("./dealDetail")).listProductOptions(), ["crm-products-v3"], {
  tags: [CRM_TAGS.products],
  revalidate: 300,
});

/** Tag de UM produto (página do produto). */
export const productTag = (id: string | null | undefined) => (id ? `crm-product-${id}` : null);

/** Catálogo com os números de cada produto (dependem dos contratos). */
export const getCachedProducts = unstable_cache(async () => (await import("./products")).listProducts(), ["crm-products-list-v2"], {
  tags: [CRM_TAGS.products, CRM_TAGS.contracts],
  revalidate: 3600,
});

/** Página do produto: contratos com nome da empresa → também depende de empresas. */
export function getCachedProductDetail(id: string) {
  return unstable_cache(async () => (await import("./products")).getProductDetail(id), ["crm-product-detail-v2", id], {
    tags: [productTag(id)!, CRM_TAGS.products, CRM_TAGS.contracts, CRM_TAGS.companies, CRM_TAGS.leads],
    revalidate: 3600,
  })();
}

/** Retrato publicado do site + publicações (tela Produtos). */
export const getCachedSiteState = unstable_cache(async () => (await import("./siteCatalog")).getSiteState(), ["crm-site-state-v1"], {
  tags: [CRM_TAGS.site],
  revalidate: 3600,
});

/**
 * Depois de mudar o que está no ar (publicar, restaurar, promoção, reajuste): painel + landing.
 * A landing lê `site_content/plans` com a tag `site-plans` (ver `src/lib/site/getSitePlans.ts`).
 */
export function invalidateSite(...extra: (CrmTag | string | null | undefined)[]): void {
  invalidateCrm(CRM_TAGS.site, SITE_PLANS_TAG, ...extra);
  revalidatePath("/");
}

// ── Tarefas ─────────────────────────────────────────────────────────────────

const getCachedOpenTasksPage = unstable_cache(async (after: string) => (await import("./tasks")).listOpenTasksPage(after || null), ["crm-tasks-open-v1"], {
  tags: [CRM_TAGS.tasks],
  revalidate: 3600,
});
const getCachedDoneTasks = unstable_cache(async () => (await import("./tasks")).listRecentDoneTasks(), ["crm-tasks-done-v1"], {
  tags: [CRM_TAGS.tasks],
  revalidate: 3600,
});

/** Abertas (todas, até o limite) + concluídas nos últimos 60 dias. Só lê o Firestore quando algo mudou. */
export async function getCachedTasks(): Promise<{ tasks: TaskRow[]; truncated: boolean }> {
  const { TASKS_OPEN_LIMIT } = await import("./tasks");
  const donePromise = getCachedDoneTasks();
  const open: TaskRow[] = [];
  let after: string | null = null;
  do {
    const page: { rows: TaskRow[]; next: string | null } = await getCachedOpenTasksPage(after ?? "");
    open.push(...page.rows);
    after = page.next;
  } while (after && open.length < TASKS_OPEN_LIMIT);
  return { tasks: [...open, ...(await donePromise)], truncated: Boolean(after) };
}
