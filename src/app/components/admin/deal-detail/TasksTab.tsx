"use client";

import { useMemo, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { taskTypes } from "@/lib/admin/crm/options";
import type { TaskRow } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import { brazilDate } from "../deals/dealVisuals";

interface TasksTabProps {
  tasks: TaskRow[];
  now: number | null;
  onCreate: () => void;
  onToggle: (task: TaskRow, done: boolean) => void;
  onEdit: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
const longDay = (key: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));

/** Tarefas da negociação: lista por situação + calendário do mês (dia atual destacado). */
export default function TasksTab({ tasks, now, onCreate, onToggle, onEdit, onDelete }: TasksTabProps) {
  const [initial] = useState(() => Date.now());
  const [month, setMonth] = useState(() => {
    const [y, m] = brazilDate(initial).split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const today = now !== null ? brazilDate(now) : null;

  const byDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      const key = brazilDate(Date.parse(t.due_at));
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [tasks]);

  const groups = useMemo(() => {
    const open = tasks.filter((t) => !t.done_at);
    const done = tasks.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
    if (now === null) return [{ id: "open", label: "Abertas", items: open }, { id: "done", label: "Concluídas", items: done }];
    return [
      { id: "overdue", label: "Atrasadas", items: open.filter((t) => Date.parse(t.due_at) < now) },
      { id: "today", label: "Hoje", items: open.filter((t) => Date.parse(t.due_at) >= now && brazilDate(Date.parse(t.due_at)) === today) },
      { id: "next", label: "Próximas", items: open.filter((t) => Date.parse(t.due_at) >= now && brazilDate(Date.parse(t.due_at)) !== today) },
      { id: "done", label: "Concluídas", items: done },
    ];
  }, [tasks, now, today]);

  const first = new Date(Date.UTC(month.y, month.m, 1));
  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells = [...Array.from({ length: first.getUTCDay() }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const keyOf = (day: number) => `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const shift = (delta: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  const dayTasks = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="flex flex-col gap-5 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border" aria-label="Lista de tarefas">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium text-text-primary">Tarefas</h2>
          <Button icon={FaPlus} onClick={onCreate} className="h-9 px-4 text-[13px]">
            Criar tarefa
          </Button>
        </div>
        {!tasks.length && <p className="py-6 text-center text-sm text-admin-text-hint">Nenhuma tarefa ainda. Agende o próximo passo desta negociação.</p>}
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <div key={g.id} className="flex flex-col gap-2">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${g.id === "overdue" ? "text-admin-danger" : "text-admin-text-description"}`}>
                {g.label} · {g.items.length}
              </h3>
              <ul className="flex flex-col gap-2">
                {g.items.map((t) => (
                  <TaskItem key={t.id} task={t} overdue={g.id === "overdue"} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </ul>
            </div>
          ))}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border" aria-label="Calendário de tarefas">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-admin-text-label hover:bg-admin-card">
            <FaChevronLeft aria-hidden className="h-3 w-3" />
          </button>
          <h2 className="text-sm font-semibold capitalize text-text-primary" aria-live="polite">
            {monthName.format(first)}
          </h2>
          <button type="button" onClick={() => shift(1)} aria-label="Próximo mês" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-admin-text-label hover:bg-admin-card">
            <FaChevronRight aria-hidden className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label="Dias do mês">
          {WEEKDAYS.map((d) => (
            <span key={d} role="columnheader" className="pb-1 text-[11px] font-semibold uppercase text-admin-text-hint">
              {d}
            </span>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <span key={`e${i}`} />;
            const key = keyOf(day);
            const items = byDay.get(key) ?? [];
            const open = items.filter((t) => !t.done_at);
            const late = now !== null && open.some((t) => Date.parse(t.due_at) < now);
            const isToday = key === today;
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-selected={selected === key}
                aria-label={`${longDay(key)}${items.length ? `, ${items.length} tarefa(s)` : ""}${isToday ? ", hoje" : ""}`}
                onClick={() => setSelected(selected === key ? null : key)}
                className={`flex h-12 flex-col items-center justify-center gap-1 rounded-lg text-sm font-semibold transition-colors aria-selected:outline aria-selected:outline-2 aria-selected:outline-admin-accent ${
                  isToday ? "bg-admin-primary text-admin-primary-text" : items.length ? "bg-admin-card text-text-primary hover:bg-admin-badge" : "text-admin-text-description hover:bg-admin-card"
                }`}
              >
                {day}
                {items.length > 0 && (
                  <span className="flex items-center gap-0.5" aria-hidden>
                    {open.length > 0 && <span className={`h-1.5 w-1.5 rounded-full ${late ? "bg-admin-danger" : isToday ? "bg-text-primary" : "bg-admin-accent"}`} />}
                    {items.length > open.length && <span className="h-1.5 w-1.5 rounded-full bg-admin-success" />}
                    {items.length > 1 && <span className="text-[9px] leading-none">{items.length}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-admin-text-hint">
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-admin-accent" /> aberta</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-admin-danger" /> atrasada</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-admin-success" /> concluída</span>
        </p>
        {selected && (
          <div className="flex flex-col gap-2 border-t border-admin-divider pt-4">
            <h3 className="text-sm font-semibold capitalize text-text-primary">{longDay(selected)}</h3>
            {dayTasks.length ? (
              <ul className="flex flex-col gap-2">
                {dayTasks.map((t) => (
                  <TaskItem key={t.id} task={t} overdue={now !== null && !t.done_at && Date.parse(t.due_at) < now} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-admin-text-hint">Nenhuma tarefa neste dia.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskItem({ task, overdue, onToggle, onEdit, onDelete }: { task: TaskRow; overdue: boolean; onToggle: (t: TaskRow, done: boolean) => void; onEdit: (t: TaskRow) => void; onDelete: (t: TaskRow) => void }) {
  const done = Boolean(task.done_at);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className={`flex items-start gap-3 rounded-xl px-4 py-3 ${overdue ? "bg-admin-deal-lost" : "bg-admin-drawer-card"}`}>
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => onToggle(task, e.target.checked)}
        aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        data-variant="round"
        className="mt-0.5 h-5 w-5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${done ? "text-admin-text-hint line-through" : "text-text-primary"}`}>{task.title}</p>
        <p className={`text-xs font-medium ${overdue ? "text-admin-deal-lost-text" : "text-admin-text-description"}`}>
          {taskTypes.label(task.type)} · {dayLabel.format(new Date(task.due_at))} às {time.format(new Date(task.due_at))} · {task.assignee_name ?? "—"}
        </p>
        {task.notes && <p className="mt-1 whitespace-pre-line text-xs text-admin-drawer-notes">{task.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {confirm ? (
          <>
            <button type="button" onClick={() => onDelete(task)} className="h-8 rounded-md bg-admin-danger-strong px-2.5 text-xs font-semibold text-text-primary hover:bg-admin-danger-strong-hover">
              Excluir
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="h-8 rounded-md px-2 text-xs font-semibold text-admin-text-description hover:text-text-primary">
              Não
            </button>
          </>
        ) : (
          <>
            {!done && (
              <button type="button" onClick={() => onEdit(task)} aria-label={`Editar ou reagendar: ${task.title}`} title="Editar / reagendar" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-admin-text-hint hover:bg-admin-card hover:text-text-primary">
                <FaPen aria-hidden className="h-3 w-3" />
              </button>
            )}
            <button type="button" onClick={() => setConfirm(true)} aria-label={`Excluir: ${task.title}`} title="Excluir tarefa" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-admin-text-hint hover:bg-admin-card hover:text-admin-danger">
              <FaTrash aria-hidden className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
