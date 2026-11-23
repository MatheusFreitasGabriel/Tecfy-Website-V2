"use client";

import { useMemo, useState } from "react";
import { computeProductAnalytics, type MonthPoint } from "@/lib/admin/crm/productAnalytics";
import type { ProductDetail } from "@/lib/admin/crm/types";
import { GoalBar, brl, integer, monthLabel, money, percent } from "./productVisuals";

const W = 640;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 56 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

/** Escala "bonita" para o eixo y (0 → máx arredondado, 4 divisões). */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => (s * pow * 4) >= max) ?? 10;
  return step * pow * 4;
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const shortMonth = (key: string) => monthLabel(key).split("/")[0];

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border ${className ?? ""}`}>
      <header>
        <h3 className="text-base font-medium text-text-primary">{title}</h3>
        {subtitle && <p className="text-xs font-medium text-admin-text-hint">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-admin-drawer-card p-4">
      <p className="text-xs font-medium text-admin-drawer-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
      {hint && <p className="text-[11px] font-medium text-admin-text-hint">{hint}</p>}
    </div>
  );
}

/** Tooltip HTML posicionado sobre o SVG (em % da largura). */
function Tip({ x, children }: { x: number; children: React.ReactNode }) {
  const left = (x / W) * 100;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-lg bg-admin-card px-3 py-2 text-xs font-medium text-admin-text-label shadow-xl outline outline-1 -outline-offset-1 outline-admin-card-border"
      style={{ left: `clamp(80px, ${left}%, calc(100% - 80px))` }}
    >
      {children}
    </div>
  );
}

function Axis({ max, months, format }: { max: number; months: MonthPoint[]; format: (v: number) => string }) {
  const step = innerW / months.length;
  return (
    <g className="text-admin-text-hint" fontSize="11" fill="currentColor">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD.top + innerH - t * innerH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="currentColor" strokeOpacity={t === 0 ? 0.5 : 0.15} />
            <text x={PAD.left - 8} y={y + 4} textAnchor="end">
              {format(max * t)}
            </text>
          </g>
        );
      })}
      {months.map((m, i) =>
        i % 2 === months.length % 2 ? null : (
          <text key={m.month} x={PAD.left + step * i + step / 2} y={H - 8} textAnchor="middle">
            {shortMonth(m.month)}
          </text>
        ),
      )}
    </g>
  );
}

/** Linha única (faturamento por mês) com cruz + tooltip. */
function LineChart({ months, value, label }: { months: MonthPoint[]; value: (m: MonthPoint) => number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...months.map(value)));
  const step = innerW / months.length;
  const x = (i: number) => PAD.left + step * i + step / 2;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const path = months.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(value(m))}`).join(" ");
  const area = `${path} L${x(months.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const last = months[months.length - 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label} nos últimos 12 meses`} onMouseLeave={() => setHover(null)}>
        <Axis max={max} months={months} format={(v) => (v ? compact.format(v) : "0")} />
        <path d={area} fill="var(--pc)" fillOpacity={0.12} />
        <path d={path} fill="none" stroke="var(--pc)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="currentColor" className="text-admin-text-hint" strokeDasharray="3 3" />}
        <circle cx={x(months.length - 1)} cy={y(value(last))} r={4} fill="var(--pc)" stroke="var(--background-kpi)" strokeWidth={2} />
        {hover !== null && <circle cx={x(hover)} cy={y(value(months[hover]))} r={5} fill="var(--pc)" stroke="var(--background-kpi)" strokeWidth={2} />}
        {months.map((m, i) => (
          <rect key={m.month} x={PAD.left + step * i} y={PAD.top} width={step} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
        ))}
      </svg>
      {hover !== null && (
        <Tip x={x(hover)}>
          <p className="text-admin-text-hint">{monthLabel(months[hover].month)}</p>
          <p className="text-sm font-semibold text-text-primary">{money(value(months[hover]))}</p>
        </Tip>
      )}
    </div>
  );
}

const SALES_COLOR = "var(--pc)";
const CANCEL_COLOR = "var(--admin-stage-slate)";

