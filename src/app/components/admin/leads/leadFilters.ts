/**
 * Filtros, ordenação e chips da lista de leads. Módulo puro (sem React):
 * o `LeadsView` guarda o estado e o painel de filtros edita uma cópia antes de aplicar.
 */
import { leadQualifications, leadSources, leadStages, leadStatuses, type Option } from "@/lib/admin/crm/options";
import type { LeadRow } from "@/lib/admin/crm/types";
import { parseCurrencyToCents } from "@/lib/admin/crm/validation";

export type LeadSort = "recent" | "oldest" | "az" | "za" | "value_desc" | "close_asc";
export type LeadView = "all" | "mine" | "website" | "manual";
export type CreatedRange = "any" | "today" | "7d" | "30d" | "90d" | "custom";
export type ConvertedFilter = "all" | "hide" | "only";

/** "Sem responsável" no filtro de responsáveis. */
export const NO_OWNER = "__none__";

export interface LeadFilters {
  query: string;
  sort: LeadSort;
  view: LeadView;
  stages: string[];
  qualifications: string[];
  statuses: string[];
  sources: string[];
  owners: string[];
  created: CreatedRange;
  /** "YYYY-MM-DD" (só com created = custom). */
  createdFrom: string;
  createdTo: string;
  /** Previsão de fechamento, "YYYY-MM-DD". */
  closeFrom: string;
  closeTo: string;
  /** Como digitado ("R$ 1.000,00"). */
  valueMin: string;
  valueMax: string;
  tags: string[];
  plans: string[];
  hasEmail: boolean;
  hasPhone: boolean;
  hasCompany: boolean;
  converted: ConvertedFilter;
}

export const DEFAULT_FILTERS: LeadFilters = {
  query: "",
  sort: "recent",
  view: "all",
  stages: [],
  qualifications: [],
  statuses: [],
  sources: [],
  owners: [],
  created: "any",
  createdFrom: "",
  createdTo: "",
  closeFrom: "",
  closeTo: "",
  valueMin: "",
  valueMax: "",
  tags: [],
  plans: [],
  hasEmail: false,
  hasPhone: false,
  hasCompany: false,
  converted: "all",
};

export const sortOptions: Option<LeadSort>[] = [
  { value: "recent", label: "Mais recentes primeiro" },
  { value: "oldest", label: "Mais antigos primeiro" },
  { value: "az", label: "Nome de A a Z" },
  { value: "za", label: "Nome de Z a A" },
  { value: "value_desc", label: "Maior valor estimado" },
  { value: "close_asc", label: "Previsão de fechamento mais próxima" },
];

export const viewOptions: Option<LeadView>[] = [
  { value: "all", label: "Todos os leads" },
  { value: "mine", label: "Meus leads" },
  { value: "website", label: "Vindos do site" },
  { value: "manual", label: "Cadastrados manualmente" },
];

export const createdOptions: Option<CreatedRange>[] = [
  { value: "any", label: "Qualquer data" },
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "custom", label: "Personalizado" },
];

export const convertedOptions: Option<ConvertedFilter>[] = [
  { value: "all", label: "Mostrar todos" },
  { value: "hide", label: "Ocultar convertidos" },
  { value: "only", label: "Só convertidos" },
];

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const DAY = 24 * 60 * 60 * 1000;

/** Data de hoje em Brasília, "YYYY-MM-DD". */
function todayInBrazil(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}
/** ISO → "YYYY-MM-DD" em Brasília. */
function isoToBrazilDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

