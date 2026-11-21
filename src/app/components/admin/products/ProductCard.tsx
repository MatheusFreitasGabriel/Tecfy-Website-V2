"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaArrowDown, FaArrowUp, FaCheck, FaEllipsisVertical, FaEye, FaEyeSlash, FaPen, FaStar, FaTrash } from "react-icons/fa6";
import type { ProductRow } from "@/lib/admin/crm/types";
import { BillingBadge, ProductIconBox, colorVar, integer, money, percent, priceParts } from "./productVisuals";

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
        className="flex h-9 w-9 items-center justify-center rounded-lg text-admin-text-hint transition-colors hover:bg-admin-badge hover:text-text-primary focus-visible:outline-2 focus-visible:outline-admin-accent"
      >
        <FaEllipsisVertical aria-hidden className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 w-52 overflow-hidden rounded-xl bg-admin-card py-1.5 shadow-2xl outline outline-1 -outline-offset-1 outline-admin-card-border">
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
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-admin-badge disabled:cursor-not-allowed disabled:opacity-40 ${
                danger ? "text-admin-danger" : "text-text-primary"
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

/** Card do catálogo: identidade, preço, itens inclusos e números do produto. O card inteiro abre a página dele. */
export default function ProductCard({ product: p, share, href, canMoveUp, canMoveDown, busy, onEdit, onToggleActive, onMove, onDelete }: ProductCardProps) {
  const price = priceParts(p);
  const shown = p.features.slice(0, 4);
  const never = p.stats.total_contracts === 0;

  return (
    <article
      style={colorVar(p.color)}
      className={`group relative flex min-h-[360px] flex-col overflow-hidden rounded-2xl bg-background-kpi outline outline-1 -outline-offset-1 transition-[outline-color,transform] focus-within:outline-(--pc)/60 hover:-translate-y-0.5 hover:outline-(--pc)/60 ${
        p.highlight ? "outline-(--pc)/45" : "outline-admin-card-border"
      } ${p.active ? "" : "opacity-60"} ${busy ? "pointer-events-none animate-pulse" : ""}`}
    >
      <span aria-hidden className="h-1 w-full bg-(--pc)" />
      <div className="flex flex-1 flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ProductIconBox icon={p.icon} color={p.color} />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold leading-6 text-text-primary">
                <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
                  {p.name}
                </Link>
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <BillingBadge billing={p.billing} />
                {p.highlight && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-md bg-(--pc)/15 px-2 text-[11px] font-semibold uppercase tracking-wide text-(--pc)">
                    <FaStar aria-hidden className="h-2.5 w-2.5" /> Destaque
                  </span>
                )}
                {!p.active && <span className="inline-flex h-6 items-center rounded-md bg-admin-deal-paused px-2 text-[11px] font-semibold uppercase tracking-wide text-admin-deal-paused-text">Inativo</span>}
              </div>
            </div>
          </div>
          <Menu
            items={[
              { label: "Editar", icon: FaPen, onClick: onEdit },
              { label: p.active ? "Desativar" : "Ativar", icon: p.active ? FaEyeSlash : FaEye, onClick: onToggleActive },
              { label: "Mover para cima", icon: FaArrowUp, onClick: () => onMove("up"), disabled: !canMoveUp },
              { label: "Mover para baixo", icon: FaArrowDown, onClick: () => onMove("down"), disabled: !canMoveDown },
              ...(never ? [{ label: "Excluir", icon: FaTrash, onClick: onDelete, danger: true }] : []),
            ]}
          />
        </header>

        <div>
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className={`font-semibold leading-9 text-text-primary ${p.billing === "sob_consulta" ? "text-2xl" : "text-[30px]"}`}>{price.main}</span>
            {price.suffix && <span className="text-sm font-medium text-admin-text-description">{price.suffix}</span>}
          </p>
          {price.extra && <p className="text-xs font-medium leading-4 text-admin-text-hint">{price.extra}</p>}
          {p.billing !== "unico" && p.min_term_months ? <p className="mt-1 text-xs font-medium leading-4 text-admin-text-hint">Fidelidade de {p.min_term_months} meses</p> : null}
        </div>

        {p.description && <p className="line-clamp-2 text-sm font-medium leading-5 text-admin-text-description">{p.description}</p>}

        {shown.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {shown.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px] font-medium leading-5 text-admin-text-label">
                <FaCheck aria-hidden className="mt-1 h-3 w-3 shrink-0 text-(--pc)" />
                <span className="line-clamp-1">{f}</span>
              </li>
            ))}
            {p.features.length > shown.length && <li className="pl-5 text-xs font-medium text-admin-text-hint">+{p.features.length - shown.length} itens</li>}
          </ul>
        )}

        <footer className="mt-auto flex flex-col gap-3 border-t border-admin-divider pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-admin-text-hint">{p.billing === "unico" ? "Vendas" : "Clientes ativos"}</p>
              <p className="text-lg font-semibold leading-6 text-text-primary">{integer.format(p.billing === "unico" ? p.stats.one_time_sales : p.stats.active_contracts)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-admin-text-hint">{p.billing === "unico" ? "Receita no ano" : "Faturamento/mês"}</p>
              <p className="text-lg font-semibold leading-6 text-text-primary">{money(p.billing === "unico" ? p.stats.year_revenue : p.stats.mrr)}</p>
            </div>
          </div>
          {p.billing !== "unico" && (
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-admin-badge" aria-hidden>
                <div className="h-full rounded-full bg-(--pc)" style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
              <span className="w-24 text-right text-[11px] font-medium text-admin-text-hint">{percent.format(share)} do mensal</span>
            </div>
          )}
        </footer>
      </div>
    </article>
  );
}
