import { dealOrigins, dealStatuses, leadSources } from "@/lib/admin/crm/options";
import type { DealRow, Pipeline } from "@/lib/admin/crm/types";
import { formatCalendarDate, formatDateTime } from "../leads/leadVisuals";

/** Célula CSV segura: ";" + aspas, e sem virar fórmula no Excel (= + - @ ganham apóstrofo). */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Baixa um CSV (BOM UTF-8, separador ";" — abre direto no Excel pt-BR). */
export function downloadCsv(header: string[], rows: (string | number | null | undefined)[][], fileName: string): void {
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function exportDealsCsv(deals: DealRow[], pipeline: Pipeline, fileName: string): void {
  const stage = (id: string | null) => pipeline.stages.find((s) => s.id === id)?.name ?? "";
  downloadCsv(
    ["Negociação", "Funil", "Etapa", "Status", "Qualificação (estrelas)", "Valor (R$)", "Previsão de fechamento", "Responsável", "Contato", "E-mail do contato", "Empresa", "Origem", "Fonte", "Tarefas abertas", "Criada por", "Criada em", "Alterada em", "Contexto"],
    deals.map((d) => [
      d.title,
      pipeline.name,
      stage(d.stage_id),
      dealStatuses.label(d.status),
      d.qualification,
      money(d.value_cents),
      d.expected_close_date ? formatCalendarDate(d.expected_close_date) : "",
      d.owner_name,
      d.contact?.name,
      d.contact?.email,
      d.company?.name,
      dealOrigins.label(d.origin),
      d.source ? leadSources.label(d.source) : "",
      d.task_due.length,
      d.created_by_name,
      formatDateTime(d.created_at),
      formatDateTime(d.updated_at),
      d.context,
    ]),
    fileName,
  );
}
