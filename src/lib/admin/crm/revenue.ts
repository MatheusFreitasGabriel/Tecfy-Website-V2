import type { Contract, ProductStats } from "./types";

/** Todas as contas de mês usam o fuso de Brasília. */
const TIME_ZONE = "America/Sao_Paulo";

const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric" });

function yearMonth(date: Date): { year: number; month: number } {
  const parts = monthFormatter.formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
  };
}

/**
 * Meses cobrados no ano corrente: do mês da venda (ou janeiro, se a venda foi em ano anterior)
 * até dezembro — ou até o mês do cancelamento, que conta como último mês cobrado.
 * Ex.: venda em novembro → novembro + dezembro = 2.
 */
export function monthsBilledThisYear(contract: Contract, now: Date): number {
  const current = yearMonth(now);
  const start = yearMonth(contract.signed_at);
  if (start.year > current.year) return 0;

  const from = start.year < current.year ? 1 : start.month;
  let to = 12;
  if (contract.status === "cancelled" && contract.cancelled_at) {
    const end = yearMonth(contract.cancelled_at);
    if (end.year < current.year) return 0;
    if (end.year === current.year) to = end.month;
  }
  return Math.max(0, to - from + 1);
}

export interface DashboardMetrics {
  /** Contratos recorrentes ativos (pagamento único não é contrato em andamento). */
  activeContracts: number;
  /** Soma do valor mensal dos contratos recorrentes ativos. */
  monthlyRevenue: number;
  /**
   * Valor mensal × meses cobrados no ano corrente (ativos e cancelados neste ano)
   * + implantação e pagamentos únicos assinados no ano corrente.
   */
  annualRevenue: number;
}

export function computeDashboardMetrics(contracts: Contract[], now: Date = new Date()): DashboardMetrics {
  const s = computeStats(contracts, now);
  return { activeContracts: s.active_contracts, monthlyRevenue: s.mrr, annualRevenue: s.year_revenue };
}

/** Números de um conjunto de contratos (catálogo inteiro ou um produto). */
export function computeStats(contracts: Contract[], now: Date = new Date()): ProductStats {
  const currentYear = yearMonth(now).year;
  let active = 0;
  let monthlyCents = 0;
  let annualCents = 0;
  let cancelled = 0;
  let oneTime = 0;
  let total = 0;

  for (const contract of contracts) {
    if (contract.signed_at > now) continue;
    total += 1;
    if (contract.status === "cancelled") cancelled += 1;
    if (contract.billing === "unico") oneTime += 1;
    const cents = Math.round(contract.monthly_value * 100);
    if (contract.status === "active" && contract.billing !== "unico") {
      active += 1;
      monthlyCents += cents;
    }
    annualCents += cents * monthsBilledThisYear(contract, now);
    // Cobranças de uma vez só entram no ano em que foram assinadas.
    if (yearMonth(contract.signed_at).year === currentYear) {
      annualCents += Math.round(contract.setup_value * 100) + Math.round(contract.one_time_value * 100);
    }
  }

  return {
    active_contracts: active,
    mrr: monthlyCents / 100,
    year_revenue: annualCents / 100,
    cancelled,
    one_time_sales: oneTime,
    total_contracts: total,
  };
}

/** Último mês da fidelidade ("AAAA-MM"): mês da assinatura + (meses − 1). null = sem fidelidade. */
export function termEndMonth(signedAt: Date, minTermMonths: number): string | null {
  if (!minTermMonths || minTermMonths < 1) return null;
  const { year, month } = yearMonth(signedAt);
  const index = year * 12 + (month - 1) + (minTermMonths - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "AAAA-MM" do mês corrente em Brasília. */
export function currentMonthKey(now: Date = new Date()): string {
  const { year, month } = yearMonth(now);
  return `${year}-${String(month).padStart(2, "0")}`;
}
