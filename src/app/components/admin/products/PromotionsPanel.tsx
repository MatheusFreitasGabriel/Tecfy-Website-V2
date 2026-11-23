"use client";

import { FaCalendarDay, FaPlus, FaStop, FaTag } from "react-icons/fa6";
import type { ProductDetail, PromotionRow } from "@/lib/admin/crm/types";
import { isoShortDate, promoPrice, promoStatus, shortDate } from "@/lib/site/plans";
import Button from "../form/Button";
import { formatDateTime } from "../leads/leadVisuals";
import { money, promoCountdown } from "./productVisuals";

interface PromotionsPanelProps {
  product: ProductDetail;
  now: number;
  busy: boolean;
  onLaunch: () => void;
  onEnd: (promotion: PromotionRow) => void;
  onPriceChange: () => void;
  onCancelPriceChange: () => void;
}

function statusOf(p: PromotionRow, current: string | null, now: number): { label: string; style: string } {
  if (p.ended_early_at && Date.parse(p.ended_early_at) <= Date.parse(p.starts_at)) return { label: "Cancelada", style: "bg-admin-badge text-admin-text-hint" };
  const s = p.id === current ? promoStatus(p, now) : p.ended_early_at || (p.ends_at && Date.parse(p.ends_at) <= now) ? "ended" : promoStatus(p, now);
  if (s === "active") return { label: "No ar", style: "bg-admin-qual-hot text-admin-qual-hot-text" };
  if (s === "scheduled") return { label: "Agendada", style: "bg-admin-tip text-admin-tip-title" };
  return { label: p.ended_early_at ? "Encerrada antes" : "Encerrada", style: "bg-admin-badge text-admin-badge-text" };
}

/** Aba "Promoções": promoção atual, reajuste agendado e o histórico de promoções com vendas. */
export default function PromotionsPanel({ product: p, now, busy, onLaunch, onEnd, onPriceChange, onCancelPriceChange }: PromotionsPanelProps) {
  const current = p.promo && promoStatus(p.promo, now) !== "ended" ? p.promo : null;
  const sales = (id: string) => p.contracts.filter((c) => c.promotion_id === id).length;
  const suffix = p.billing === "mensal" ? "/mês" : "";

  if (p.billing === "sob_consulta") {
    return <p className="p-6 text-sm font-medium text-admin-text-description">Produto sob consulta não tem preço de tabela, então não tem promoções nem reajustes. Mude a cobrança para &quot;Mensal&quot; para usar.</p>;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col justify-between gap-4 rounded-xl bg-admin-drawer-card p-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-admin-text-hint">
              <FaTag aria-hidden className="h-3 w-3" /> Promoção
            </p>
            {current ? (
              <>
                <p className="mt-2 text-lg font-semibold text-text-primary">{current.name}</p>
                <p className="text-sm font-medium text-admin-text-description">
                  {current.kind === "percent" ? `${current.value}% de desconto` : `Preço promocional ${money(current.value)}${suffix}`} · {promoCountdown(current, promoStatus(current, now) === "active" ? "active" : "scheduled", now)}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm font-medium text-admin-text-description">Nenhuma promoção no ar. Ao lançar, o site mostra o preço antigo riscado e um selo com o nome.</p>
            )}
          </div>
          <div className="flex gap-3">
            {current ? (
              <Button variant="danger" icon={FaStop} onClick={() => onEnd(p.promotions.find((x) => x.id === current.id) ?? ({ ...current, list_price: 0, ended_early_at: null, created_by_name: null, created_at: null } as PromotionRow))} disabled={busy}>
                {promoStatus(current, now) === "scheduled" ? "Cancelar promoção" : "Encerrar agora"}
              </Button>
            ) : (
              <Button icon={FaPlus} onClick={onLaunch} disabled={busy}>
                Lançar promoção
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-xl bg-admin-drawer-card p-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-admin-text-hint">
              <FaCalendarDay aria-hidden className="h-3 w-3" /> Reajuste agendado
            </p>
            {p.price_change ? (
              <p className="mt-2 text-sm font-medium text-admin-text-label">
                <strong className="text-lg text-text-primary">{money(p.price_change.new_price)}</strong>
                {suffix} a partir de {shortDate(p.price_change.effective_date)}/{p.price_change.effective_date.slice(0, 4)}
                {p.price_change.created_by_name ? ` · agendado por ${p.price_change.created_by_name}` : ""}
              </p>
            ) : (
              <p className="mt-2 text-sm font-medium text-admin-text-description">Programe um novo preço para uma data (ex.: reajuste anual em 01/01). Vale no site e nas vendas novas.</p>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" icon={FaCalendarDay} onClick={onPriceChange} disabled={busy}>
              {p.price_change ? "Alterar" : "Agendar reajuste"}
            </Button>
            {p.price_change && (
              <Button variant="ghost" onClick={onCancelPriceChange} disabled={busy}>
                Cancelar reajuste
              </Button>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-admin-text-hint">Histórico de promoções ({p.promotions.length})</p>
        {p.promotions.length === 0 ? (
          <p className="text-sm font-medium text-admin-text-description">Nenhuma promoção lançada ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl outline outline-1 -outline-offset-1 outline-admin-card-border">
            <table className="w-full min-w-[760px] text-left text-[13px] font-medium">
              <thead className="bg-admin-table-head text-xs text-admin-table-head-text">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Promoção</th>
                  <th className="px-4 py-2.5 font-medium">Preço</th>
                  <th className="px-4 py-2.5 font-medium">Período</th>
                  <th className="px-4 py-2.5 font-medium">Vendas</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {p.promotions.map((pr, i) => {
                  const st = statusOf(pr, current?.id ?? null, now);
                  const end = pr.ended_early_at ?? pr.ends_at;
                  return (
                    <tr key={pr.id} className={`border-t border-admin-table-divider ${i % 2 ? "bg-admin-table-alt" : "bg-admin-table"}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-text-primary">{pr.name}</p>
                        <p className="text-xs text-admin-text-hint">
                          {formatDateTime(pr.created_at)}
                          {pr.created_by_name ? ` · ${pr.created_by_name}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-admin-text-label">
                        <span className="text-admin-text-hint line-through">{money(pr.list_price)}</span> → <span className="text-text-primary">{money(promoPrice(pr.list_price, pr))}</span>
                        {suffix}
                        <span className="block text-xs text-admin-text-hint">{pr.kind === "percent" ? `${pr.value}% off` : "preço fixo"}</span>
                      </td>
                      <td className="px-4 py-3 text-admin-table-date">
                        {isoShortDate(pr.starts_at)} → {end ? isoShortDate(end) : "sem fim"}
                      </td>
                      <td className="px-4 py-3 text-text-primary">{sales(pr.id)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold uppercase ${st.style}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
