/**
 * Números do Dashboard — módulo PURO (servidor e cliente). Segue as regras de `revenue.ts`:
 * mensalidade conta em todo mês em que o contrato está ativo (o mês do cancelamento é o último
 * cobrado); implantação e pagamento único contam no mês da assinatura. Meses no fuso de Brasília.
 */
import type { ProductBilling, LeadSource } from "./options";

/** Contrato em formato serializável (vai do servidor para o gráfico). */
export interface ContractLite {
  product_name: string;
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
