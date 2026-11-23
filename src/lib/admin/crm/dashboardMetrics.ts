/**
 * Números do Dashboard — módulo PURO (servidor e cliente). Segue as regras de `revenue.ts`:
 * mensalidade conta em todo mês em que o contrato está ativo (o mês do cancelamento é o último
 * cobrado); implantação e pagamento único contam no mês da assinatura. Meses no fuso de Brasília.
 */
import type { ProductBilling, LeadSource } from "./options";

/** Contrato em formato serializável (vai do servidor para o gráfico). */
export interface ContractLite {
  id: string;
  product_id: string;
  product_name: string;
  /** Nome da empresa (do cache de empresas), quando houver. */
  company_name: string | null;
  /** Fidelidade mínima (meses); 0 = sem. */
  min_term_months: number;
  billing: ProductBilling;
  monthly_value: number;
  setup_value: number;
  one_time_value: number;
  status: "active" | "cancelled";
  /** ISO. */
  signed_at: string;
  cancelled_at: string | null;
}

const monthFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });
/** "AAAA-MM" em Brasília. */
export const monthKey = (d: string | number | Date) => monthFmt.format(new Date(d)).slice(0, 7);
export const addMonths = (key: string, delta: number) => {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
const round = (v: number) => Math.round(v * 100) / 100;

/** Recorrente cobrando no mês `key`. */
function billedIn(c: ContractLite, key: string): boolean {
  if (c.billing === "unico") return false;
  if (monthKey(c.signed_at) > key) return false;
  if (c.status === "cancelled" && c.cancelled_at && monthKey(c.cancelled_at) < key) return false;
  return true;
}

export interface RevenueMonth {
  /** "AAAA-MM". */
  month: string;
  /** Mensalidades cobradas no mês. */
  recurring: number;
  /** Implantação + pagamento único assinados no mês. */
  oneOff: number;
  total: number;
  /** Mês futuro: só a previsão das mensalidades dos contratos ativos hoje. */
  projected: boolean;
  newContracts: number;
  cancellations: number;
}

/** Faturamento de janeiro a dezembro de `year`. Meses depois do atual = previsão (contratos ativos hoje). */
export function revenueByMonth(contracts: ContractLite[], year: number, now: number): RevenueMonth[] {
  const current = monthKey(now);
  const signed = contracts.filter((c) => Date.parse(c.signed_at) <= now);
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const projected = month > current;
    let recurring = 0;
    let oneOff = 0;
    let newContracts = 0;
    let cancellations = 0;
    for (const c of signed) {
      if (projected) {
        if (c.status === "active" && c.billing !== "unico") recurring += c.monthly_value;
        continue;
      }
      if (billedIn(c, month)) recurring += c.monthly_value;
      if (monthKey(c.signed_at) === month) {
        oneOff += c.setup_value + c.one_time_value;
        newContracts += 1;
      }
      if (c.status === "cancelled" && c.cancelled_at && monthKey(c.cancelled_at) === month) cancellations += 1;
    }
    return { month, recurring: round(recurring), oneOff: round(oneOff), total: round(recurring + oneOff), projected, newContracts, cancellations };
  });
}

/** Anos com dados (do primeiro contrato até o ano atual). */
export function revenueYears(contracts: ContractLite[], now: number): number[] {
  const current = Number(monthKey(now).slice(0, 4));
  const first = contracts.reduce((min, c) => Math.min(min, Number(monthKey(c.signed_at).slice(0, 4))), current);
  return Array.from({ length: current - first + 1 }, (_, i) => current - i);
}

// ── Resumo do topo ───────────────────────────────────────────────────────────

