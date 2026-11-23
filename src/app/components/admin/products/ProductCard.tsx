"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaArrowDown, FaArrowUp, FaCalendarDay, FaClone, FaEllipsisVertical, FaEye, FaEyeSlash, FaPen, FaTag, FaTrash } from "react-icons/fa6";
import { iconOf } from "@/app/components/public/home/plans/planIcons";
import { productBillings } from "@/lib/admin/crm/options";
import type { ProductRow } from "@/lib/admin/crm/types";
import { shortDate } from "@/lib/site/plans";
import { PRODUCT_ICONS, integer, livePrice, money, percent, promoCountdown, promoState } from "./productVisuals";

interface ProductCardProps {
  product: ProductRow;
  /** Fatia do faturamento mensal do catálogo (0–1). */
  share: number;
  href: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onPromotion: () => void;
  onPriceChange: () => void;
  now: number;
}

function Menu({ items }: { items: { label: string; icon: typeof FaPen; onClick: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative z-10">
      <button
        type="button"
        aria-label="Ações do produto"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center border border-border-card text-white/60 transition-colors hover:border-border-secondary hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
      >
        <FaEllipsisVertical aria-hidden className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 w-56 overflow-hidden border border-border-secondary bg-background-secondary py-1.5 shadow-2xl shadow-black">
          {items.map(({ label, icon: Icon, onClick, danger, disabled }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30 ${
                danger ? "text-admin-danger" : "text-white/85 hover:text-white"
              }`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Etiqueta monocromática no estilo do site (caixa alta, borda fina). */
function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "solid" | "live" }) {
  const style =
    tone === "solid" ? "border-white bg-white text-background" : tone === "live" ? "border-border-secondary text-white" : "border-border-card text-white/55";
  return <span className={`inline-flex h-6 items-center gap-1.5 border px-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${style}`}>{children}</span>;
}

/** "647,00" — formato dos cards do site. */
const amount = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Card do catálogo com a identidade visual do site: fundo preto em moldura de borda fina, título em
 * caixa alta, preço como na landing e ícones brancos. O produto em destaque ganha o degradê azul do site.
 * O card inteiro abre a página do produto.
 */
export default function ProductCard({ product: p, share, href, canMoveUp, canMoveDown, busy, onEdit, onToggleActive, onMove, onDelete, onDuplicate, onPromotion, onPriceChange, now }: ProductCardProps) {
  const live = livePrice(p, now);
  const promo = promoState(p, now);
  const hasPrice = p.billing !== "sob_consulta";
  const recurring = p.billing !== "unico";
  const shown = p.features.slice(0, 4);
  const never = p.stats.total_contracts === 0;
  const onSite = p.site_visible && p.active;
  const Icon = PRODUCT_ICONS[p.icon];
  const goal = recurring && p.monthly_goal ? p.stats.mrr / p.monthly_goal : null;
  const bar = goal ?? share;
  const off = live.original && live.price !== null ? Math.round((1 - live.price / live.original) * 100) : 0;

  return (
    <article
      className={`group relative border p-2 transition-colors ${
        p.highlight ? "border-primary/50 hover:border-primary" : "border-border-primary hover:border-border-secondary"
      } ${p.active ? "" : "opacity-55 hover:opacity-80"} ${busy ? "pointer-events-none animate-pulse" : ""}`}
    >
      <div className={`flex h-full min-h-[380px] flex-col ${p.highlight ? "bg-gradient-to-b from-primary/45 via-background-secondary to-background-secondary" : "bg-background-secondary"}`}>
        {/* Topo: ícone, nome e ações */}
        <header className="flex items-start justify-between gap-3 p-6 pb-0">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-border-card bg-white/[0.03] text-white">
              <Icon aria-hidden className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-bold uppercase leading-6 tracking-tight text-white">
                <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
                  {p.name}
                </Link>
              </h3>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-white/45">{productBillings.label(p.billing)}</p>
            </div>
          </div>
          <Menu
            items={[
              { label: "Editar", icon: FaPen, onClick: onEdit },
              ...(hasPrice
                ? [
                    { label: promo ? "Ver promoção" : "Lançar promoção", icon: FaTag, onClick: onPromotion },
                    { label: p.price_change ? "Alterar reajuste" : "Agendar reajuste", icon: FaCalendarDay, onClick: onPriceChange },
                  ]
                : []),
              { label: "Duplicar", icon: FaClone, onClick: onDuplicate },
              { label: p.active ? "Desativar" : "Ativar", icon: p.active ? FaEyeSlash : FaEye, onClick: onToggleActive },
              { label: "Mover para cima", icon: FaArrowUp, onClick: () => onMove("up"), disabled: !canMoveUp },
              { label: "Mover para baixo", icon: FaArrowDown, onClick: () => onMove("down"), disabled: !canMoveDown },
              ...(never ? [{ label: "Excluir", icon: FaTrash, onClick: onDelete, danger: true }] : []),
            ]}
          />
        </header>

        {/* Situação */}
        <div className="flex flex-wrap gap-1.5 px-6 pt-4">
          <Tag tone={onSite ? "live" : "muted"}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${onSite ? "bg-admin-success" : "bg-white/30"}`} />
            {onSite ? "No site" : "Fora do site"}
          </Tag>
          {p.highlight && <Tag tone="live">Destaque</Tag>}
          {!p.active && <Tag>Inativo</Tag>}
          {promo && (
            <Tag tone="solid">
              <FaTag aria-hidden className="h-2.5 w-2.5" /> {promo.promo.name}
              {promo.status === "scheduled" ? " · agendada" : ""}
            </Tag>
          )}
        </div>

        {/* Preço (igual à landing) */}
        <div className="px-6 pt-5">
          {live.original !== null && (
            <p className="text-sm text-white/45">
              <span className="line-through">
                R$ {amount(live.original)}
                {p.billing === "mensal" ? "/mês" : ""}
              </span>
              <span className="ml-2 font-semibold text-white">-{off}%</span>
            </p>
          )}
          {live.price !== null ? (
            <p className="flex items-start gap-1">
              <span className="pt-1 text-sm text-white/50">R$</span>
              <span className="text-[34px] font-medium leading-10 tracking-tight text-white">{amount(live.price)}</span>
              {p.billing === "mensal" && <span className="self-end pb-1 text-sm text-white/50">/mês</span>}
            </p>
          ) : (
            <p className="text-[28px] font-normal uppercase leading-10 text-white">{p.site_price_label ?? "Sob consulta"}</p>
          )}
          <p className="mt-1 text-xs text-white/45">
            {[
              p.setup_fee && recurring ? `+ R$ ${amount(p.setup_fee)} de implantação` : null,
              recurring && p.min_term_months ? `fidelidade de ${p.min_term_months} meses` : null,
              p.billing === "unico" ? "pagamento único" : null,
            ]
              .filter(Boolean)
              .join(" · ") || " "}
          </p>
          {promo && <p className="mt-1 text-xs font-medium text-white/60">Promoção {promoCountdown(promo.promo, promo.status, now)}</p>}
          {p.price_change && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-white/70">
              <FaCalendarDay aria-hidden className="h-3 w-3" /> R$ {amount(p.price_change.new_price)} a partir de {shortDate(p.price_change.effective_date)}
            </p>
          )}
        </div>

        {/* Itens (ícones do site) */}
        <div className="flex flex-1 flex-col gap-2.5 px-6 pt-5">
          {p.description && <p className="line-clamp-2 text-sm leading-5 text-white/65">{p.description}</p>}
          {shown.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {shown.map((f, i) => {
                const FeatureIcon = iconOf(p.feature_icons[i] ?? "check");
                return (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] leading-5 text-white/85">
                    <FeatureIcon aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-white" />
                    <span className="line-clamp-1">{f}</span>
                  </li>
                );
              })}
              {p.features.length > shown.length && <li className="pl-6 text-xs text-white/40">+{p.features.length - shown.length} itens</li>}
            </ul>
          ) : (
            !p.description && <p className="text-[13px] text-white/35">Sem descrição nem itens inclusos — edite para aparecer completo no site.</p>
          )}
        </div>

        {/* Números */}
        <footer className="mt-5 border-t border-border-primary">
          <dl className="grid grid-cols-2 divide-x divide-border-primary">
            <div className="px-6 py-4">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">{recurring ? "Clientes ativos" : "Vendas"}</dt>
              <dd className="mt-1 text-lg font-medium leading-6 text-white">{integer.format(recurring ? p.stats.active_contracts : p.stats.one_time_sales)}</dd>
            </div>
            <div className="px-6 py-4">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">{recurring ? "Faturamento/mês" : "Receita no ano"}</dt>
              <dd className="mt-1 text-lg font-medium leading-6 text-white">{money(recurring ? p.stats.mrr : p.stats.year_revenue)}</dd>
            </div>
          </dl>
          {recurring && (
            <div className="flex items-center gap-3 px-6 pb-5">
              <div
                className="h-1 flex-1 overflow-hidden bg-white/10"
                role="progressbar"
                aria-label={goal !== null ? "Meta mensal" : "Fatia do faturamento mensal"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(1, bar) * 100)}
              >
                <div className={`h-full ${goal !== null && goal >= 1 ? "bg-admin-success" : "bg-white"}`} style={{ width: `${Math.min(100, Math.round(bar * 100))}%` }} />
              </div>
              <span className="shrink-0 text-[11px] text-white/45">
                {goal !== null ? `${percent.format(goal)} da meta de ${money(p.monthly_goal!)}` : `${percent.format(share)} do mensal`}
              </span>
            </div>
          )}
        </footer>
      </div>
    </article>
  );
}
