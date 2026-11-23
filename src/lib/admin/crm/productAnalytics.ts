/**
 * Análise de um produto (aba "Visão geral" da página do produto). Módulo PURO: calcula a partir dos
 * contratos e leads já carregados na página. Meses no fuso de Brasília; segue as regras de
 * `revenue.ts` (o mês do cancelamento é o último cobrado).
 */
import type { ContractRow, ProductLeadStats, PromotionRow } from "./types";

const monthFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });
/** "AAAA-MM" em Brasília. */
export const monthKeyOf = (iso: string | number | Date) => monthFmt.format(new Date(iso)).slice(0, 7);

function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

const monthsBetween = (from: string, to: string) => {
  const [a, b] = [from, to].map((k) => k.split("-").map(Number));
  return (b[0] - a[0]) * 12 + (b[1] - a[1]);
};

export interface MonthPoint {
  month: string;
  /** Mensalidades ativas no mês (reais). */
  mrr: number;
  /** Receita cobrada no mês: mensalidades + implantação/único assinados no mês. */
  revenue: number;
  newSales: number;
  cancellations: number;
  leads: number;
}

export interface ProductAnalytics {
  months: MonthPoint[];
  /** Cancelados ÷ contratos recorrentes. */
  churnRate: number;
  /** Tempo médio como cliente (meses), recorrentes. */
  avgLifetimeMonths: number;
  /** Ticket médio mensal dos recorrentes (todos, ativos e cancelados). */
  avgTicket: number;
  /** Valor do cliente ao longo da vida: ticket × tempo médio + implantação média. */
  ltv: number;
  /** Receita total já gerada (mensalidades cobradas até hoje + implantação + único). */
  lifetimeRevenue: number;
  cancelReasons: { reason: string; count: number }[];
  leads: { total: number; converted: number; conversion: number; toContract: number };
  promotions: { id: string; name: string; sales: number; mrr: number; oneTime: number; avgDiscount: number | null }[];
  /** Vendas com preço abaixo do de tabela (fora de promoção) — desconto negociado. */
  negotiatedDiscounts: number;
}

/** Recorrente ativo no mês `key`: assinado até esse mês e não cancelado antes dele. */
function activeIn(c: ContractRow, key: string): boolean {
  if (c.billing === "unico" || !c.signed_at) return false;
  if (monthKeyOf(c.signed_at) > key) return false;
  if (c.status === "cancelled" && c.cancelled_at && monthKeyOf(c.cancelled_at) < key) return false;
  return true;
}

export function computeProductAnalytics(contracts: ContractRow[], leads: ProductLeadStats, promotions: PromotionRow[], now: number, span = 12): ProductAnalytics {
  const current = monthKeyOf(now);
  const keys = Array.from({ length: span }, (_, i) => addMonths(current, i - (span - 1)));
  const signed = contracts.filter((c) => c.signed_at && Date.parse(c.signed_at) <= now);

  const months: MonthPoint[] = keys.map((month) => {
    let mrr = 0;
    let oneOff = 0;
    let newSales = 0;
    let cancellations = 0;
    for (const c of signed) {
      if (activeIn(c, month)) mrr += c.monthly_value;
      if (monthKeyOf(c.signed_at!) === month) {
        newSales += 1;
        oneOff += c.setup_value + c.one_time_value;
      }
      if (c.status === "cancelled" && c.cancelled_at && monthKeyOf(c.cancelled_at) === month) cancellations += 1;
    }
    return { month, mrr: Math.round(mrr * 100) / 100, revenue: Math.round((mrr + oneOff) * 100) / 100, newSales, cancellations, leads: leads.by_month[month] ?? 0 };
  });

  const recurring = signed.filter((c) => c.billing !== "unico");
  const cancelled = recurring.filter((c) => c.status === "cancelled");
  const lifetimes = recurring.map((c) => Math.max(1, monthsBetween(monthKeyOf(c.signed_at!), c.status === "cancelled" && c.cancelled_at ? monthKeyOf(c.cancelled_at) : current) + 1));
  const avgLifetimeMonths = lifetimes.length ? lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length : 0;
  const avgTicket = recurring.length ? recurring.reduce((s, c) => s + c.monthly_value, 0) / recurring.length : 0;
  const avgSetup = recurring.length ? recurring.reduce((s, c) => s + c.setup_value, 0) / recurring.length : 0;
  const lifetimeRevenue =
    recurring.reduce((s, c, i) => s + c.monthly_value * lifetimes[i] + c.setup_value, 0) + signed.filter((c) => c.billing === "unico").reduce((s, c) => s + c.one_time_value, 0);

  const reasons = new Map<string, number>();
  for (const c of cancelled) {
    const reason = (c.cancel_reason ?? "Sem motivo").split(" — ")[0] || "Sem motivo";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const promoStats = promotions.map((p) => {
    const sold = signed.filter((c) => c.promotion_id === p.id);
    const discounts = sold
      .map((c) => {
        const paid = c.billing === "unico" ? c.one_time_value : c.monthly_value;
        return c.list_price ? 1 - paid / c.list_price : null;
      })
      .filter((d): d is number => d !== null);
    return {
      id: p.id,
      name: p.name,
      sales: sold.length,
      mrr: sold.filter((c) => c.billing !== "unico" && c.status === "active").reduce((s, c) => s + c.monthly_value, 0),
      oneTime: sold.reduce((s, c) => s + c.one_time_value + c.setup_value, 0),
      avgDiscount: discounts.length ? discounts.reduce((a, b) => a + b, 0) / discounts.length : null,
    };
  });

  const negotiatedDiscounts = signed.filter((c) => {
    if (c.promotion_id || !c.list_price) return false;
    const paid = c.billing === "unico" ? c.one_time_value : c.monthly_value;
    return paid < c.list_price;
  }).length;

  return {
    months,
    churnRate: recurring.length ? cancelled.length / recurring.length : 0,
    avgLifetimeMonths,
    avgTicket,
    ltv: avgTicket * avgLifetimeMonths + avgSetup,
    lifetimeRevenue,
    cancelReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    leads: {
      total: leads.total,
      converted: leads.converted,
      conversion: leads.total ? leads.converted / leads.total : 0,
      toContract: leads.total ? Math.min(1, signed.length / leads.total) : 0,
    },
    promotions: promoStats,
    negotiatedDiscounts,
  };
}