export interface LeadLite {
  created_at: string | null;
  source: LeadSource | null;
  deal_id: string | null;
}
export interface DealLite {
  status: "em_andamento" | "pausada" | "perdida" | "vendida" | string;
  value_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface TaskLite {
  due_at: string;
  done_at: string | null;
}

export interface DashboardSummary {
  mrr: number;
  /** Variação do faturamento mensal contra o mês passado (0.12 = +12%); null sem base. */
  mrrDelta: number | null;
  activeContracts: number;
  avgTicket: number;
  /** Faturado no ano até o mês atual. */
  yearRevenue: number;
  /** Faturado + previsto até dezembro. */
  yearForecast: number;
  /** Faturamento do mesmo período do ano passado (jan → mês atual), para comparar. */
  lastYearSamePeriod: number;
  newContractsMonth: number;
  cancellationsMonth: number;
  /** Cancelamentos do mês ÷ contratos ativos no início do mês. */
  churnMonth: number;
  /** Receita anual recorrente (faturamento mensal × 12). */
  arr: number;
  leadsMonth: number;
  leadsLastMonth: number;
  /** Leads dos últimos 90 dias que viraram negociação. */
  conversion90: number;
  leadSources90: { source: string; count: number }[];
  openDeals: number;
  pipelineValue: number;
  /** Vendidas ÷ (vendidas + perdidas), últimos 12 meses. */
  winRate: number | null;
  overdueTasks: number;
  topProducts: { name: string; mrr: number; contracts: number }[];
}

const DAY = 86_400_000;

export function computeSummary(input: { contracts: ContractLite[]; leads: LeadLite[] | null; deals: DealLite[] | null; tasks: TaskLite[] | null }, now: number): DashboardSummary {
  const { contracts } = input;
  const current = monthKey(now);
  const previous = addMonths(current, -1);
  const signed = contracts.filter((c) => Date.parse(c.signed_at) <= now);
  const recurringActive = signed.filter((c) => c.status === "active" && c.billing !== "unico");
  const mrr = round(recurringActive.reduce((s, c) => s + c.monthly_value, 0));
  const mrrPrev = round(signed.filter((c) => billedIn(c, previous)).reduce((s, c) => s + c.monthly_value, 0));

  const year = Number(current.slice(0, 4));
  const months = revenueByMonth(contracts, year, now);
  const lastYear = revenueByMonth(contracts, year - 1, now);
  const monthIndex = Number(current.slice(5, 7));
  const yearRevenue = round(months.filter((m) => !m.projected).reduce((s, m) => s + m.total, 0));
  const yearForecast = round(months.reduce((s, m) => s + m.total, 0));
  const lastYearSamePeriod = round(lastYear.slice(0, monthIndex).reduce((s, m) => s + m.total, 0));
  const thisMonth = months[monthIndex - 1];
  const activeAtStart = signed.filter((c) => billedIn(c, previous)).length;

  const products = new Map<string, { mrr: number; contracts: number }>();
  for (const c of recurringActive) {
    const p = products.get(c.product_name) ?? { mrr: 0, contracts: 0 };
    p.mrr += c.monthly_value;
    p.contracts += 1;
    products.set(c.product_name, p);
  }

  const leads = input.leads ?? [];
  const inMonth = (iso: string | null, key: string) => Boolean(iso) && monthKey(iso!) === key;
  const recent = leads.filter((l) => l.created_at && now - Date.parse(l.created_at) <= 90 * DAY);
  const sources = new Map<string, number>();
  for (const l of recent) sources.set(l.source ?? "outro", (sources.get(l.source ?? "outro") ?? 0) + 1);

  const deals = input.deals ?? [];
  const open = deals.filter((d) => d.status === "em_andamento" || d.status === "pausada");
  const closed = deals.filter((d) => (d.status === "vendida" || d.status === "perdida") && d.updated_at && now - Date.parse(d.updated_at) <= 365 * DAY);
  const won = closed.filter((d) => d.status === "vendida").length;

  return {
    mrr,
    mrrDelta: mrrPrev > 0 ? mrr / mrrPrev - 1 : null,
    activeContracts: recurringActive.length,
    avgTicket: recurringActive.length ? mrr / recurringActive.length : 0,
    yearRevenue,
    yearForecast,
    lastYearSamePeriod,
    newContractsMonth: thisMonth.newContracts,
    cancellationsMonth: thisMonth.cancellations,
    churnMonth: activeAtStart ? thisMonth.cancellations / activeAtStart : 0,
    arr: round(mrr * 12),
    leadsMonth: leads.filter((l) => inMonth(l.created_at, current)).length,
    leadsLastMonth: leads.filter((l) => inMonth(l.created_at, previous)).length,
    conversion90: recent.length ? recent.filter((l) => l.deal_id).length / recent.length : 0,
    leadSources90: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    openDeals: open.length,
    pipelineValue: open.reduce((s, d) => s + (d.value_cents ?? 0), 0) / 100,
    winRate: closed.length ? won / closed.length : null,
    overdueTasks: (input.tasks ?? []).filter((t) => !t.done_at && Date.parse(t.due_at) < now).length,
    topProducts: [...products.entries()]
      .map(([name, p]) => ({ name, mrr: round(p.mrr), contracts: p.contracts }))
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 5),
  };
}

