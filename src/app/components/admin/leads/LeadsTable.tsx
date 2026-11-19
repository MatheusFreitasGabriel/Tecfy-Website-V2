"use client";

import { useEffect, useRef } from "react";
import { FaArrowDown, FaArrowUp, FaCircleInfo, FaWhatsapp } from "react-icons/fa6";
import type { LeadQualification } from "@/lib/admin/crm/options";
import type { LeadRow } from "@/lib/admin/crm/types";
import Tooltip from "../form/Tooltip";
import { LeadStatusIcon, QualificationSelect, StageLabel, formatDate } from "./leadVisuals";

interface LeadsTableProps {
  rows: LeadRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Marca/desmarca todas as linhas da página. */
  onTogglePage: (select: boolean) => void;
  /** Ordenação por data: "desc" (recentes primeiro), "asc" ou null (ordenado por nome). */
  dateSort: "desc" | "asc" | null;
  onToggleDateSort: () => void;
  onQualificationChange: (id: string, value: LeadQualification) => void;
  /** Leads com gravação em andamento (select desabilitado). */
  pending: Set<string>;
  onOpenDetails: (id: string) => void;
  /** Abre o compositor de WhatsApp do lead (só aparece se houver telefone). */
  onWhatsApp: (id: string) => void;
}

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded accent-admin-primary [color-scheme:dark]"
    />
  );
}

const th = "px-3 py-[13px] text-left text-xs font-medium leading-[18px] text-admin-table-head-text first:pl-6 last:pr-6";
const td = "px-3 first:pl-6 last:pr-6";

/** Lista de leads (página atual). Busca, filtros e paginação ficam no `LeadsView`. */
export default function LeadsTable({
  rows,
  selected,
  onToggle,
  onTogglePage,
  dateSort,
  onToggleDateSort,
  onQualificationChange,
  pending,
  onOpenDetails,
  onWhatsApp,
}: LeadsTableProps) {
  const selectedOnPage = rows.filter((r) => selected.has(r.id)).length;
  const allOnPage = rows.length > 0 && selectedOnPage === rows.length;
  const DateIcon = dateSort === "asc" ? FaArrowUp : FaArrowDown;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse">
        <thead className="bg-admin-table-head">
          <tr>
            <th scope="col" className={`${th} w-12`}>
              <Checkbox
                checked={allOnPage}
                indeterminate={selectedOnPage > 0 && !allOnPage}
                onChange={onTogglePage}
                label="Selecionar todos os leads desta página"
              />
            </th>
            <th scope="col" className={th}>Lead / responsável</th>
            <th scope="col" className={`${th} w-[152px]`}>Qualificação</th>
            <th scope="col" className={th}>Etapa</th>
            <th scope="col" className={`${th} w-[138px]`} aria-sort={dateSort === "asc" ? "ascending" : dateSort === "desc" ? "descending" : "none"}>
              <button type="button" onClick={onToggleDateSort} className="inline-flex items-center gap-1.5 hover:text-text-primary">
                Criado em
                <DateIcon aria-hidden className={`h-2.5 w-2.5 ${dateSort ? "" : "opacity-40"}`} />
              </button>
            </th>
            <th scope="col" className={`${th} w-[96px] text-center`}>Status</th>
            <th scope="col" className={`${th} w-[112px] text-center`}>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lead, index) => {
            const isSelected = selected.has(lead.id);
            return (
              <tr
                key={lead.id}
                className={`h-[60px] border-b border-admin-table-divider last:border-0 ${
                  isSelected ? "bg-admin-tip/50" : index % 2 ? "bg-admin-table-alt" : "bg-admin-table"
                }`}
              >
                <td className={td}>
                  <Checkbox checked={isSelected} onChange={() => onToggle(lead.id)} label={`Selecionar ${lead.title}`} />
                </td>
                <td className={`${td} max-w-[280px]`}>
                  <p className="truncate text-sm font-semibold leading-5 text-text-primary">{lead.title}</p>
                  <p className="mt-[3px] truncate text-xs font-medium leading-[18px] text-admin-table-subtext">
                    {lead.owner_name ?? (lead.entry === "website" ? "Website · sem responsável" : "Sem responsável")}
                  </p>
                </td>
                <td className={td}>
                  <QualificationSelect
                    value={lead.qualification}
                    leadTitle={lead.title}
                    disabled={pending.has(lead.id)}
                    onChange={(value) => onQualificationChange(lead.id, value)}
                  />
                </td>
                <td className={`${td} whitespace-nowrap text-[13px] font-medium leading-5 text-text-primary`}><StageLabel stage={lead.stage} /></td>
                <td className={`${td} whitespace-nowrap text-[13px] font-medium leading-5 text-admin-table-date`}>{formatDate(lead.created_at)}</td>
                <td className={`${td} text-center`}>
                  <LeadStatusIcon status={lead.status} />
                </td>
                <td className={`${td} text-center`}>
                  <div className="inline-flex items-center gap-1">
                    {(lead.phone || lead.contact?.phone) && (
                      <Tooltip label="Chamar no WhatsApp">
                        <button
                          type="button"
                          onClick={() => onWhatsApp(lead.id)}
                          aria-label={`Chamar ${lead.title} no WhatsApp`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-admin-whatsapp transition-colors hover:bg-admin-card focus-visible:outline-2 focus-visible:outline-admin-accent"
                        >
                          <FaWhatsapp aria-hidden className="h-5 w-5" />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip label="Ver detalhes">
                      <button
                        type="button"
                        onClick={() => onOpenDetails(lead.id)}
                        aria-label={`Ver detalhes de ${lead.title}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-admin-text-hint transition-colors hover:bg-admin-card hover:text-text-primary focus-visible:outline-2 focus-visible:outline-admin-accent"
                      >
                        <FaCircleInfo aria-hidden className="h-5 w-5" />
                      </button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
