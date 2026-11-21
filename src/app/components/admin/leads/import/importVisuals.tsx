import type { IconType } from "react-icons";
import { FaBan, FaCircleCheck, FaCircleExclamation, FaClone, FaCopy, FaLink } from "react-icons/fa6";
import { STATUS_INFO, type RowStatus } from "@/lib/admin/crm/leadImport/review";

export const STATUS_ORDER: RowStatus[] = ["novo", "existente", "duplicado", "repetido", "sem_contato", "erro"];

export const STATUS_STYLE: Record<RowStatus, { icon: IconType; className: string }> = {
  novo: { icon: FaCircleCheck, className: "bg-admin-qual-sure text-admin-qual-sure-text" },
  existente: { icon: FaLink, className: "bg-admin-qual-cold text-admin-qual-cold-text" },
  duplicado: { icon: FaClone, className: "bg-admin-qual-hot text-admin-qual-hot-text" },
  repetido: { icon: FaCopy, className: "bg-admin-qual-warm text-admin-qual-warm-text" },
  sem_contato: { icon: FaBan, className: "bg-admin-deal-paused text-admin-deal-paused-text" },
  erro: { icon: FaCircleExclamation, className: "bg-admin-deal-lost text-admin-deal-lost-text" },
};

export function StatusBadge({ status, pending }: { status: RowStatus; pending?: boolean }) {
  const { icon: Icon, className } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold leading-4 ${className} ${pending ? "opacity-60" : ""}`}>
      <Icon aria-hidden className="h-3 w-3 shrink-0" />
      {pending ? "Analisando..." : STATUS_INFO[status].label}
    </span>
  );
}

/** Célula de CSV (";" + aspas) protegida contra fórmula. */
function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Baixa um CSV (BOM UTF-8 → abre certo no Excel pt-BR). `csv` pronto ou matriz de células. */
export function downloadCsv(fileName: string, content: string | (string | number | null | undefined)[][]): void {
  const text = typeof content === "string" ? content : content.map((row) => row.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const integer = new Intl.NumberFormat("pt-BR");
export const plural = (n: number, one: string, many: string) => `${integer.format(n)} ${n === 1 ? one : many}`;
