import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { listAdminUsers } from "./admins";
import { LEADS_LIST_LIMIT, listCompanyOptions, listContactOptions, listLeadsPage, type LeadsCursor } from "./leads";
import type { LeadRow } from "./types";
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
  contacts: "crm-contacts",
  companies: "crm-companies",
  admins: "crm-admins",
  templates: "crm-templates",
} as const;
export type CrmTag = (typeof CRM_TAGS)[keyof typeof CRM_TAGS];

/** Expira na hora (a próxima leitura busca do Firestore). Use depois de cada gravação. */
export function invalidateCrm(...tags: CrmTag[]): void {
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
}

/**
 * Uma página de leads (até 1.500), cacheada pelo cursor. Páginas separadas porque o cache do Next
 * recusa itens acima de 2 MB (5.000 leads numa peça só = 2,2 MB no teste de stress).
 */
const getCachedLeadsPage = unstable_cache(
  async (cursorKey: string) => listLeadsPage(cursorKey ? (JSON.parse(cursorKey) as LeadsCursor) : null),
  ["crm-leads-page-v1"],
  { tags: [CRM_TAGS.leads], revalidate: 3600 },
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
