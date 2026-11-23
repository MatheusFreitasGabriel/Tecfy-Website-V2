"use client";

import { useMemo, useState } from "react";
import { useClock } from "@/app/components/public/home/plans/useClock";
import { monthKey, revenueByMonth, type ContractLite, type RevenueMonth } from "@/lib/admin/crm/dashboardMetrics";

/** Paleta validada (dark, superfície #080808): roxo Tecfy + lilás. */
const RECURRING = "#5B2BFF";
const ONE_OFF = "#9A72F5";

const W = 760;
const H = 250;
const PAD = { top: 22, right: 8, bottom: 30, left: 52 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;
const MONTHS_SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function niceMax(max: number): number {
  if (max <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= max) ?? 10;
  return step * pow * 4;
}

/** Barra com só o topo arredondado (4px) e a base reta no eixo. */
function barPath(x: number, y: number, w: number, h: number, roundTop: boolean): string {
  if (h <= 0) return "";
  const r = roundTop ? Math.min(4, h, w / 2) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

interface RevenueChartProps {
  contracts: ContractLite[];
  years: number[];
  renderedAt: number;
}

/** Faturamento da Tecfy de janeiro a dezembro: mensalidades + implantação/único, com previsão dos meses que faltam. */
export default function RevenueChart({ contracts, years, renderedAt }: RevenueChartProps) {
  const now = useClock(renderedAt);
  const [year, setYear] = useState(years[0]);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const months = useMemo(() => revenueByMonth(contracts, year, now), [contracts, year, now]);
  const current = monthKey(now);

  const realized = months.filter((m) => !m.projected);
  const total = realized.reduce((s, m) => s + m.total, 0);
  const forecast = months.reduce((s, m) => s + m.total, 0);
  const best = realized.reduce<RevenueMonth | null>((b, m) => (m.total > (b?.total ?? 0) ? m : b), null);
  const avg = realized.length ? total / realized.length : 0;
  const max = niceMax(Math.max(...months.map((m) => m.total)));
  const step = innerW / 12;
  const barW = Math.min(34, step * 0.6);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const hasData = months.some((m) => m.total > 0);

  return (
    <section aria-label="Faturamento por mês" className="h-full border border-border-primary p-1.5">
      <div className="flex h-full flex-col gap-4 bg-background-secondary p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">Faturamento {year}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-medium tracking-tight text-white">{brl.format(total)}</span>
              <span className="text-xs text-white/45">faturado no ano</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {[
              { label: forecast > total ? "Previsto até dez" : "Total do ano", value: brl.format(forecast) },
              { label: "Média/mês", value: brl.format(avg) },
              { label: "Melhor mês", value: best ? `${MONTHS[Number(best.month.slice(5)) - 1]} · ${compact.format(best.total)}` : "—" },
            ].map((x) => (
              <div key={x.label}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">{x.label}</p>
                <p className="text-sm font-medium text-white">{x.value}</p>
              </div>
            ))}
            {years.length > 1 && (
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano" className="h-8 cursor-pointer border border-border-secondary bg-background-secondary px-2 text-xs font-semibold text-white outline-none [color-scheme:dark]">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-white/60">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5" style={{ background: RECURRING }} /> Mensalidades
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5" style={{ background: ONE_OFF }} /> Implantação / único
          </span>
          {forecast > total && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 border border-dashed" style={{ borderColor: RECURRING, background: "rgb(91 43 255 / 0.18)" }} /> Previsão
            </span>
          )}
        </div>

        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Faturamento por mês em ${year}. Total faturado ${brl.format(total)}.`} onMouseLeave={() => setHover(null)}>
            <defs>
              <pattern id="rev-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="rgb(91 43 255 / 0.14)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(91 43 255 / 0.55)" strokeWidth="2" />
              </pattern>
            </defs>
            {/* Grade e eixo y */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const gy = PAD.top + innerH - t * innerH;
              return (
                <g key={t}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} stroke="#FFFFFF" strokeOpacity={t === 0 ? 0.25 : 0.06} />
                  <text x={PAD.left - 8} y={gy + 4} textAnchor="end" fontSize="10" fill="#FFFFFF" fillOpacity={0.4}>
                    {t === 0 ? "R$ 0" : `R$ ${compact.format(max * t)}`}
                  </text>
                </g>
              );
            })}

            {months.map((m, i) => {
              const cx = PAD.left + step * i + step / 2;
              const x = cx - barW / 2;
              const isCurrent = m.month === current;
              const dim = hover !== null && hover !== i;
              const recH = (m.recurring / max) * innerH;
              const oneH = (m.oneOff / max) * innerH;
              const gap = recH > 0 && oneH > 0 ? 2 : 0;
              const showLabel = m.total > 0 && (isCurrent || hover === i || (best && m.month === best.month));
              return (
                <g key={m.month} opacity={dim ? 0.4 : 1} style={{ transition: "opacity 120ms" }}>
                  {isCurrent && <rect x={PAD.left + step * i + 2} y={PAD.top} width={step - 4} height={innerH} fill="#FFFFFF" fillOpacity={0.03} />}
                  {m.projected ? (
                    <path d={barPath(x, y(m.recurring), barW, recH, true)} fill="url(#rev-hatch)" stroke={RECURRING} strokeOpacity={0.7} strokeDasharray="4 3" />
                  ) : (
                    <>
                      <path d={barPath(x, y(m.recurring), barW, recH, oneH === 0)} fill={RECURRING} />
                      <path d={barPath(x, y(m.total), barW, Math.max(0, oneH - gap), true)} fill={ONE_OFF} />
                    </>
                  )}
                  {showLabel && (
                    <text x={cx} y={y(m.total) - 6} textAnchor="middle" fontSize="10" fontWeight={600} fill="#FFFFFF">
                      {compact.format(m.total)}
                    </text>
                  )}
                  <text x={cx} y={H - 10} textAnchor="middle" fontSize="10" fontWeight={isCurrent ? 700 : 500} fill="#FFFFFF" fillOpacity={isCurrent ? 1 : 0.45}>
                    <title>{MONTHS[i]}</title>
                    {step < 50 ? MONTHS_SHORT[i] : MONTHS[i].toUpperCase()}
                  </text>
                  {/* Área de hover maior que a barra */}
                  <rect x={PAD.left + step * i} y={PAD.top} width={step} height={innerH + 20} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>

          {!hasData && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/45">Sem faturamento em {year}. As vendas marcadas no CRM aparecem aqui.</p>}

          {hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-2 z-10 min-w-[200px] -translate-x-1/2 border border-border-secondary bg-background px-4 py-3 text-xs text-white/70 shadow-2xl shadow-black"
              style={{ left: `clamp(110px, ${((PAD.left + step * hover + step / 2) / W) * 100}%, calc(100% - 110px))` }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                {MONTHS[hover]} {year}
                {months[hover].projected ? " · previsão" : ""}
              </p>
              <p className="mt-1 text-base font-semibold text-white">{brl.format(months[hover].total)}</p>
              <p className="mt-1.5 flex justify-between gap-4">
                <span>Mensalidades</span> <span className="text-white">{brl.format(months[hover].recurring)}</span>
              </p>
              {!months[hover].projected && (
                <>
                  <p className="flex justify-between gap-4">
                    <span>Implantação / único</span> <span className="text-white">{brl.format(months[hover].oneOff)}</span>
                  </p>
                  <p className="mt-1.5 flex justify-between gap-4 border-t border-border-primary pt-1.5">
                    <span>Novos contratos</span> <span className="text-white">{months[hover].newContracts}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span>Cancelamentos</span> <span className="text-white">{months[hover].cancellations}</span>
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div>
          <button type="button" onClick={() => setTable((v) => !v)} className="text-xs font-semibold uppercase tracking-wide text-white/55 hover:text-white">
            {table ? "Esconder tabela" : "Ver em tabela"}
          </button>
          {table && (
            <div className="mt-3 overflow-x-auto border border-border-primary">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-admin-table-head text-white/45">
                  <tr>
                    {["Mês", "Mensalidades", "Implantação / único", "Total", "Novos", "Cancelados"].map((h) => (
                      <th key={h} className="px-4 py-2.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => (
                    <tr key={m.month} className="border-t border-border-primary text-white/75">
                      <td className="px-4 py-2 text-white">
                        {MONTHS[i]}
                        {m.projected ? " (previsão)" : ""}
                      </td>
                      <td className="px-4 py-2">{brl.format(m.recurring)}</td>
                      <td className="px-4 py-2">{m.projected ? "—" : brl.format(m.oneOff)}</td>
                      <td className="px-4 py-2 text-white">{brl.format(m.total)}</td>
                      <td className="px-4 py-2">{m.projected ? "—" : m.newContracts}</td>
                      <td className="px-4 py-2">{m.projected ? "—" : m.cancellations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
