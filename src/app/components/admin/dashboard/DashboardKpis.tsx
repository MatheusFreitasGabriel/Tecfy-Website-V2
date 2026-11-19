import { getDashboardMetrics } from "@/lib/admin/crm/contracts";
import type { DashboardMetrics } from "@/lib/admin/crm/revenue";
import ContractsIllustration from "./ContractsIllustration";
import KpiCard from "./KpiCard";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR");

/** Mostrado no lugar do número quando a leitura do Firestore falha. */
const UNAVAILABLE = "—";

/**
 * Indicadores do topo do dashboard, calculados a partir de `contracts`:
 *  - Contratos ativos: vendas marcadas no CRM e não canceladas;
 *  - Faturamento mensal: soma do valor mensal dos ativos;
 *  - Faturamento anual: valor mensal × meses cobrados no ano (do mês da venda até dezembro).
 *
 * Se o Firestore falhar, os cards mostram "—" em vez de derrubar o dashboard inteiro.
 */
export default async function DashboardKpis() {
  let metrics: DashboardMetrics | null = null;
  try {
    metrics = await getDashboardMetrics();
  } catch {
    console.error("Falha ao carregar os indicadores do dashboard");
  }

  if (!metrics) {
    const hint = "Não foi possível carregar. Recarregue a página.";
    return (
      <section aria-label="Indicadores" className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Contratos ativos" value={UNAVAILABLE} hint={hint} illustration={<ContractsIllustration />} />
        <KpiCard label="Faturamento mensal" value={UNAVAILABLE} hint={hint} />
        <KpiCard label="Faturamento anual" value={UNAVAILABLE} hint={hint} />
      </section>
    );
  }

  const empty = metrics.activeContracts === 0 && metrics.annualRevenue === 0;

  return (
    <section aria-label="Indicadores" className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <KpiCard
        label="Contratos ativos"
        value={integer.format(metrics.activeContracts)}
        hint={empty ? "Nenhum contrato ainda — marque um lead como vendido." : undefined}
        illustration={<ContractsIllustration />}
      />
      <KpiCard label="Faturamento mensal" value={brl.format(metrics.monthlyRevenue)} />
      <KpiCard label="Faturamento anual" value={brl.format(metrics.annualRevenue)} />
    </section>
  );
}
