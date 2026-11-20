"use client";

import { useMemo, useState } from "react";
import { FaArrowUpRightFromSquare, FaClock, FaPlus, FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import type { AdminUserOption, DealRow, Pipeline } from "@/lib/admin/crm/types";
import { dealQualifications } from "@/lib/admin/crm/options";
import LeadsPagination, { PAGE_SIZES } from "../leads/LeadsPagination";
import { formatCalendarDate, formatDateTime } from "../leads/leadVisuals";
import { DealStatusBadge, Stars, dealAlerts, formatMoney } from "./dealVisuals";

export type DealBulkAction = "set_stage" | "set_status" | "set_owner" | "set_qualification" | "set_pipeline";

interface DealsListProps {
  deals: DealRow[];
  pipeline: Pipeline;
  /** Outros funis ativos (para mover em massa). */
  otherPipelines: Pipeline[];
  admins: AdminUserOption[];
  now: number | null;
  busy: boolean;
  onOpen: (deal: DealRow) => void;
  onAddTask: (deal: DealRow) => void;
  onBulk: (action: DealBulkAction, value: string, ids: string[]) => Promise<boolean>;
  onQualify: (deal: DealRow, stars: number) => void;
  onExport: (deals: DealRow[]) => void;
}

const SORTS = [
  { value: "updated", label: "Alteradas recentemente" },
  { value: "recent", label: "Mais recentes" },
  { value: "value", label: "Maior valor" },
  { value: "close", label: "Fechamento mais próximo" },
  { value: "stars", label: "Mais qualificadas" },
  { value: "az", label: "Nome (A–Z)" },
] as const;

const selectClass =
  "h-9 cursor-pointer rounded-lg bg-admin-input px-3 text-[13px] font-medium text-text-primary outline outline-1 -outline-offset-1 outline-admin-input-border focus:outline-2 focus:outline-admin-primary [color-scheme:dark]";

/** Lista das negociações do funil: mesmos dados do Kanban em tabela, com ações em massa. */
export default function DealsList({ deals, pipeline, otherPipelines, admins, now, busy, onOpen, onAddTask, onBulk, onQualify, onExport }: DealsListProps) {
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("updated");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(PAGE_SIZES[1]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const stageIndex = useMemo(() => new Map(pipeline.stages.map((s, i) => [s.id, i])), [pipeline.stages]);
  const sorted = useMemo(() => {
    const list = [...deals];
    const text = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");
    switch (sort) {
      case "updated":
        return list.sort((a, b) => text(b.updated_at, a.updated_at));
      case "recent":
        return list.sort((a, b) => text(b.created_at, a.created_at));
      case "value":
        return list.sort((a, b) => (b.value_cents ?? -1) - (a.value_cents ?? -1));
      case "close":
        return list.sort((a, b) => (a.expected_close_date ?? "9999").localeCompare(b.expected_close_date ?? "9999"));
      case "stars":
        return list.sort((a, b) => b.qualification - a.qualification || text(b.updated_at, a.updated_at));
      case "az":
        return list.sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));
    }
  }, [deals, sort]);

  // Seleção só do que ainda está na lista (filtros mudam por fora).
  const visibleIds = useMemo(() => new Set(deals.map((d) => d.id)), [deals]);
  const chosen = [...selected].filter((id) => visibleIds.has(id));

  const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
  const current = Math.min(page, pageCount);
  const rows = sorted.slice((current - 1) * perPage, current * perPage);
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulk = async (action: DealBulkAction, value: string) => {
    if (!value) return;
    if (await onBulk(action, value, chosen)) setSelected(new Set());
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {chosen.length ? (
          <div role="toolbar" aria-label="Ações nas negociações selecionadas" className="flex flex-wrap items-center gap-2 rounded-xl bg-admin-tip px-3 py-2">
            <span className="px-1 text-[13px] font-semibold text-admin-tip-title">{chosen.length} selecionada{chosen.length > 1 ? "s" : ""}</span>
            <select aria-label="Mover para a etapa" disabled={busy} value="" onChange={(e) => bulk("set_stage", e.target.value)} className={selectClass}>
              <option value="">Mover para etapa…</option>
              {pipeline.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {otherPipelines.length > 0 && (
              <select aria-label="Mover para outro funil" disabled={busy} value="" onChange={(e) => bulk("set_pipeline", e.target.value)} className={selectClass}>
                <option value="">Mover para outro funil…</option>
                {otherPipelines.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {p.stages.map((s) => (
                      <option key={s.id} value={`${p.id}:${s.id}`}>
                        {p.name} › {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            <select aria-label="Mudar status" disabled={busy} value="" onChange={(e) => bulk("set_status", e.target.value)} className={selectClass}>
              <option value="">Status…</option>
              <option value="em_andamento">Em andamento</option>
              <option value="pausada">Pausada</option>
            </select>
            <select aria-label="Mudar responsável" disabled={busy} value="" onChange={(e) => bulk("set_owner", e.target.value)} className={selectClass}>
              <option value="">Responsável…</option>
              {admins.map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.name}
                </option>
              ))}
            </select>
            <select aria-label="Mudar qualificação" disabled={busy} value="" onChange={(e) => bulk("set_qualification", e.target.value)} className={selectClass}>
              <option value="">Qualificação…</option>
              {dealQualifications.options.map((q) => (
                <option key={q.value} value={q.value}>
                  {"★".repeat(Number(q.value))} {q.hint}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onExport(deals.filter((d) => selected.has(d.id)))} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-admin-accent hover:bg-admin-card">
              Exportar
            </button>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Limpar seleção" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-admin-tip-text hover:bg-admin-card">
              <FaXmark aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-[13px] font-medium text-admin-text-description">Selecione negociações para mover, mudar status, responsável ou qualificação de uma vez.</p>
        )}
        <label className="flex items-center gap-2 text-[13px] font-medium text-admin-text-description">
          Ordenar
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selectClass}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl outline outline-1 -outline-offset-1 outline-admin-table-border">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <caption className="sr-only">Negociações do funil {pipeline.name}</caption>
          <thead className="bg-admin-table-head text-xs font-semibold uppercase tracking-wide text-admin-table-head-text">
            <tr className="h-11">
              <th scope="col" className="w-12 pl-5">
                <input
                  type="checkbox"
                  aria-label="Selecionar todas desta página"
                  checked={allOnPage}
                  onChange={() =>
                    setSelected((s) => {
                      const next = new Set(s);
                      rows.forEach((r) => (allOnPage ? next.delete(r.id) : next.add(r.id)));
                      return next;
                    })
                  }
                  className="h-4 w-4 cursor-pointer accent-admin-primary"
                />
              </th>
              <th scope="col" className="px-3">Negociação</th>
              <th scope="col" className="px-3">Etapa</th>
              <th scope="col" className="px-3">Status</th>
              <th scope="col" className="px-3">Qualificação</th>
              <th scope="col" className="px-3 text-right">Valor</th>
              <th scope="col" className="px-3">Responsável</th>
              <th scope="col" className="px-3">Fechamento</th>
              <th scope="col" className="px-3">Alterada em</th>
              <th scope="col" className="w-24 pr-5">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((deal, i) => {
              const stage = pipeline.stages[stageIndex.get(deal.stage_id ?? "") ?? 0];
              const alerts = dealAlerts(deal, now);
              return (
                <tr
                  key={deal.id}
                  onDoubleClick={() => onOpen(deal)}
                  className={`h-[64px] border-b border-admin-table-divider text-sm ${i % 2 ? "bg-admin-table-alt" : "bg-admin-table"} ${selected.has(deal.id) ? "!bg-admin-tip" : ""}`}
                >
                  <td className="pl-5">
                    <input type="checkbox" aria-label={`Selecionar ${deal.title}`} checked={selected.has(deal.id)} onChange={() => toggle(deal.id)} className="h-4 w-4 cursor-pointer accent-admin-primary" />
                  </td>
                  <td className="max-w-[300px] px-3">
                    <button type="button" onClick={() => onOpen(deal)} className="block max-w-full truncate text-left font-semibold text-text-primary hover:text-admin-accent focus-visible:outline-2 focus-visible:outline-admin-primary">
                      {deal.title}
                    </button>
                    <p className="flex items-center gap-1.5 truncate text-xs font-medium text-admin-table-subtext">
                      {alerts.overdue && <FaClock aria-label="Tarefa atrasada" className="h-3 w-3 shrink-0 text-admin-danger" />}
                      {alerts.noTask && <FaTriangleExclamation aria-label="Sem tarefa agendada" className="h-3 w-3 shrink-0 text-admin-warning" />}
                      <span className="truncate">{[deal.company?.name, deal.contact?.name].filter(Boolean).join(" · ") || "—"}</span>
                    </p>
                  </td>
                  <td className="px-3">
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-admin-text-label">
                      {stage.name}
                    </span>
                  </td>
                  <td className="px-3">
                    <DealStatusBadge status={deal.status} />
                  </td>
                  <td className="px-3">
                    <Stars value={deal.qualification} onChange={(n) => onQualify(deal, n)} showHint={false} />
                  </td>
                  <td className="px-3 text-right font-semibold text-text-primary">{formatMoney(deal.value_cents)}</td>
                  <td className="max-w-[160px] truncate px-3 text-[13px] text-admin-text-label">{deal.owner_name ?? "—"}</td>
                  <td className={`px-3 text-[13px] ${alerts.lateClose ? "font-semibold text-admin-danger" : "text-admin-table-date"}`}>{formatCalendarDate(deal.expected_close_date)}</td>
                  <td className="px-3 text-[13px] text-admin-table-date">{formatDateTime(deal.updated_at)}</td>
                  <td className="pr-5">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => onAddTask(deal)} aria-label={`Criar tarefa para ${deal.title}`} title="Criar tarefa" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-admin-text-description hover:bg-admin-card hover:text-text-primary">
                        <FaPlus aria-hidden className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => onOpen(deal)} aria-label={`Abrir ${deal.title}`} title="Abrir negociação" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-admin-accent hover:bg-admin-card">
                        <FaArrowUpRightFromSquare aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={10} className="bg-admin-table px-6 py-14 text-center text-sm text-admin-text-hint">
                  Nenhuma negociação com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <LeadsPagination
          page={current}
          pageCount={pageCount}
          perPage={perPage}
          total={sorted.length}
          onPage={setPage}
          onPerPage={(n) => {
            setPerPage(n);
            setPage(1);
          }}
          noun={{ one: "negociação", many: "negociações" }}
        />
      </div>
    </div>
  );
}
