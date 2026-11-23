import Link from "next/link";
import { FaArrowRight } from "react-icons/fa6";
import type { DashboardSummary, FunnelStep } from "@/lib/admin/crm/dashboardMetrics";
import { leadSources } from "@/lib/admin/crm/options";
import KpiCard from "./KpiCard";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** Mostrado no lugar do número quando a leitura falha. */
const UNAVAILABLE = "—";

export interface Missing {
  leads: boolean;
  deals: boolean;
  tasks: boolean;
}

/** Nível 1 — os 6 números principais de todas as áreas, numa faixa só. */
export function HeadlineStrip({ basePath, summary: s, missing }: { basePath: string; summary: DashboardSummary; missing: Missing }) {
  const href = (path: string) => `${basePath}${path}`;
  const leadsDelta = s.leadsLastMonth > 0 ? s.leadsMonth / s.leadsLastMonth - 1 : null;
  return (
    <section aria-label="Resumo" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard size="sm" label="Faturamento mensal" value={brl0.format(s.mrr)} delta={s.mrrDelta} hint="vs. mês passado" href={href("/produtos")} />
      <KpiCard
        size="sm"
        label="Contratos ativos"
        value={integer.format(s.activeContracts)}
        hint={s.newContractsMonth ? `+${s.newContractsMonth} este mês` : "nenhum novo este mês"}
        href={href("/produtos")}
      />
      <KpiCard size="sm" label="Leads no mês" value={missing.leads ? UNAVAILABLE : integer.format(s.leadsMonth)} delta={missing.leads ? null : leadsDelta} hint="vs. mês passado" href={href("/leads")} />
      <KpiCard
        size="sm"
        label="Em negociação"
        value={missing.deals ? UNAVAILABLE : brl0.format(s.pipelineValue)}
        hint={missing.deals ? undefined : `${integer.format(s.openDeals)} aberta(s)`}
        href={href("/negociacoes")}
      />
      <KpiCard size="sm" label="Lead → negociação" value={missing.leads ? UNAVAILABLE : percent.format(s.conversion90)} hint="últimos 90 dias" href={href("/leads")} />
      <KpiCard
        size="sm"
        label="Tarefas atrasadas"
        value={missing.tasks ? UNAVAILABLE : integer.format(s.overdueTasks)}
        alert={!missing.tasks && s.overdueTasks > 0}
        hint="do time inteiro"
        href={href("/tarefas")}
      />
    </section>
  );
}

function Panel({ title, subtitle, link, children }: { title: string; subtitle: string; link?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="border border-border-primary p-1.5">
      <div className="flex h-full flex-col gap-4 bg-background-secondary p-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-tight text-white">{title}</h3>
            <p className="text-xs text-white/45">{subtitle}</p>
          </div>
          {link && (
            <Link href={link} className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/55 hover:text-white">
              Ver <FaArrowRight aria-hidden className="h-2.5 w-2.5" />
            </Link>
          )}
        </header>
        {children}
      </div>
    </section>
  );
}

function BarRows({ rows, empty }: { rows: { label: string; value: string; ratio: number }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-white/45">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium uppercase tracking-wide text-white">{r.label}</span>
            <span className="shrink-0 text-xs text-white/55">{r.value}</span>
          </span>
          <span className="h-1.5 bg-white/[0.06]">
            <span className="block h-full bg-[#5B2BFF]" style={{ width: `${Math.max(2, Math.round(r.ratio * 100))}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Funil da mesma turma de leads: barras proporcionais ao primeiro passo + conversão entre passos. */
function Funnel({ steps, missing }: { steps: FunnelStep[]; missing: boolean }) {
  if (missing) return <p className="text-sm text-white/45">Não foi possível carregar leads ou negociações.</p>;
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => {
        const prev = steps[i - 1];
        const rate = prev && prev.value ? step.value / prev.value : null;
        return (
          <li key={step.label} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium uppercase tracking-wide text-white">
                {step.label} <span className="normal-case tracking-normal text-white/40">· {step.hint}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-white">
                {integer.format(step.value)}
                {rate !== null && <span className="ml-2 text-xs font-medium text-white/45">{percent.format(rate)}</span>}
              </span>
            </span>
            <span className="h-2.5 bg-white/[0.06]">
              <span className="block h-full" style={{ width: `${Math.max(step.value ? 2 : 0, Math.round((step.value / top) * 100))}%`, background: i === steps.length - 1 ? "#9A72F5" : "#5B2BFF" }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Nível 3 — detalhes abaixo da dobra: finanças, funil, produtos e origem dos leads. */
export function DashboardDetails({ basePath, summary: s, funnel, missing }: { basePath: string; summary: DashboardSummary; funnel: FunnelStep[]; missing: Missing }) {
  const href = (path: string) => `${basePath}${path}`;
  const yearDelta = s.lastYearSamePeriod > 0 ? s.yearRevenue / s.lastYearSamePeriod - 1 : null;
  const maxProduct = Math.max(1, ...s.topProducts.map((p) => p.mrr));
  const maxSource = Math.max(1, ...s.leadSources90.map((x) => x.count));

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Finanças" className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">Finanças</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard size="sm" label="Receita recorrente anual" value={brl0.format(s.arr)} hint="mensal × 12" />
          <KpiCard size="sm" label="Ticket médio" value={brl.format(s.avgTicket)} hint="por contrato / mês" />
          <KpiCard size="sm" label="Faturado no ano" value={brl0.format(s.yearRevenue)} delta={yearDelta} hint={yearDelta !== null ? "vs. ano passado" : "jan → hoje"} />
          <KpiCard size="sm" label="Previsão até dezembro" value={brl0.format(s.yearForecast)} hint="faturado + ativos" />
          <KpiCard size="sm" label="Cancelamentos no mês" value={integer.format(s.cancellationsMonth)} alert={s.cancellationsMonth > 0} hint={`churn de ${percent.format(s.churnMonth)}`} />
          <KpiCard size="sm" label="Taxa de ganho" value={missing.deals || s.winRate === null ? UNAVAILABLE : percent.format(s.winRate)} hint="vendidas ÷ fechadas (12 m)" href={href("/negociacoes")} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Funil comercial" subtitle="Da entrada do lead até a venda" link={href("/negociacoes")}>
          <Funnel steps={funnel} missing={missing.leads || missing.deals} />
        </Panel>
        <Panel title="Produtos que mais faturam" subtitle="Faturamento mensal dos contratos ativos" link={href("/produtos")}>
          <BarRows empty="Nenhum contrato ativo ainda." rows={s.topProducts.map((p) => ({ label: p.name, value: `${brl0.format(p.mrr)}/mês · ${p.contracts}`, ratio: p.mrr / maxProduct }))} />
        </Panel>
        <Panel title="De onde vêm os leads" subtitle="Origem dos leads dos últimos 90 dias" link={href("/leads")}>
          <BarRows
            empty={missing.leads ? "Não foi possível carregar os leads." : "Nenhum lead nos últimos 90 dias."}
            rows={s.leadSources90.slice(0, 5).map((x) => ({ label: leadSources.label(x.source) === "—" ? "Não informada" : leadSources.label(x.source), value: `${x.count} lead(s)`, ratio: x.count / maxSource }))}
          />
        </Panel>
      </div>
    </div>
  );
}