/** O lead passa em todos os filtros (menos a busca/visualização, se `skip` pedir)? */
export function matchesLead(lead: LeadRow, f: LeadFilters, currentUid: string, now: Date): boolean {
  if (f.view === "mine" && lead.owner_uid !== currentUid) return false;
  if (f.view === "website" && lead.entry !== "website") return false;
  if (f.view === "manual" && lead.entry !== "manual") return false;

  if (f.stages.length && !f.stages.includes(lead.stage)) return false;
  if (f.qualifications.length && !f.qualifications.includes(lead.qualification)) return false;
  if (f.statuses.length && !f.statuses.includes(lead.status)) return false;
  if (f.sources.length && !(lead.source && f.sources.includes(lead.source))) return false;
  if (f.owners.length && !f.owners.includes(lead.owner_uid ?? NO_OWNER)) return false;
  if (f.tags.length && !f.tags.some((t) => lead.tags.includes(t))) return false;
  if (f.plans.length && !(lead.interest_plan && f.plans.includes(lead.interest_plan))) return false;

  if (f.hasEmail && !(lead.email || lead.contact?.email)) return false;
  if (f.hasPhone && !(lead.phone || lead.contact?.phone)) return false;
  if (f.hasCompany && !lead.company) return false;
  if (f.converted === "hide" && lead.deal_id) return false;
  if (f.converted === "only" && !lead.deal_id) return false;

  if (f.created !== "any") {
    if (!lead.created_at) return false;
    const created = isoToBrazilDate(lead.created_at);
    if (f.created === "today" && created !== todayInBrazil(now)) return false;
    if (f.created === "custom") {
      if (f.createdFrom && created < f.createdFrom) return false;
      if (f.createdTo && created > f.createdTo) return false;
    }
    const days = f.created === "7d" ? 7 : f.created === "30d" ? 30 : f.created === "90d" ? 90 : 0;
    if (days && now.getTime() - new Date(lead.created_at).getTime() > days * DAY) return false;
  }

  if (f.closeFrom || f.closeTo) {
    if (!lead.expected_close_date) return false;
    if (f.closeFrom && lead.expected_close_date < f.closeFrom) return false;
    if (f.closeTo && lead.expected_close_date > f.closeTo) return false;
  }

  const min = parseCurrencyToCents(f.valueMin);
  const max = parseCurrencyToCents(f.valueMax);
  if (min !== null || max !== null) {
    if (lead.estimated_value_cents === null) return false;
    if (min !== null && lead.estimated_value_cents < min) return false;
    if (max !== null && lead.estimated_value_cents > max) return false;
  }

  const terms = normalize(f.query).split(/\s+/).filter(Boolean);
  if (terms.length) {
    const haystack = normalize(`${lead.title} ${lead.owner_name ?? ""} ${lead.contact?.name ?? ""} ${lead.company?.name ?? ""}`);
    if (!terms.every((t) => haystack.includes(t))) return false;
  }
  return true;
}

export function sortLeads(list: LeadRow[], sort: LeadSort): LeadRow[] {
  const byDate = (a: LeadRow, b: LeadRow) => (a.created_at ?? "").localeCompare(b.created_at ?? "");
  const byName = (a: LeadRow, b: LeadRow) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });
  const sorted = [...list];
  switch (sort) {
    case "oldest":
      return sorted.sort(byDate);
    case "az":
      return sorted.sort(byName);
    case "za":
      return sorted.sort((a, b) => byName(b, a));
    case "value_desc":
      return sorted.sort((a, b) => (b.estimated_value_cents ?? -1) - (a.estimated_value_cents ?? -1));
    case "close_asc":
      // Sem previsão vai para o fim.
      return sorted.sort((a, b) => (a.expected_close_date ?? "9999").localeCompare(b.expected_close_date ?? "9999"));
    default:
      return sorted.sort((a, b) => byDate(b, a));
  }
}

export function applyFilters(leads: LeadRow[], f: LeadFilters, currentUid: string, now: Date): LeadRow[] {
  return sortLeads(
    leads.filter((lead) => matchesLead(lead, f, currentUid, now)),
    f.sort,
  );
}

// ── Chips dos filtros ativos ──

export interface FilterChip {
  key: string;
  label: string;
  /** Remove só este filtro. */
  clear: (f: LeadFilters) => LeadFilters;
}

const removeFrom = (list: string[], value: string) => list.filter((v) => v !== value);
const brDate = (value: string) => value.split("-").reverse().join("/");