// ── Precisa de atenção ───────────────────────────────────────────────────────

export interface AttentionRow {
  id: string;
  title: string;
  detail: string;
  /** Caminho relativo ao painel ("/negociacoes/x"). */
  path: string;
  danger?: boolean;
}
export interface AttentionSection {
  key: "tasks" | "deals" | "leads" | "renewals";
  title: string;
  /** Total (a lista mostra só os primeiros). */
  count: number;
  rows: AttentionRow[];
  /** "Ver todos". */
  path: string;
}

export interface AttentionInput {
  contracts: ContractLite[];
  leads: { id: string; title: string; stage: string; status: string; created_at: string | null }[] | null;
  deals: { id: string; title: string; status: string; last_activity_at: string | null; updated_at: string | null; created_at: string | null }[] | null;
  tasks: { id: string; title: string; due_at: string; done_at: string | null; assignee_uid: string | null; parent: { label: string } | null }[] | null;
  promos: { productId: string; productName: string; name: string; ends_at: string | null; starts_at: string }[];
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const days = (ms: number) => Math.floor(ms / DAY);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const CLOSED_LEAD = new Set(["perdido", "convertido", "arquivado"]);

/** Último mês da fidelidade ("AAAA-MM") — mesma regra de `termEndMonth` em revenue.ts. */
function termEnd(signedAt: string, months: number): string | null {
  if (!months || months < 1) return null;
  return addMonths(monthKey(signedAt), months - 1);
}

/** O que pede ação hoje: tarefas, negociações paradas, leads sem contato e renovações. */
export function computeAttention(input: AttentionInput, uid: string | null, now: number, limit = 3): AttentionSection[] {
  const today = dayFmt.format(new Date(now));
  const sections: AttentionSection[] = [];

  // 1. Suas tarefas: atrasadas primeiro, depois as de hoje.
  const mine = (input.tasks ?? [])
    .filter((t) => !t.done_at && (!uid || t.assignee_uid === uid) && dayFmt.format(new Date(t.due_at)) <= today)
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  sections.push({
    key: "tasks",
    title: "Suas tarefas",
    count: mine.length,
    path: "/tarefas",
    rows: mine.slice(0, limit).map((t) => {
      const late = Date.parse(t.due_at) < now;
      const isToday = dayFmt.format(new Date(t.due_at)) === today;
      return {
        id: t.id,
        title: t.title,
        detail: [late ? (isToday ? `Atrasada · era ${timeFmt.format(new Date(t.due_at))}` : `Atrasada desde ${shortFmt.format(new Date(t.due_at))}`) : `Hoje · ${timeFmt.format(new Date(t.due_at))}`, t.parent?.label].filter(Boolean).join(" · "),
        path: "/tarefas",
        danger: late,
      };
    }),
  });

  // 2. Negociações abertas sem atividade há mais de 14 dias.
  const stalled = (input.deals ?? [])
    .filter((d) => d.status === "em_andamento")
    .map((d) => ({ d, idle: now - Date.parse(d.last_activity_at ?? d.updated_at ?? d.created_at ?? new Date(now).toISOString()) }))
    .filter((x) => x.idle > 14 * DAY)
    .sort((a, b) => b.idle - a.idle);
  sections.push({
    key: "deals",
    title: "Negociações paradas",
    count: stalled.length,
    path: "/negociacoes",
    rows: stalled.slice(0, limit).map(({ d, idle }) => ({ id: d.id, title: d.title, detail: `Sem atividade há ${plural(days(idle), "dia", "dias")}`, path: `/negociacoes/${d.id}` })),
  });

  // 3. Leads ainda em "Novo lead" há mais de 2 dias.
  const waiting = (input.leads ?? [])
    .filter((l) => l.stage === "novo" && !CLOSED_LEAD.has(l.status) && l.created_at && now - Date.parse(l.created_at) > 2 * DAY)
    .sort((a, b) => Date.parse(a.created_at!) - Date.parse(b.created_at!));
  sections.push({
    key: "leads",
    title: "Leads sem contato",
    count: waiting.length,
    path: "/leads",
    rows: waiting.slice(0, limit).map((l) => ({ id: l.id, title: l.title, detail: `Chegou há ${plural(days(now - Date.parse(l.created_at!)), "dia", "dias")}`, path: "/leads" })),
  });

  // 4. Fidelidade acabando (este mês ou o próximo) + promoções acabando em até 7 dias.
  const current = monthKey(now);
  const next = addMonths(current, 1);
  const renewals: AttentionRow[] = input.contracts
    .filter((c) => c.status === "active" && c.billing !== "unico")
    .map((c) => ({ c, end: termEnd(c.signed_at, c.min_term_months) }))
    .filter((x): x is { c: ContractLite; end: string } => x.end !== null && (x.end === current || x.end === next))
    .sort((a, b) => a.end.localeCompare(b.end))
    .map(({ c, end }) => ({
      id: c.id,
      title: c.company_name ?? c.product_name,
      detail: `${c.product_name} · fidelidade até ${end.slice(5)}/${end.slice(0, 4)}`,
      path: `/produtos/${c.product_id}?aba=contratos`,
      danger: end === current,
    }));
  const promos: AttentionRow[] = input.promos
    .filter((p) => p.ends_at && Date.parse(p.starts_at) <= now && Date.parse(p.ends_at) > now && Date.parse(p.ends_at) - now <= 7 * DAY)
    .map((p) => ({ id: `promo-${p.productId}`, title: `Promoção ${p.name}`, detail: `${p.productName} · acaba em ${shortFmt.format(new Date(p.ends_at!))}`, path: `/produtos/${p.productId}?aba=promocoes` }));
  const ending = [...renewals, ...promos];
  sections.push({ key: "renewals", title: "Renovações e promoções", count: ending.length, path: "/produtos", rows: ending.slice(0, limit) });

  return sections;
}

// ── Funil comercial ──────────────────────────────────────────────────────────

export interface FunnelStep {
  label: string;
  value: number;
  hint: string;
}

/**
 * Funil de uma mesma turma: leads criados nos últimos 90 dias → quantos viraram negociação →
 * quantas dessas negociações foram vendidas.
 */
export function computeFunnel(leads: (LeadLite & { id: string })[] | null, deals: (DealLite & { lead_id: string | null })[] | null, now: number): FunnelStep[] {
  const recent = (leads ?? []).filter((l) => l.created_at && now - Date.parse(l.created_at) <= 90 * DAY);
  const ids = new Set(recent.map((l) => l.id));
  const converted = recent.filter((l) => l.deal_id).length;
  const won = (deals ?? []).filter((d) => d.status === "vendida" && d.lead_id && ids.has(d.lead_id)).length;
  return [
    { label: "Leads", value: recent.length, hint: "entraram nos últimos 90 dias" },
    { label: "Negociações", value: converted, hint: "desses leads" },
    { label: "Vendas", value: won, hint: "dessas negociações" },
  ];
}
