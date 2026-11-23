import Link from "next/link";
import { FaArrowRight } from "react-icons/fa6";
import type { DashboardSummary } from "@/lib/admin/crm/dashboardMetrics";
import { leadSources } from "@/lib/admin/crm/options";
import KpiCard from "./KpiCard";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** Mostrado no lugar do número quando a leitura falha. */
const UNAVAILABLE = "—";

function Group({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">{title}</h2>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${className ?? "xl:grid-cols-4"}`}>{children}</div>
    </section>
  );
}

/** Lista com barra (produtos, origens) no estilo dos cards do site. */
function BarList({ title, subtitle, rows, empty, href }: { title: string; subtitle: string; rows: { label: string; value: string; ratio: number }[]; empty: string; href: string }) {
  return (
    <section aria-label={title} className="border border-border-primary p-1.5">
      <div className="flex h-full flex-col gap-5 bg-background-secondary p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold uppercase tracking-tight text-white">{title}</h3>
            <p className="text-xs text-white/45">{subtitle}</p>
          </div>
          <Link href={href} className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/55 hover:text-white">
            Ver <FaArrowRight aria-hidden className="h-2.5 w-2.5" />
          </Link>
        </header>
        {rows.length === 0 ? (
          <p className="text-sm text-white/45">{empty}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((r) => (
              <li key={r.label} className="flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate font-medium uppercase tracking-wide text-white">{r.label}</span>
                  <span className="shrink-0 text-white/60">{r.value}</span>
                </span>
                <span className="h-1.5 bg-white/[0.06]">
                  <span className="block h-full bg-[#5B2BFF]" style={{ width: `${Math.max(2, Math.round(r.ratio * 100))}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface DashboardKpisProps {
  basePath: string;
  /** null = falha ao ler os contratos. */
  summary: DashboardSummary | null;
  /** Leads/negociações/tarefas não carregaram (mostra "—" só nesses). */
  missing: { leads: boolean; deals: boolean; tasks: boolean };
}

/** Indicadores do Dashboard: financeiro, clientes, comercial + produtos e origem dos leads. */
export default function DashboardKpis({ basePath, summary: s, missing }: DashboardKpisProps) {
  if (!s) {
    return <p className="border border-admin-danger/40 px-5 py-4 text-sm text-admin-danger">Não foi possível carregar os indicadores. Recarregue a página.</p>;
  }
  const href = (path: string) => `${basePath}${path}`;
  const yearDelta = s.lastYearSamePeriod > 0 ? s.yearRevenue / s.lastYearSamePeriod - 1 : null;
  const leadsDelta = s.leadsLastMonth > 0 ? s.leadsMonth / s.leadsLastMonth - 1 : null;
  const maxProduct = Math.max(1, ...s.topProducts.map((p) => p.mrr));
  const maxSource = Math.max(1, ...s.leadSources90.map((x) => x.count));

  return (
    <div className="flex flex-col gap-10">
      <Group title="Financeiro">
        <KpiCard label="Faturamento mensal" value={brl.format(s.mrr)} delta={s.mrrDelta} hint="vs. mês passado" href={href("/produtos")} />
        <KpiCard label="Receita recorrente anual" value={brl0.format(s.arr)} hint="faturamento mensal × 12" />
        <KpiCard label="Faturado no ano" value={brl0.format(s.yearRevenue)} delta={yearDelta} hint={yearDelta !== null ? "vs. mesmo período do ano passado" : "de janeiro até agora"} />
        <KpiCard label="Previsão até dezembro" value={brl0.format(s.yearForecast)} hint="faturado + mensalidades ativas" />
      </Group>

      <Group title="Clientes">
        <KpiCard label="Contratos ativos" value={integer.format(s.activeContracts)} hint={s.activeContracts ? undefined : "Marque uma negociação como vendida."} href={href("/produtos")} />
        <KpiCard label="Ticket médio" value={brl.format(s.avgTicket)} hint="por contrato ativo / mês" />
        <KpiCard label="Novos contratos no mês" value={integer.format(s.newContractsMonth)} hint="vendas assinadas este mês" />
        <KpiCard
          label="Cancelamentos no mês"
          value={integer.format(s.cancellationsMonth)}
          hint={`churn de ${percent.format(s.churnMonth)}`}
          alert={s.cancellationsMonth > 0}
        />
      </Group>

      <Group title="Comercial" className="xl:grid-cols-5">
        <KpiCard label="Leads no mês" value={missing.leads ? UNAVAILABLE : integer.format(s.leadsMonth)} delta={missing.leads ? null : leadsDelta} hint="vs. mês passado" href={href("/leads")} />
        <KpiCard label="Lead → negociação" value={missing.leads ? UNAVAILABLE : percent.format(s.conversion90)} hint="últimos 90 dias" href={href("/leads")} />
        <KpiCard label="Em negociação" value={missing.deals ? UNAVAILABLE : brl0.format(s.pipelineValue)} hint={missing.deals ? undefined : `${integer.format(s.openDeals)} negociação(ões) abertas`} href={href("/negociacoes")} />
        <KpiCard label="Taxa de ganho" value={missing.deals || s.winRate === null ? UNAVAILABLE : percent.format(s.winRate)} hint="vendidas ÷ fechadas (12 meses)" href={href("/negociacoes")} />
        <KpiCard label="Tarefas atrasadas" value={missing.tasks ? UNAVAILABLE : integer.format(s.overdueTasks)} alert={!missing.tasks && s.overdueTasks > 0} hint="do time inteiro" href={href("/tarefas")} />
      </Group>

      <div className="grid gap-4 xl:grid-cols-2">
        <BarList
          title="Produtos que mais faturam"
          subtitle="Faturamento mensal dos contratos ativos"
          href={href("/produtos")}
          empty="Nenhum contrato ativo ainda."
          rows={s.topProducts.map((p) => ({ label: p.name, value: `${brl0.format(p.mrr)}/mês · ${p.contracts} contrato(s)`, ratio: p.mrr / maxProduct }))}
        />
        <BarList
          title="De onde vêm os leads"
          subtitle="Origem dos leads dos últimos 90 dias"
          href={href("/leads")}
          empty={missing.leads ? "Não foi possível carregar os leads." : "Nenhum lead nos últimos 90 dias."}
          rows={s.leadSources90.slice(0, 6).map((x) => ({ label: leadSources.label(x.source) === "—" ? "Não informada" : leadSources.label(x.source), value: `${x.count} lead(s)`, ratio: x.count / maxSource }))}
        />
      </div>
    </div>
  );
}
