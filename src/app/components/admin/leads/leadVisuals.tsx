"use client";

import type { IconType } from "react-icons";
import { FaBoxArchive, FaChevronDown, FaCircleXmark, FaHandshake, FaPause, FaPersonWalking, FaStar } from "react-icons/fa6";
import { leadQualifications, leadStages, leadStatuses, type LeadQualification, type LeadStage, type LeadStatus } from "@/lib/admin/crm/options";
import Tooltip from "../form/Tooltip";
import { maskPhoneNumber } from "@/utils/masks";

/** Cores do badge de qualificação (fundo + texto), conforme o design. */
export const qualificationColors: Record<LeadQualification, string> = {
  venda_certa: "bg-admin-qual-sure text-admin-qual-sure-text",
  quente: "bg-admin-qual-hot text-admin-qual-hot-text",
  morno: "bg-admin-qual-warm text-admin-qual-warm-text",
  frio: "bg-admin-qual-cold text-admin-qual-cold-text",
  a_qualificar: "bg-admin-badge text-admin-badge-text",
};

/** Só a cor do texto (cartão de qualificação no painel de detalhes). */
export const qualificationTextColors: Record<LeadQualification, string> = {
  venda_certa: "text-admin-qual-sure-text",
  quente: "text-admin-qual-hot-text",
  morno: "text-admin-qual-warm-text",
  frio: "text-admin-qual-cold-text",
  a_qualificar: "text-admin-drawer-value",
};

export const statusIcons: Record<LeadStatus, IconType> = {
  novo: FaStar,
  em_andamento: FaPersonWalking,
  pausado: FaPause,
  convertido: FaHandshake,
  perdido: FaCircleXmark,
  arquivado: FaBoxArchive,
};

/** Status como ícone, com tooltip "Status: Em andamento" + explicação ao passar o mouse/focar. */
export function LeadStatusIcon({ status, className = "h-4 w-4" }: { status: LeadStatus; className?: string }) {
  const Icon = statusIcons[status];
  const label = leadStatuses.label(status);
  return (
    <Tooltip label={`Status: ${label}`} description={leadStatuses.hint(status)}>
      <span tabIndex={0} className="inline-flex rounded p-1 text-admin-text-hint outline-none focus-visible:ring-2 focus-visible:ring-admin-accent">
        <Icon aria-hidden className={className} />
        <span className="sr-only">Status: {label}</span>
      </span>
    </Tooltip>
  );
}

/** Nome da etapa com tooltip explicando o que ela significa. */
export function StageLabel({ stage }: { stage: LeadStage }) {
  return (
    <Tooltip label={`Etapa: ${leadStages.label(stage)}`} description={leadStages.hint(stage)}>
      <span tabIndex={0} className="cursor-default rounded outline-none focus-visible:ring-2 focus-visible:ring-admin-accent">
        {leadStages.label(stage)}
      </span>
    </Tooltip>
  );
}

interface QualificationSelectProps {
  value: LeadQualification;
  onChange: (value: LeadQualification) => void;
  disabled?: boolean;
  /** Nome do lead, para o rótulo acessível. */
  leadTitle: string;
}

/** Select da qualificação com o visual de badge colorido (troca direto na lista) + tooltip. */
export function QualificationSelect({ value, onChange, disabled, leadTitle }: QualificationSelectProps) {
  return (
    <Tooltip label={`Qualificação: ${leadQualifications.label(value)}`} description={leadQualifications.hint(value)}>
      <div className="relative inline-flex">
        <select
          value={value}
          disabled={disabled}
          aria-label={`Qualificação de ${leadTitle}`}
          onChange={(e) => leadQualifications.is(e.target.value) && onChange(e.target.value)}
          className={`h-7 cursor-pointer appearance-none rounded-[7px] pl-3 pr-7 text-xs font-medium leading-[18px] outline-none transition-opacity [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-admin-accent disabled:cursor-wait disabled:opacity-60 ${qualificationColors[value]}`}
        >
          {leadQualifications.options.map((o) => (
            <option key={o.value} value={o.value} className="bg-admin-card text-text-primary">
              {o.label}
            </option>
          ))}
        </select>
        <FaChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-2 w-2 -translate-y-1/2 opacity-70" />
      </div>
    </Tooltip>
  );
}

// ── Formatação ──

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatDate = (iso: string | null): string => (iso ? dateFormatter.format(new Date(iso)) : "—");

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** "19/11/2026 às 14:32" (horário de Brasília). */
export const formatDateTime = (iso: string | null): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  return `${dateFormatter.format(date)} às ${timeFormatter.format(date)}`;
};

/** "2026-11-30" → "30/11/2026" (data de calendário, sem fuso). */
export const formatCalendarDate = (value: string | null): string =>
  value ? value.split("-").reverse().join("/") : "—";

export const formatCents = (cents: number | null): string => (cents === null ? "—" : brl.format(cents / 100));

export const formatPhone = (digits: string | null): string => (digits ? maskPhoneNumber(digits) : "—");
