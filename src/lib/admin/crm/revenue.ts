import type { Contract } from "./types";

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
  activeContracts: number;
  /** Soma do valor mensal dos contratos ativos. */
  monthlyRevenue: number;
  /** Soma de valor mensal × meses cobrados no ano corrente (ativos e cancelados neste ano). */
  annualRevenue: number;
}

export function computeDashboardMetrics(contracts: Contract[], now: Date = new Date()): DashboardMetrics {
  let activeContracts = 0;
  let monthlyCents = 0;
  let annualCents = 0;

  for (const contract of contracts) {
    if (contract.signed_at > now) continue;
    const cents = Math.round(contract.monthly_value * 100);
    if (contract.status === "active") {
      activeContracts += 1;
      monthlyCents += cents;
    }
    annualCents += cents * monthsBilledThisYear(contract, now);
  }

  return { activeContracts, monthlyRevenue: monthlyCents / 100, annualRevenue: annualCents / 100 };
}
