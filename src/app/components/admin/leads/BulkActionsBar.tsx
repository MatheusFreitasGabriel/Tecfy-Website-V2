"use client";

import { FaChevronDown, FaFileExport, FaHandshake, FaTrash, FaUserCheck, FaXmark } from "react-icons/fa6";
import { leadQualifications, leadStages, leadStatuses, type Option } from "@/lib/admin/crm/options";
import Button from "../form/Button";

export type BulkField = "qualification" | "stage" | "status";

interface BulkActionsBarProps {
  count: number;
  busy: boolean;
  onConvert: () => void;
  onDelete: () => void;
  onSet: (field: BulkField, value: string) => void;
  onExport: () => void;
  onAssign: () => void;
  onClear: () => void;
}

/** Select que dispara a ação ao escolher e volta para o rótulo ("Alterar etapa ▾"). */
function ActionSelect({ label, options, disabled, onPick }: { label: string; options: readonly Option[]; disabled: boolean; onPick: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value=""
        disabled={disabled}
        aria-label={label}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="h-11 cursor-pointer appearance-none rounded-[10px] bg-admin-card pl-4 pr-9 text-sm font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-button-border [color-scheme:dark] hover:bg-admin-badge focus:outline-2 focus:outline-admin-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="" disabled>
          {label}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FaChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-admin-text-hint" />
    </div>
  );
}

/** Aparece quando há leads selecionados: ações em massa. */
export default function BulkActionsBar({ count, busy, onConvert, onDelete, onSet, onExport, onAssign, onClear }: BulkActionsBarProps) {
  return (
    <div
      role="region"
      aria-label="Ações para os leads selecionados"
      className="flex flex-col gap-3 rounded-xl bg-admin-tip px-5 py-3 xl:flex-row xl:items-center xl:justify-between"
    >
      <p className="text-sm font-semibold text-admin-tip-title" aria-live="polite">
        {count === 1 ? "1 lead selecionado" : `${count} leads selecionados`}
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button icon={FaHandshake} onClick={onConvert} disabled={busy}>
          Converter para negociação
        </Button>
        <Button variant="secondary" icon={FaUserCheck} onClick={onAssign} disabled={busy}>
          Atribuir responsável
        </Button>
        <ActionSelect label="Alterar qualificação" options={leadQualifications.options} disabled={busy} onPick={(v) => onSet("qualification", v)} />
        <ActionSelect label="Alterar etapa" options={leadStages.options} disabled={busy} onPick={(v) => onSet("stage", v)} />
        <ActionSelect label="Alterar status" options={leadStatuses.options} disabled={busy} onPick={(v) => onSet("status", v)} />
        <Button variant="secondary" icon={FaFileExport} onClick={onExport} disabled={busy}>
          Exportar
        </Button>
        <Button variant="danger" icon={FaTrash} onClick={onDelete} disabled={busy}>
          Excluir
        </Button>
        <Button variant="ghost" icon={FaXmark} onClick={onClear} disabled={busy}>
          Limpar seleção
        </Button>
      </div>
    </div>
  );
}
