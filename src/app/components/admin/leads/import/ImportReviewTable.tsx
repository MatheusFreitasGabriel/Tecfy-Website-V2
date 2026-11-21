"use client";

import { useEffect, useRef } from "react";
import { FaChevronDown, FaEnvelope, FaGlobe, FaPen, FaPhone, FaTriangleExclamation } from "react-icons/fa6";
import { phoneKey } from "@/lib/admin/crm/leadImport/columns";
import { ACTION_LABELS, STATUS_INFO, allowedActions, type ReviewedRow, type RowAction } from "@/lib/admin/crm/leadImport/review";
import { maskPhoneNumber } from "@/utils/masks";
import Tooltip from "../../form/Tooltip";
import { StatusBadge } from "./importVisuals";

interface ImportReviewTableProps {
  rows: ReviewedRow[];
  ownerNames: Map<string, string>;
  selected: Set<number>;
  pending: Set<number>;
  onToggle: (line: number) => void;
  onToggleAll: (select: boolean) => void;
  onAction: (line: number, action: RowAction) => void;
  onOpen: (line: number) => void;
}

const th = "px-3 py-[13px] text-left text-xs font-medium leading-[18px] text-admin-table-head-text first:pl-5 last:pr-5";
const td = "px-3 py-3 align-middle first:pl-5 last:pr-5";

