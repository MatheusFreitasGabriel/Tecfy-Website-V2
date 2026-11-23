"use client";

import { useId } from "react";
import { FaArrowsRotate, FaChevronDown, FaMagnifyingGlass } from "react-icons/fa6";
import type { Option } from "@/lib/admin/crm/options";
import Tooltip from "../form/Tooltip";

const controlClass =
  "h-11 w-full min-w-0 rounded-lg bg-background-kpi text-[13px] font-medium leading-5 text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border transition-[outline-color] focus:outline-2 focus:outline-admin-primary [color-scheme:dark]";

/** Campo de busca das listas (contatos, empresas). */
export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <FaMagnifyingGlass aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-text-description" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className={`${controlClass} pl-[42px] pr-4 text-sm outline-admin-card-border placeholder:text-admin-text-description`}
      />
    </div>
  );
}

/** Select de filtro com rótulo (primeira opção = "todos"). */
export function FilterSelect({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly Option[];
  /** Sem `allLabel`, não há opção vazia (ex.: ordenação). */
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium leading-[18px] text-admin-text-description">
        {label}
      </label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${controlClass} cursor-pointer appearance-none pl-3.5 pr-10`}>
          {allLabel !== undefined && <option value="">{allLabel}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <FaChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-description" />
      </div>
    </div>
  );
}

/** Botão de atualizar a lista (busca de novo no servidor sem recarregar a página). */
export function ReloadButton({ onClick, reloading }: { onClick: () => void; reloading: boolean }) {
  return (
    <Tooltip label={reloading ? "Atualizando..." : "Atualizar lista"} description="Busca de novo sem recarregar a página.">
      <button
        type="button"
        onClick={onClick}
        disabled={reloading}
        aria-label={reloading ? "Atualizando a lista" : "Atualizar lista"}
        aria-busy={reloading}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-background-kpi text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border transition-colors hover:bg-admin-card focus-visible:outline-2 focus-visible:outline-admin-primary disabled:cursor-wait"
      >
        <FaArrowsRotate aria-hidden className={`h-3.5 w-3.5 ${reloading ? "animate-spin motion-reduce:animate-none" : ""}`} />
      </button>
    </Tooltip>
  );
}

/** Normaliza texto para busca (sem acento, minúsculo). */
export const normalizeSearch = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** O texto contém todos os termos da busca? */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeSearch(fields.filter(Boolean).join(" "));
  return terms.every((t) => haystack.includes(t));
}
