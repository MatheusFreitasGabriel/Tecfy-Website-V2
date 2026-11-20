"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FaBell, FaChevronDown, FaDownload, FaRepeat, FaXmark } from "react-icons/fa6";
import { taskParents, taskTypes } from "@/lib/admin/crm/options";
import type { AdminUserOption, TaskRow } from "@/lib/admin/crm/types";
import LeadsPagination, { PAGE_SIZES } from "../leads/LeadsPagination";
import { SearchInput, matchesSearch } from "../shared/ListControls";
import { brazilDate } from "../deals/dealVisuals";
import { downloadCsv } from "../deals/exportDealsCsv";
import { PARENT_ICON, TASK_TYPE_ICON, TaskMenu, parentHref, taskDay, taskStatus, taskTime, type QuickReschedule } from "./taskVisuals";

export type TaskBulkAction = "complete" | "reopen" | "delete" | "assign" | "shift" | "move_to";

interface TasksListProps {
  tasks: TaskRow[];
  admins: AdminUserOption[];
  currentUid: string;
  now: number | null;
  basePath: string;
  busy: boolean;
  onToggle: (task: TaskRow, done: boolean) => void;
  onEdit: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
  onReschedule: (task: TaskRow, how: QuickReschedule) => void;
  onBulk: (action: TaskBulkAction, ids: string[], value?: string | number) => Promise<boolean>;
}

const DAY = 86_400_000;
const STATUS_LABEL = { done: "Concluída", overdue: "Atrasada", today: "Hoje", upcoming: "Aberta" } as const;
const STATUS_STYLE = {
  done: "bg-admin-deal-won text-admin-deal-won-text",
  overdue: "bg-admin-deal-lost text-admin-deal-lost-text",
  today: "bg-admin-qual-hot text-admin-qual-hot-text",
  upcoming: "bg-admin-deal-progress text-admin-deal-progress-text",
} as const;
const controlClass =
  "h-11 w-full min-w-0 cursor-pointer appearance-none rounded-[10px] bg-background-kpi pl-3.5 pr-10 text-[13px] font-medium text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border focus:outline-2 focus:outline-admin-primary [color-scheme:dark]";
const smallSelect =
  "h-9 cursor-pointer rounded-lg bg-admin-input px-3 text-[13px] font-medium text-text-primary outline outline-1 -outline-offset-1 outline-admin-input-border focus:outline-2 focus:outline-admin-primary [color-scheme:dark]";

