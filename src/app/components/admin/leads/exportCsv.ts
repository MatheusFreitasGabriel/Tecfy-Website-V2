import { leadQualifications, leadSources, leadStages, leadStatuses } from "@/lib/admin/crm/options";
import type { LeadRow } from "@/lib/admin/crm/types";
import { formatCalendarDate, formatDate, formatPhone } from "./leadVisuals";

/**
 * Exporta leads para CSV no navegador. Separador ";" + BOM UTF-8 (abre direto no Excel pt-BR).
 * Células que começam com = + - @ (ou tab/CR) ganham um apóstrofo para não virarem fórmula.
 */
function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const money = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function exportLeadsCsv(leads: LeadRow[], fileName: string): void {
  const header = [
    "Lead",
    "E-mail",
    "Telefone",
    "Contato",
    "E-mail do contato",
    "Telefone do contato",
    "Empresa",
    "Qualificação",
    "Etapa",
    "Status",
    "Origem",
    "Entrada",
    "Responsável",
    "Valor estimado (R$)",
    "Previsão de fechamento",
    "Plano de interesse",
    "Tags",
    "Convertido",
    "Criado em",
    "Observações",
  ];
  const rows = leads.map((l) => [
    l.title,
    l.email,
    l.phone ? formatPhone(l.phone) : "",
    l.contact?.name,
    l.contact?.email,
    l.contact?.phone ? formatPhone(l.contact.phone) : "",
    l.company?.name,
    leadQualifications.label(l.qualification),
    leadStages.label(l.stage),
    leadStatuses.label(l.status),
    l.source ? leadSources.label(l.source) : "",
    l.entry === "website" ? "Website" : "Manual",
    l.owner_name,
    money(l.estimated_value_cents),
    l.expected_close_date ? formatCalendarDate(l.expected_close_date) : "",
    l.interest_plan,
    l.tags.join(", "),
    l.deal_id ? "Sim" : "Não",
    l.created_at ? formatDate(l.created_at) : "",
    l.notes,
  ]);

  const csv = "﻿" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