/** Chips para mostrar abaixo da barra (busca e ordenação não viram chip). */
export function activeChips(f: LeadFilters, ownerNames: Map<string, string>): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.view !== "all") {
    chips.push({ key: "view", label: viewOptions.find((o) => o.value === f.view)!.label, clear: (x) => ({ ...x, view: "all" }) });
  }
  const multi = (field: "stages" | "qualifications" | "statuses" | "sources", prefix: string, label: (v: string) => string) => {
    for (const value of f[field]) {
      chips.push({ key: `${field}-${value}`, label: `${prefix}: ${label(value)}`, clear: (x) => ({ ...x, [field]: removeFrom(x[field], value) }) });
    }
  };
  multi("stages", "Etapa", leadStages.label);
  multi("qualifications", "Qualificação", leadQualifications.label);
  multi("statuses", "Status", leadStatuses.label);
  multi("sources", "Origem", leadSources.label);
  for (const uid of f.owners) {
    chips.push({
      key: `owner-${uid}`,
      label: `Responsável: ${uid === NO_OWNER ? "sem responsável" : (ownerNames.get(uid) ?? "—")}`,
      clear: (x) => ({ ...x, owners: removeFrom(x.owners, uid) }),
    });
  }
  for (const tag of f.tags) chips.push({ key: `tag-${tag}`, label: `Tag: ${tag}`, clear: (x) => ({ ...x, tags: removeFrom(x.tags, tag) }) });
  for (const plan of f.plans) {
    chips.push({ key: `plan-${plan}`, label: `Plano: ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`, clear: (x) => ({ ...x, plans: removeFrom(x.plans, plan) }) });
  }
  if (f.created !== "any") {
    const label =
      f.created === "custom"
        ? `Criado ${f.createdFrom ? `de ${brDate(f.createdFrom)}` : ""} ${f.createdTo ? `até ${brDate(f.createdTo)}` : ""}`.replace(/\s+/g, " ").trim()
        : `Criado: ${createdOptions.find((o) => o.value === f.created)!.label.toLowerCase()}`;
    chips.push({ key: "created", label, clear: (x) => ({ ...x, created: "any", createdFrom: "", createdTo: "" }) });
  }
  if (f.closeFrom || f.closeTo) {
    const label = `Fechamento ${f.closeFrom ? `de ${brDate(f.closeFrom)}` : ""} ${f.closeTo ? `até ${brDate(f.closeTo)}` : ""}`.replace(/\s+/g, " ").trim();
    chips.push({ key: "close", label, clear: (x) => ({ ...x, closeFrom: "", closeTo: "" }) });
  }
  if (f.valueMin || f.valueMax) {
    const label = `Valor ${f.valueMin ? `a partir de ${f.valueMin}` : ""} ${f.valueMax ? `até ${f.valueMax}` : ""}`.replace(/\s+/g, " ").trim();
    chips.push({ key: "value", label, clear: (x) => ({ ...x, valueMin: "", valueMax: "" }) });
  }
  if (f.hasEmail) chips.push({ key: "hasEmail", label: "Com e-mail", clear: (x) => ({ ...x, hasEmail: false }) });
  if (f.hasPhone) chips.push({ key: "hasPhone", label: "Com WhatsApp", clear: (x) => ({ ...x, hasPhone: false }) });
  if (f.hasCompany) chips.push({ key: "hasCompany", label: "Com empresa", clear: (x) => ({ ...x, hasCompany: false }) });
  if (f.converted !== "all") {
    chips.push({ key: "converted", label: convertedOptions.find((o) => o.value === f.converted)!.label, clear: (x) => ({ ...x, converted: "all" }) });
  }
  return chips;
}

/** Quantos filtros do painel estão ativos (para o "Filtros (n)"). */
export function countActiveFilters(f: LeadFilters): number {
  return activeChips(f, new Map()).length + (f.sort !== "recent" ? 1 : 0);
}