/** Lista de TODAS as tarefas do time: filtros, ordenação, ações em massa e exportação. */
export default function TasksList({ tasks, admins, currentUid, now, basePath, busy, onToggle, onEdit, onDelete, onReschedule, onBulk }: TasksListProps) {
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("open");
  const [period, setPeriod] = useState("");
  const [parent, setParent] = useState("");
  const [sort, setSort] = useState<"due" | "due_desc" | "created">("due");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(PAGE_SIZES[1]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveDate, setMoveDate] = useState("");

  const filtered = useMemo(() => {
    const today = now === null ? null : brazilDate(now);
    const limit = (days: number) => (now === null ? null : brazilDate(now + days * DAY));
    const list = tasks.filter((t) => {
      const st = taskStatus(t, now);
      if (status === "open" && st === "done") return false;
      if (status === "done" && st !== "done") return false;
      if (status === "overdue" && st !== "overdue") return false;
      if (status === "today" && st !== "today") return false;
      if (assignee === "me" && t.assignee_uid !== currentUid) return false;
      if (assignee && assignee !== "me" && t.assignee_uid !== assignee) return false;
      if (type && t.type !== type) return false;
      if (parent === "none" && t.parent) return false;
      if (parent && parent !== "none" && t.parent?.type !== parent) return false;
      if (period && today) {
        const day = brazilDate(Date.parse(t.due_at));
        if (period === "today" && day !== today) return false;
        if (period === "week" && (day < today || day > limit(7)!)) return false;
        if (period === "month" && (day < today || day > limit(30)!)) return false;
        if (period === "past" && day >= today) return false;
      }
      return matchesSearch(query, t.title, t.notes, t.parent?.label, t.assignee_name, taskTypes.label(t.type));
    });
    if (sort === "due") list.sort((a, b) => a.due_at.localeCompare(b.due_at));
    if (sort === "due_desc") list.sort((a, b) => b.due_at.localeCompare(a.due_at));
    if (sort === "created") list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return list;
  }, [tasks, now, status, assignee, type, parent, period, query, sort, currentUid]);

  const visible = useMemo(() => new Set(filtered.map((t) => t.id)), [filtered]);
  const chosen = [...selected].filter((id) => visible.has(id));
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * perPage, current * perPage);
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const filtersOn = Boolean(query || assignee || type || period || parent || status !== "open");

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const bulk = async (action: TaskBulkAction, value?: string | number) => {
    if (await onBulk(action, chosen, value)) setSelected(new Set());
  };

  const exportCsv = () =>
    downloadCsv(
      ["Tarefa", "Tipo", "Vencimento", "Status", "Responsável", "Vínculo", "Tipo do vínculo", "Repete", "Observações", "Concluída em", "Criada por"],
      filtered.map((t) => [
        t.title,
        taskTypes.label(t.type),
        `${taskDay(t.due_at)} ${taskTime(t.due_at)}`,
        STATUS_LABEL[taskStatus(t, now)],
        t.assignee_name,
        t.parent?.label,
        t.parent ? taskParents.label(t.parent.type) : "",
        t.recurrence ? "Sim" : "Não",
        t.notes,
        t.done_at ? `${taskDay(t.done_at)} ${taskTime(t.done_at)}` : "",
        t.created_by_name,
      ]),
      "tarefas.csv",
    );

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row">
          <SearchInput value={query} onChange={reset(setQuery)} placeholder="Buscar tarefa, observação, vínculo ou responsável" />
          <button type="button" onClick={exportCsv} disabled={!filtered.length} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-background-kpi px-4 text-[13px] font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border hover:bg-admin-card disabled:opacity-40">
            <FaDownload aria-hidden className="h-3.5 w-3.5" /> Exportar
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Filter label="Status" value={status} onChange={reset(setStatus)}>
            <option value="open">Abertas</option>
            <option value="overdue">Atrasadas</option>
            <option value="today">Para hoje</option>
            <option value="done">Concluídas (60 dias)</option>
            <option value="">Todas</option>
          </Filter>
          <Filter label="Responsável" value={assignee} onChange={reset(setAssignee)}>
            <option value="">Todo o time</option>
            <option value="me">Minhas</option>
            {admins
              .filter((a) => a.uid !== currentUid)
              .map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.name}
                </option>
              ))}
          </Filter>
          <Filter label="Período" value={period} onChange={reset(setPeriod)}>
            <option value="">Qualquer data</option>
            <option value="today">Hoje</option>
            <option value="week">Próximos 7 dias</option>
            <option value="month">Próximos 30 dias</option>
            <option value="past">Datas passadas</option>
          </Filter>
          <Filter label="Tipo" value={type} onChange={reset(setType)}>
            <option value="">Todos os tipos</option>
            {taskTypes.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Filter>
          <Filter label="Vínculo" value={parent} onChange={reset(setParent)}>
            <option value="">Qualquer vínculo</option>
            {taskParents.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="none">Avulsas</option>
          </Filter>
          <Filter label="Ordenar" value={sort} onChange={(v) => setSort(v as typeof sort)}>
            <option value="due">Vencimento (mais próximo)</option>
            <option value="due_desc">Vencimento (mais distante)</option>
            <option value="created">Criadas recentemente</option>
          </Filter>
        </div>
        {filtersOn && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setAssignee("");
              setType("");
              setStatus("open");
              setPeriod("");
              setParent("");
              setPage(1);
            }}
            className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-admin-text-description hover:text-text-primary"
          >
            <FaXmark aria-hidden className="h-3 w-3" /> Limpar filtros · {filtered.length} tarefa(s)
          </button>
        )}
      </div>

      {/* Ações em massa */}
      {chosen.length > 0 && (
        <div role="toolbar" aria-label="Ações nas tarefas selecionadas" className="flex flex-wrap items-center gap-2 rounded-xl bg-admin-tip px-3 py-2">
          <span className="px-1 text-[13px] font-semibold text-admin-tip-title">{chosen.length} selecionada(s)</span>
          <button type="button" disabled={busy} onClick={() => bulk("complete")} className="h-9 rounded-lg bg-admin-primary px-3 text-[13px] font-semibold text-text-primary hover:bg-admin-primary-hover disabled:opacity-50">
            Concluir
          </button>
          <button type="button" disabled={busy} onClick={() => bulk("reopen")} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-admin-tip-title hover:bg-admin-card disabled:opacity-50">
            Reabrir
          </button>
          <select aria-label="Reagendar" disabled={busy} value="" onChange={(e) => e.target.value && bulk("shift", Number(e.target.value))} className={smallSelect}>
            <option value="">Reagendar…</option>
            <option value="1">+1 dia</option>
            <option value="2">+2 dias</option>
            <option value="7">+1 semana</option>
            <option value="-1">−1 dia</option>
          </select>
          <span className="flex items-center gap-1">
            <input type="date" aria-label="Mover para o dia" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className={`${smallSelect} w-[150px]`} />
            <button type="button" disabled={busy || !moveDate} onClick={() => bulk("move_to", moveDate)} className="h-9 rounded-lg px-2.5 text-[13px] font-semibold text-admin-tip-title hover:bg-admin-card disabled:opacity-40">
              Mover
            </button>
          </span>
          <select aria-label="Atribuir a" disabled={busy} value="" onChange={(e) => e.target.value && bulk("assign", e.target.value)} className={smallSelect}>
            <option value="">Atribuir a…</option>
            {admins.map((a) => (
              <option key={a.uid} value={a.uid}>
                {a.uid === currentUid ? `${a.name} (você)` : a.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={() => bulk("delete")} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-admin-danger hover:bg-admin-card disabled:opacity-50">
            Excluir
          </button>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Limpar seleção" className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-admin-tip-text hover:bg-admin-card">
            <FaXmark aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl outline outline-1 -outline-offset-1 outline-admin-table-border">
        <table className="w-full min-w-[1000px] border-collapse text-left">
          <caption className="sr-only">Tarefas</caption>
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
              <th scope="col" className="w-12">
                <span className="sr-only">Concluir</span>
              </th>
              <th scope="col" className="px-3">Tarefa</th>
              <th scope="col" className="px-3">Vínculo</th>
              <th scope="col" className="px-3">Responsável</th>
              <th scope="col" className="px-3">Vencimento</th>
              <th scope="col" className="px-3">Status</th>
              <th scope="col" className="w-14 pr-4">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const st = taskStatus(t, now);
              const TypeIcon = TASK_TYPE_ICON[t.type];
              const ParentIcon = t.parent ? PARENT_ICON[t.parent.type] : null;
              return (
                <tr key={t.id} className={`h-[60px] border-b border-admin-table-divider text-sm ${i % 2 ? "bg-admin-table-alt" : "bg-admin-table"} ${selected.has(t.id) ? "!bg-admin-tip" : ""}`}>
                  <td className="pl-5">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${t.title}`}
                      checked={selected.has(t.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        })
                      }
                      className="h-4 w-4 cursor-pointer accent-admin-primary"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => onToggle(t, st !== "done")}
                      disabled={busy}
                      aria-label={st === "done" ? `Reabrir ${t.title}` : `Concluir ${t.title}`}
                      title={st === "done" ? "Reabrir" : "Concluir"}
                      className={`flex h-6 w-6 items-center justify-center rounded-full outline outline-2 -outline-offset-2 transition-colors ${st === "done" ? "bg-admin-success outline-admin-success" : "outline-admin-card-border hover:outline-admin-success"}`}
                    >
                      {st === "done" && <span aria-hidden className="text-xs font-bold text-background-kpi">✓</span>}
                    </button>
                  </td>
                  <td className="max-w-[320px] px-3">
                    <button type="button" onClick={() => onEdit(t)} className={`flex max-w-full items-center gap-2 text-left font-semibold hover:text-admin-accent ${st === "done" ? "text-admin-text-hint line-through" : "text-text-primary"}`}>
                      <TypeIcon aria-hidden className="h-3 w-3 shrink-0 text-admin-text-hint" />
                      <span className="truncate">{t.title}</span>
                      {t.recurrence && <FaRepeat aria-label="Recorrente" className="h-2.5 w-2.5 shrink-0 text-admin-accent" />}
                      {t.remind_minutes !== null && st !== "done" && <FaBell aria-label="Com lembrete" className="h-2.5 w-2.5 shrink-0 text-admin-text-hint" />}
                    </button>
                    <p className="truncate text-xs text-admin-table-subtext">{t.notes ?? taskTypes.label(t.type)}</p>
                  </td>
                  <td className="max-w-[220px] px-3">
                    {t.parent && ParentIcon ? (
                      <Link href={parentHref(basePath, t.parent)} className="inline-flex max-w-full items-center gap-1.5 truncate text-[13px] font-medium text-admin-accent hover:underline">
                        <ParentIcon aria-hidden className="h-3 w-3 shrink-0" />
                        <span className="truncate">{t.parent.label}</span>
                      </Link>
                    ) : (
                      <span className="text-[13px] text-admin-text-hint">Avulsa</span>
                    )}
                  </td>
                  <td className="max-w-[160px] truncate px-3 text-[13px] text-admin-text-label">{t.assignee_uid === currentUid ? "Você" : (t.assignee_name ?? "—")}</td>
                  <td className={`whitespace-nowrap px-3 text-[13px] ${st === "overdue" ? "font-semibold text-admin-danger" : "text-admin-table-date"}`}>
                    <span className="capitalize">{taskDay(t.due_at)}</span> · {taskTime(t.due_at)}
                  </td>
                  <td className="px-3">
                    <span className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                  </td>
                  <td className="pr-4">
                    <TaskMenu task={t} now={now} busy={busy} onEdit={onEdit} onDelete={onDelete} onReschedule={onReschedule} />
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="bg-admin-table px-6 py-14 text-center text-sm text-admin-text-hint">
                  Nenhuma tarefa com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <LeadsPagination
          page={current}
          pageCount={pageCount}
          perPage={perPage}
          total={filtered.length}
          onPage={setPage}
          onPerPage={(n) => {
            setPerPage(n);
            setPage(1);
          }}
          noun={{ one: "tarefa", many: "tarefas" }}
        />
      </div>
    </div>
  );
}

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-admin-text-description">{label}</span>
      <span className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={controlClass}>
          {children}
        </select>
        <FaChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-description" />
      </span>
    </label>
  );
}
