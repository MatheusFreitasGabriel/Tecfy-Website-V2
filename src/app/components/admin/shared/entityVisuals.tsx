"use client";

import Link from "next/link";
import { FaArrowRight, FaBriefcase, FaCircle } from "react-icons/fa6";
import { entityStatuses, type EntityStatus } from "@/lib/admin/crm/options";
import Tooltip from "../form/Tooltip";

/** Selo Ativo / Inativo (contatos e empresas). */
export function StatusBadge({ status }: { status: EntityStatus }) {
  const active = status === "ativo";
  return (
    <Tooltip label={`Status: ${entityStatuses.label(status)}`} description={entityStatuses.hint(status)}>
      <span
        tabIndex={0}
        className={`inline-flex h-6 items-center gap-1.5 border px-2 text-[10px] font-semibold uppercase tracking-[0.08em] outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          active ? "border-border-secondary text-white/90" : "border-border-card text-white/50"
        }`}
      >
        <FaCircle aria-hidden className={`h-1.5 w-1.5 ${active ? "text-admin-success" : "text-white/30"}`} />
        {entityStatuses.label(status)}
      </span>
    </Tooltip>
  );
}

/** Selo Cliente / Prospect (empresas). Cliente = tem produto/contrato ativo. */
export function ClientBadge({ isClient, compact = false }: { isClient: boolean; compact?: boolean }) {
  if (!isClient && compact) return null;
  return (
    <Tooltip
      label={isClient ? "Cliente" : "Prospect"}
      description={isClient ? "Tem produto/contrato ativo." : "Ainda sem produto contratado. Vira cliente quando um produto for atribuído."}
    >
      <span
        tabIndex={0}
        className={`inline-flex h-6 items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] outline-none focus-visible:ring-2 focus-visible:ring-admin-accent ${
          isClient ? "border border-white bg-white text-background" : "border border-border-card text-white/55"
        }`}
      >
        <FaBriefcase aria-hidden className="h-2.5 w-2.5" />
        {isClient ? "Cliente" : "Prospect"}
      </span>
    </Tooltip>
  );
}

/** Botão "Abrir" da última coluna das listas (vai para a página do registro). */
export function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Tooltip label="Abrir">
      <Link
        href={href}
        aria-label={label}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-admin-text-hint transition-colors hover:bg-admin-card hover:text-text-primary focus-visible:outline-2 focus-visible:outline-admin-accent"
      >
        <FaArrowRight aria-hidden className="h-4 w-4" />
      </Link>
    </Tooltip>
  );
}

/** Cabeçalho de seção das páginas de detalhe (título + ação opcional à direita). */
export function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold leading-[22px] text-text-primary">
        {title}
        {count !== undefined && (
          <span className="rounded-md bg-admin-badge px-2 py-0.5 text-xs font-semibold text-admin-badge-text">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** Cartão das páginas de detalhe. */
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-background-kpi p-6 outline outline-1 -outline-offset-1 outline-admin-table-border ${className}`}>{children}</section>;
}

/** Par rótulo/valor das páginas de detalhe. */
export function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium leading-[18px] text-admin-text-description">{label}</dt>
      <dd className="break-words text-sm font-medium leading-5 text-admin-drawer-value">{value || "—"}</dd>
    </div>
  );
}