/** Vendas novas × cancelamentos por mês (barras lado a lado, uma escala). */
function SalesBars({ months }: { months: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...months.map((m) => Math.max(m.newSales, m.cancellations)));
  const top = Math.ceil(max / 4) * 4;
  const step = innerW / months.length;
  const bar = Math.min(12, (step - 8) / 2);
  const h = (v: number) => (v / top) * innerH;
  const base = PAD.top + innerH;

  // Barra com topo arredondado (4px) e base reta no eixo.
  const shape = (x: number, height: number) => {
    if (height <= 0) return "";
    const r = Math.min(4, height, bar / 2);
    const y = base - height;
    return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bar - r} Q${x + bar},${y} ${x + bar},${y + r} V${base} Z`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-xs font-medium text-admin-text-label" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SALES_COLOR }} /> Vendas novas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CANCEL_COLOR }} /> Cancelamentos
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Vendas novas e cancelamentos por mês" onMouseLeave={() => setHover(null)}>
          <Axis max={top} months={months} format={(v) => integer.format(Math.round(v))} />
          {months.map((m, i) => {
            const cx = PAD.left + step * i + step / 2;
            return (
              <g key={m.month} opacity={hover === null || hover === i ? 1 : 0.45}>
                <path d={shape(cx - bar - 1, h(m.newSales))} fill={SALES_COLOR} />
                <path d={shape(cx + 1, h(m.cancellations))} fill={CANCEL_COLOR} />
                <rect x={PAD.left + step * i} y={PAD.top} width={step} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Tip x={PAD.left + step * hover + step / 2}>
            <p className="text-admin-text-hint">{monthLabel(months[hover].month)}</p>
            <p>
              Vendas novas: <strong className="text-text-primary">{months[hover].newSales}</strong>
            </p>
            <p>
              Cancelamentos: <strong className="text-text-primary">{months[hover].cancellations}</strong>
            </p>
            {months[hover].leads > 0 && <p>Leads do site: {months[hover].leads}</p>}
          </Tip>
        )}
      </div>
    </div>
  );
}

interface ProductAnalyticsProps {
  product: ProductDetail;
  now: number;
}

/** Aba "Visão geral": evolução, retenção, leads do site, cancelamentos e promoções. */
export default function ProductAnalytics({ product: p, now }: ProductAnalyticsProps) {
  const a = useMemo(() => computeProductAnalytics(p.contracts, p.leads, p.promotions, now), [p.contracts, p.leads, p.promotions, now]);
  const recurring = p.billing !== "unico";
  const [table, setTable] = useState(false);
  const maxReason = Math.max(1, ...a.cancelReasons.map((r) => r.count));
  const hasSales = p.contracts.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {recurring && p.monthly_goal ? (
        <div className="rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border">
          <GoalBar value={p.stats.mrr} goal={p.monthly_goal} />
          <p className="mt-2 text-xs font-medium text-admin-text-hint">
            {p.stats.mrr >= p.monthly_goal ? "Meta batida! 🎉" : `Faltam ${brl.format(p.monthly_goal - p.stats.mrr)}/mês — cerca de ${Math.ceil((p.monthly_goal - p.stats.mrr) / Math.max(1, a.avgTicket || (p.monthly_price ?? 1)))} venda(s) no ticket médio.`}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {recurring ? (
          <>
            <Stat label="Tempo médio como cliente" value={a.avgLifetimeMonths ? `${a.avgLifetimeMonths.toFixed(1).replace(".", ",")} meses` : "—"} />
            <Stat label="Valor do cliente (LTV)" value={a.ltv ? brl.format(a.ltv) : "—"} hint="ticket × tempo médio + implantação" />
            <Stat label="Churn" value={percent.format(a.churnRate)} hint="contratos cancelados ÷ total" />
          </>
        ) : (
          <>
            <Stat label="Vendas" value={integer.format(p.stats.one_time_sales)} />
            <Stat label="Valor médio" value={brl.format(p.stats.one_time_sales ? a.lifetimeRevenue / p.stats.one_time_sales : 0)} />
            <Stat label="Receita no ano" value={brl.format(p.stats.year_revenue)} />
          </>
        )}
        <Stat label="Receita total gerada" value={brl.format(a.lifetimeRevenue)} hint="desde a primeira venda" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={recurring ? "Faturamento mensal" : "Receita por mês"} subtitle="Últimos 12 meses · passe o mouse para ver cada mês">
          {hasSales ? <LineChart months={a.months} value={(m) => (recurring ? m.mrr : m.revenue)} label={recurring ? "Faturamento mensal" : "Receita"} /> : <Empty />}
        </Card>
        <Card title="Vendas × cancelamentos" subtitle="Contratos novos e cancelados por mês">
          {hasSales ? <SalesBars months={a.months} /> : <Empty />}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Leads do site" subtitle={`Pediram o plano "${p.name}" no formulário`}>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Leads" value={integer.format(a.leads.total)} />
            <Stat label="Viraram negociação" value={percent.format(a.leads.conversion)} hint={`${a.leads.converted} lead(s)`} />
            <Stat label="Lead → venda" value={percent.format(a.leads.toContract)} />
          </div>
          {a.leads.total === 0 && <p className="text-xs font-medium text-admin-text-hint">Conta os leads cujo plano de interesse tem o mesmo nome do produto.</p>}
        </Card>

        <Card title="Motivos de cancelamento" subtitle={a.cancelReasons.length ? `${p.stats.cancelled} cancelamento(s)` : undefined}>
          {a.cancelReasons.length === 0 ? (
            <p className="text-sm font-medium text-admin-text-description">Nenhum cancelamento. 👏</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {a.cancelReasons.map((r) => (
                <li key={r.reason} className="flex flex-col gap-1">
                  <span className="flex justify-between text-[13px] font-medium text-admin-text-label">
                    {r.reason} <span className="text-text-primary">{r.count}</span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-admin-badge">
                    <span className="block h-full rounded-full bg-(--pc)" style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Promoções" subtitle="Vendas feitas durante cada promoção">
          {a.promotions.length === 0 ? (
            <p className="text-sm font-medium text-admin-text-description">Nenhuma promoção lançada ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-admin-divider">
              {a.promotions.map((pr) => (
                <li key={pr.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 truncate text-[13px] font-semibold text-text-primary">{pr.name}</span>
                  <span className="shrink-0 text-right text-xs font-medium text-admin-text-description">
                    {pr.sales} venda(s)
                    {pr.mrr ? ` · ${money(pr.mrr)}/mês` : ""}
                    {pr.avgDiscount !== null ? ` · ${percent.format(pr.avgDiscount)} off` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {a.negotiatedDiscounts > 0 && <p className="text-xs font-medium text-admin-text-hint">{a.negotiatedDiscounts} venda(s) fora de promoção com preço abaixo da tabela.</p>}
        </Card>
      </div>

      <div>
        <button type="button" onClick={() => setTable((v) => !v)} className="text-xs font-semibold text-admin-accent hover:underline">
          {table ? "Esconder tabela" : "Ver os números em tabela"}
        </button>
        {table && (
          <div className="mt-3 overflow-x-auto rounded-xl outline outline-1 -outline-offset-1 outline-admin-card-border">
            <table className="w-full min-w-[560px] text-left text-[13px] font-medium">
              <thead className="bg-admin-table-head text-xs text-admin-table-head-text">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Mês</th>
                  <th className="px-4 py-2.5 font-medium">Faturamento mensal</th>
                  <th className="px-4 py-2.5 font-medium">Receita do mês</th>
                  <th className="px-4 py-2.5 font-medium">Vendas</th>
                  <th className="px-4 py-2.5 font-medium">Cancelamentos</th>
                  <th className="px-4 py-2.5 font-medium">Leads</th>
                </tr>
              </thead>
              <tbody>
                {[...a.months].reverse().map((m) => (
                  <tr key={m.month} className="border-t border-admin-table-divider bg-admin-table text-admin-text-label">
                    <td className="px-4 py-2">{monthLabel(m.month)}</td>
                    <td className="px-4 py-2 text-text-primary">{money(m.mrr)}</td>
                    <td className="px-4 py-2">{money(m.revenue)}</td>
                    <td className="px-4 py-2">{m.newSales}</td>
                    <td className="px-4 py-2">{m.cancellations}</td>
                    <td className="px-4 py-2">{m.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <p className="flex h-[180px] items-center justify-center text-sm font-medium text-admin-text-hint">Sem vendas ainda: o gráfico aparece com a primeira venda.</p>;
}