function Checkbox({ checked, indeterminate = false, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label: string }) {
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

/** Razão curta mostrada embaixo da situação. */
function reasonOf(row: ReviewedRow): string | null {
  const m = row.match;
  switch (row.status) {
    case "erro":
      return `${Object.keys(row.errors).length} campo(s) para corrigir`;
    case "duplicado":
      return m?.openLeads[0] ? `Lead "${m.openLeads[0].title}" · ${m.openLeads[0].reason}` : null;
    case "repetido":
      return row.repeatOf ? `Igual à linha ${row.repeatOf}` : null;
    case "existente":
      return [m?.company && `Empresa já existe (por ${m.company.by})`, m?.contact && `Contato já existe (por ${m.contact.by})`].filter(Boolean).join(" · ");
    case "sem_contato":
      return "Sem e-mail, telefone e site";
    default:
      return null;
  }
}

/** Tabela da revisão: uma linha por linha da planilha. */
export default function ImportReviewTable({ rows, ownerNames, selected, pending, onToggle, onToggleAll, onAction, onOpen }: ImportReviewTableProps) {
  const selectedCount = rows.filter((r) => selected.has(r.line)).length;
  const all = rows.length > 0 && selectedCount === rows.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse">
        <thead className="bg-admin-table-head">
          <tr>
            <th scope="col" className={`${th} w-10`}>
              <Checkbox checked={all} indeterminate={selectedCount > 0 && !all} onChange={onToggleAll} label="Selecionar todas as linhas visíveis" />
            </th>
            <th scope="col" className={`${th} w-12`}>Linha</th>
            <th scope="col" className={th}>Lead / responsável</th>
            <th scope="col" className={th}>Contato</th>
            <th scope="col" className={th}>Empresa</th>
            <th scope="col" className={`${th} w-[92px]`}>Canais</th>
            <th scope="col" className={`${th} w-[230px]`}>Situação</th>
            <th scope="col" className={`${th} w-[190px]`}>Ação</th>
            <th scope="col" className={`${th} w-[64px] text-center`}>
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const v = row.values;
            const isSelected = selected.has(row.line);
            const isPending = pending.has(row.line);
            const reason = reasonOf(row);
            const options = allowedActions(row.status);
            const phone = [v.lead_phone, v.contact_phone, v.company_phone].map(phoneKey).find(Boolean);
            const email = [v.lead_email, v.contact_email, v.company_email].find((e) => e.trim());
            const owner = row.ownerUid ? ownerNames.get(row.ownerUid) : null;
            return (
              <tr
                key={row.line}
                className={`border-b border-admin-table-divider last:border-0 ${
                  isSelected ? "bg-admin-tip/50" : row.status === "erro" ? "bg-admin-deal-lost/25" : index % 2 ? "bg-admin-table-alt" : "bg-admin-table"
                } ${row.action === "skip" && row.status !== "erro" ? "[&>td:not(:nth-last-child(-n+3))]:opacity-55" : ""}`}
              >
                <td className={td}>
                  <Checkbox checked={isSelected} onChange={() => onToggle(row.line)} label={`Selecionar linha ${row.line}`} />
                </td>
                <td className={`${td} text-xs font-medium text-admin-table-date`}>{row.line}</td>
                <td className={`${td} max-w-[260px]`}>
                  <button type="button" onClick={() => onOpen(row.line)} className="block max-w-full text-left hover:underline">
                    <span className={`block truncate text-sm font-semibold leading-5 ${v.title ? "text-text-primary" : "italic text-admin-danger"}`}>{v.title || "Sem nome do lead"}</span>
                  </button>
                  <p className={`mt-[3px] truncate text-xs font-medium leading-[18px] ${row.errors.owner ? "text-admin-danger" : "text-admin-table-subtext"}`}>
                    {row.errors.owner ? row.errors.owner : (owner ?? "—")}
                  </p>
                </td>
                <td className={`${td} max-w-[200px]`}>
                  <p className="truncate text-sm font-medium leading-5 text-text-primary">{v.contact_name || "—"}</p>
                  {v.role && <p className="mt-[3px] truncate text-xs font-medium leading-[18px] text-admin-table-subtext">{v.role}</p>}
                </td>
                <td className={`${td} max-w-[220px]`}>
                  <p className="truncate text-sm font-medium leading-5 text-text-primary">{v.trade_name || "—"}</p>
                  {(v.city || v.region) && (
                    <p className="mt-[3px] truncate text-xs font-medium leading-[18px] text-admin-table-subtext">{[v.city, v.region].filter(Boolean).join(" · ")}</p>
                  )}
                </td>
                <td className={td}>
                  <div className="flex items-center gap-2 text-admin-text-hint">
                    <Tooltip label={phone ? maskPhoneNumber(phone) : "Sem telefone"}>
                      <span tabIndex={0} className={phone ? "text-admin-whatsapp" : "opacity-30"}>
                        <FaPhone aria-hidden className="h-3.5 w-3.5" />
                      </span>
                    </Tooltip>
                    <Tooltip label={email || "Sem e-mail"}>
                      <span tabIndex={0} className={email ? "text-admin-accent" : "opacity-30"}>
                        <FaEnvelope aria-hidden className="h-3.5 w-3.5" />
                      </span>
                    </Tooltip>
                    <Tooltip label={v.website || "Sem site"}>
                      <span tabIndex={0} className={v.website ? "text-admin-stage-blue" : "opacity-30"}>
                        <FaGlobe aria-hidden className="h-3.5 w-3.5" />
                      </span>
                    </Tooltip>
                  </div>
                </td>
                <td className={td}>
                  <div className="flex flex-col items-start gap-1">
                    <Tooltip label={STATUS_INFO[row.status].label} description={STATUS_INFO[row.status].hint}>
                      <span tabIndex={0}>
                        <StatusBadge status={row.status} pending={isPending} />
                      </span>
                    </Tooltip>
                    {reason && <p className="line-clamp-2 max-w-[210px] text-xs font-medium leading-4 text-admin-table-subtext">{reason}</p>}
                    {row.warnings.length > 0 && (
                      <p className="flex items-center gap-1 text-xs font-medium leading-4 text-admin-warning">
                        <FaTriangleExclamation aria-hidden className="h-3 w-3 shrink-0" /> {row.warnings.length} aviso(s)
                      </p>
                    )}
                  </div>
                </td>
                <td className={td}>
                  {options.length === 1 ? (
                    <span className="text-[13px] font-medium text-admin-text-hint">{row.status === "erro" ? "Corrija para importar" : ACTION_LABELS.skip}</span>
                  ) : (
                    <div className="relative">
                      <select
                        value={row.action}
                        onChange={(e) => onAction(row.line, e.target.value as RowAction)}
                        aria-label={`Ação da linha ${row.line}`}
                        className={`h-10 w-full cursor-pointer appearance-none rounded-lg bg-admin-control pl-3 pr-9 text-[13px] font-semibold outline outline-1 -outline-offset-1 outline-admin-control-border [color-scheme:dark] focus:outline-2 focus:outline-admin-primary ${
                          row.action === "skip" ? "text-admin-text-hint" : row.action === "update" ? "text-admin-accent" : "text-admin-success"
                        }`}
                      >
                        {options.map((a) => (
                          <option key={a} value={a}>
                            {a === "create" && row.status === "duplicado" ? "Criar mesmo assim" : ACTION_LABELS[a]}
                          </option>
                        ))}
                      </select>
                      <FaChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-admin-text-hint" />
                    </div>
                  )}
                </td>
                <td className={`${td} text-center`}>
                  <Tooltip label={row.status === "erro" ? "Corrigir" : "Ver e editar"}>
                    <button
                      type="button"
                      onClick={() => onOpen(row.line)}
                      aria-label={`Ver e editar a linha ${row.line}`}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-admin-card focus-visible:outline-2 focus-visible:outline-admin-accent ${
                        row.status === "erro" ? "text-admin-danger" : "text-admin-accent"
                      }`}
                    >
                      <FaPen aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
