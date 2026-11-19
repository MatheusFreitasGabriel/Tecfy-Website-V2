"use client";

import { useId } from "react";
import { FaChevronDown } from "react-icons/fa6";

export const PAGE_SIZES = [10, 25, 50] as const;

interface LeadsPaginationProps {
  page: number;
  pageCount: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
  onPerPage: (perPage: number) => void;
}

/** Números das páginas com reticências: 1 … 4 5 6 … 12. */
function pageList(page: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

const integer = new Intl.NumberFormat("pt-BR");
const navClass =
  "h-[34px] w-[116px] rounded-md bg-admin-control text-[13px] font-medium leading-[19px] text-text-primary outline outline-1 -outline-offset-1 outline-admin-control-disabled-border transition-colors hover:bg-admin-card disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-admin-control";

/** Rodapé da lista: "Exibindo X–Y de N", itens por página e navegação. */
export default function LeadsPagination({ page, pageCount, perPage, total, onPage, onPerPage }: LeadsPaginationProps) {
  const id = useId();
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <nav
      aria-label="Paginação dos leads"
      className="flex flex-col gap-4 border-t border-admin-table-border bg-admin-table-alt px-6 py-4 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
        <p className="text-[13px] font-medium leading-[19px] text-admin-text-hint" aria-live="polite">
          Exibindo {integer.format(from)}–{integer.format(to)} de {integer.format(total)} {total === 1 ? "lead" : "leads"}
        </p>
        <div className="flex items-center gap-3">
          <label htmlFor={id} className="text-[13px] font-medium leading-[19px] text-admin-text-hint">
            Por página
          </label>
          <div className="relative">
            <select
              id={id}
              value={perPage}
              onChange={(e) => onPerPage(Number(e.target.value))}
              className="h-[38px] w-[70px] cursor-pointer appearance-none rounded-md bg-admin-control pl-3 text-[13px] font-medium text-text-primary outline outline-1 -outline-offset-1 outline-admin-control-border [color-scheme:dark] focus:outline-2 focus:outline-admin-primary"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <FaChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-admin-text-hint" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:gap-6">
        <button type="button" className={navClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        <ul className="flex items-center gap-2">
          {pageList(page, pageCount).map((p, i) =>
            p === "…" ? (
              <li key={`gap-${i}`} aria-hidden className="px-1 text-[13px] text-admin-text-hint">
                …
              </li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onPage(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Página ${p}`}
                  className={`h-[38px] min-w-10 rounded-md px-3 text-[13px] leading-[19px] transition-colors ${
                    p === page
                      ? "bg-admin-primary font-semibold text-text-primary"
                      : "bg-admin-control font-medium text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-control-border hover:bg-admin-card"
                  }`}
                >
                  {p}
                </button>
              </li>
            ),
          )}
        </ul>
        <button type="button" className={navClass} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Próxima
        </button>
      </div>
    </nav>
  );
}
