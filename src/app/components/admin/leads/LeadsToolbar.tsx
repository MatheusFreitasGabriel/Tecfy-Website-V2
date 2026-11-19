"use client";

import { useId } from "react";
import { FaArrowsRotate, FaChevronDown, FaFileExport, FaMagnifyingGlass, FaMessage, FaSliders, FaXmark } from "react-icons/fa6";
import Tooltip from "../form/Tooltip";
import { leadQualifications, leadStages, leadStatuses, type Option } from "@/lib/admin/crm/options";
import { DEFAULT_FILTERS, viewOptions, type FilterChip, type LeadFilters } from "./leadFilters";

interface LeadsToolbarProps {
  filters: LeadFilters;
  chips: FilterChip[];
  activeCount: number;
  resultCount: number;
  onChange: (next: LeadFilters) => void;
  onOpenFilters: () => void;
  onExport: () => void;
  onOpenTemplates: () => void;
  /** Busca os leads de novo no servidor (sem recarregar a página nem perder os filtros). */
  onReload: () => void;
  reloading: boolean;
}

const controlClass =
  "h-11 w-full min-w-0 rounded-[10px] bg-background-kpi text-[13px] font-medium leading-5 text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border transition-[outline-color] focus:outline-2 focus:outline-admin-primary [color-scheme:dark]";

const MULTI = "__multi__";

/** Select rápido ligado a um filtro de lista: 0 = todos, 1 = o escolhido, 2+ = "N selecionadas". */
function QuickSelect({
  label,
  values,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  values: string[];
  options: readonly Option[];
  allLabel: string;
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const value = values.length === 0 ? "" : values.length === 1 ? values[0] : MULTI;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium leading-[18px] text-admin-text-description">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
          className={`${controlClass} cursor-pointer appearance-none pl-3.5 pr-10`}
        >
          <option value="">{allLabel}</option>
          {values.length > 1 && (
            <option value={MULTI} disabled>
              {values.length} selecionadas
            </option>
          )}
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

const outlineButton =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-background-kpi px-4 text-sm font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border transition-colors hover:bg-admin-card focus-visible:outline-2 focus-visible:outline-admin-primary";

/** Busca, botões (filtros, exportar, modelos), filtros rápidos e chips dos filtros ativos. */
export default function LeadsToolbar({
  filters,
  chips,
  activeCount,
  resultCount,
  onChange,
  onOpenFilters,
  onExport,
  onOpenTemplates,
  onReload,
  reloading,
}: LeadsToolbarProps) {
  const set = (patch: Partial<LeadFilters>) => onChange({ ...filters, ...patch });
  const viewId = useId();

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative min-w-0 flex-1">
          <FaMagnifyingGlass aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-text-description" />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Buscar por nome do lead, contato, empresa ou responsável"
            aria-label="Buscar leads"
            autoComplete="off"
            className={`${controlClass} pl-[42px] pr-4 text-sm outline-admin-card-border placeholder:text-admin-text-description`}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onOpenFilters} className={`${outlineButton} min-w-[160px]`}>
            <FaSliders aria-hidden className="h-3.5 w-3.5" />
            Filtros
            {activeCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1.5 text-[11px] font-semibold">{activeCount}</span>
            )}
          </button>
          <button type="button" onClick={onExport} disabled={resultCount === 0} className={`${outlineButton} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FaFileExport aria-hidden className="h-3.5 w-3.5" />
            Exportar
          </button>
          <button type="button" onClick={onOpenTemplates} className={outlineButton}>
            <FaMessage aria-hidden className="h-3.5 w-3.5" />
            Modelos
          </button>
          <Tooltip label={reloading ? "Atualizando..." : "Atualizar lista"} description="Busca os leads de novo sem recarregar a página.">
            <button
              type="button"
              onClick={onReload}
              disabled={reloading}
              aria-label={reloading ? "Atualizando a lista" : "Atualizar lista"}
              aria-busy={reloading}
              className={`${outlineButton} w-11 px-0 disabled:cursor-wait`}
            >
              <FaArrowsRotate aria-hidden className={`h-3.5 w-3.5 ${reloading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={viewId} className="text-xs font-medium leading-[18px] text-admin-text-description">
            Visualização
          </label>
          <div className="relative">
            <select
              id={viewId}
              value={filters.view}
              onChange={(e) => set({ view: e.target.value as LeadFilters["view"] })}
              className={`${controlClass} cursor-pointer appearance-none pl-3.5 pr-10`}
            >
              {viewOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FaChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-description" />
          </div>
        </div>
        <QuickSelect label="Etapa" values={filters.stages} options={leadStages.options} allLabel="Todas as etapas" onChange={(stages) => set({ stages })} />
        <QuickSelect
          label="Qualificação"
          values={filters.qualifications}
          options={leadQualifications.options}
          allLabel="Todas as qualificações"
          onChange={(qualifications) => set({ qualifications })}
        />
        <QuickSelect label="Status" values={filters.statuses} options={leadStatuses.options} allLabel="Todos os status" onChange={(statuses) => set({ statuses })} />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.clear(filters))}
              aria-label={`Remover filtro ${chip.label}`}
              className="inline-flex h-8 items-center gap-2 rounded-full bg-admin-tip pl-3 pr-2 text-xs font-medium text-admin-tip-title transition-colors hover:bg-admin-qual-warm"
            >
              {chip.label}
              <FaXmark aria-hidden className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS, query: filters.query, sort: filters.sort })}
            className="h-8 rounded-full px-3 text-xs font-semibold text-admin-accent hover:bg-admin-card"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}
