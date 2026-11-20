"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FaBell,
  FaBuilding,
  FaCalendarDay,
  FaCircleCheck,
  FaEllipsis,
  FaEnvelope,
  FaFileSignature,
  FaHandshake,
  FaListCheck,
  FaPen,
  FaPhone,
  FaRepeat,
  FaTrash,
  FaUser,
  FaUserPlus,
  FaUsers,
  FaWhatsapp,
} from "react-icons/fa6";
import { taskRecurrences, taskReminders, taskTypes, type TaskType } from "@/lib/admin/crm/options";
import type { TaskParent, TaskRow } from "@/lib/admin/crm/types";
import { brazilDateTime } from "@/lib/admin/crm/dealValidation";
import { brazilDate } from "../deals/dealVisuals";

type Icon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export const TASK_TYPE_ICON: Record<TaskType, Icon> = {
  follow_up: FaListCheck,
  ligacao: FaPhone,
  reuniao: FaUsers,
  whatsapp: FaWhatsapp,
  email: FaEnvelope,
  proposta: FaFileSignature,
  outro: FaCalendarDay,
};
export const PARENT_ICON: Record<TaskParent["type"], Icon> = { deal: FaHandshake, lead: FaUserPlus, contact: FaUser, company: FaBuilding };

/** Link para a tela do vínculo. */
export function parentHref(basePath: string, parent: TaskParent): string {
  if (parent.type === "deal") return `${basePath}/negociacoes/${parent.id}`;
  if (parent.type === "lead") return `${basePath}/leads?lead=${encodeURIComponent(parent.id)}`;
  if (parent.type === "contact") return `${basePath}/contatos/${parent.id}`;
  return `${basePath}/empresas/${parent.id}`;
}

const DAY = 86_400_000;
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
export const taskTime = (iso: string) => timeFmt.format(new Date(iso));
export const taskDay = (iso: string) => dayFmt.format(new Date(iso));
const hhmm = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export type TaskStatus = "done" | "overdue" | "today" | "upcoming";
export function taskStatus(task: TaskRow, now: number | null): TaskStatus {
  if (task.done_at) return "done";
  if (now === null) return "upcoming";
  const due = Date.parse(task.due_at);
  if (due < now) return "overdue";
  return brazilDate(due) === brazilDate(now) ? "today" : "upcoming";
}

/** Novo vencimento mantendo o horário (igual ao servidor). */
export function dueOn(task: TaskRow, date: string): string {
  return brazilDateTime(date, hhmm(task.due_at)).toISOString();
}
export function shiftDue(task: TaskRow, days: number): string {
  return dueOn(task, brazilDate(Date.parse(task.due_at) + days * DAY));
}
/** Próxima segunda-feira (AAAA-MM-DD, Brasília). */
export function nextMonday(now: number): string {
  for (let i = 1; i <= 7; i++) {
    const d = brazilDate(now + i * DAY);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 1) return d;
  }
  return brazilDate(now + 7 * DAY);
}

export type QuickReschedule = { kind: "shift"; days: number } | { kind: "move_to"; date: string };

interface TaskLineProps {
  task: TaskRow;
  now: number | null;
  basePath: string;
  /** Mostra o dia (listas que misturam dias). */
  showDay?: boolean;
  showAssignee?: boolean;
  busy?: boolean;
  onToggle: (task: TaskRow, done: boolean) => void;
  onEdit: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
  onReschedule: (task: TaskRow, how: QuickReschedule) => void;
}

/** Linha de tarefa (Meu dia / dia do calendário): concluir, hora, tipo, vínculo, repetição, lembrete e ações. */
export function TaskLine({ task, now, basePath, showDay, showAssignee, busy, onToggle, onEdit, onDelete, onReschedule }: TaskLineProps) {
  const status = taskStatus(task, now);
  const TypeIcon = TASK_TYPE_ICON[task.type];
  const ParentIcon = task.parent ? PARENT_ICON[task.parent.type] : null;
  const done = status === "done";
  return (
    <li className={`group flex items-start gap-3 rounded-xl px-4 py-3 transition-colors ${status === "overdue" ? "bg-admin-deal-lost/70" : "bg-admin-drawer-card hover:bg-admin-card"}`}>
      <input
        type="checkbox"
        checked={done}
        disabled={busy}
        onChange={(e) => onToggle(task, e.target.checked)}
        aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        data-variant="round"
        className="mt-0.5 h-5 w-5 shrink-0"
      />
      <div className="flex w-14 shrink-0 flex-col pt-0.5">
        <span className={`text-sm font-semibold tabular-nums ${status === "overdue" ? "text-admin-deal-lost-text" : done ? "text-admin-text-hint" : "text-text-primary"}`}>{taskTime(task.due_at)}</span>
        {showDay && <span className="text-[10px] font-medium capitalize text-admin-text-hint">{taskDay(task.due_at)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-2 text-sm font-semibold ${done ? "text-admin-text-hint line-through" : "text-text-primary"}`}>
          <TypeIcon aria-hidden className="h-3 w-3 shrink-0 text-admin-text-hint" />
          <span className="truncate">{task.title}</span>
          {task.recurrence && (
            <span title={`Repete: ${taskRecurrences.label(task.recurrence.freq)}${task.recurrence.freq === "every_n_days" ? ` (${task.recurrence.interval} dias)` : ""}`}>
              <FaRepeat aria-label="Tarefa recorrente" className="h-2.5 w-2.5 shrink-0 text-admin-accent" />
            </span>
          )}
          {task.remind_minutes !== null && !done && (
            <span title={`Lembrete: ${taskReminders.label(String(task.remind_minutes))}`}>
              <FaBell aria-label="Com lembrete" className="h-2.5 w-2.5 shrink-0 text-admin-text-hint" />
            </span>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-admin-text-description">
          <span>{taskTypes.label(task.type)}</span>
          {task.parent && ParentIcon && (
            <Link href={parentHref(basePath, task.parent)} className="inline-flex max-w-[260px] items-center gap-1 truncate font-medium text-admin-accent hover:underline">
              <ParentIcon aria-hidden className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{task.parent.label}</span>
            </Link>
          )}
          {showAssignee && <span>· {task.assignee_name ?? "Sem responsável"}</span>}
        </p>
        {task.notes && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-admin-drawer-notes">{task.notes}</p>}
      </div>
      <TaskMenu task={task} now={now} busy={busy} onEdit={onEdit} onDelete={onDelete} onReschedule={onReschedule} />
    </li>
  );
}

/** Menu "⋯": reagendar rápido, editar, excluir (com confirmação). */
export function TaskMenu({ task, now, busy, onEdit, onDelete, onReschedule }: { task: TaskRow; now: number | null; busy?: boolean; onEdit: (t: TaskRow) => void; onDelete: (t: TaskRow) => void; onReschedule: (t: TaskRow, how: QuickReschedule) => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setConfirm(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const today = now === null ? null : brazilDate(now);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label={`Ações da tarefa ${task.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-admin-text-hint opacity-60 transition-opacity hover:bg-admin-badge hover:text-text-primary group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-30"
      >
        <FaEllipsis aria-hidden className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="menu" onKeyDown={(e) => e.key === "Escape" && setOpen(false)} className="absolute right-0 top-9 z-30 flex w-56 flex-col rounded-xl bg-admin-card p-1.5 shadow-2xl outline outline-1 -outline-offset-1 outline-admin-card-border">
          {!task.done_at && (
            <>
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-admin-text-hint">Reagendar (mesmo horário)</p>
              {today && <MenuItem onClick={pick(() => onReschedule(task, { kind: "move_to", date: today }))}>Para hoje</MenuItem>}
              {today && <MenuItem onClick={pick(() => onReschedule(task, { kind: "move_to", date: brazilDate(Date.parse(`${today}T12:00:00-03:00`) + DAY) }))}>Para amanhã</MenuItem>}
              <MenuItem onClick={pick(() => onReschedule(task, { kind: "shift", days: 1 }))}>+1 dia</MenuItem>
              <MenuItem onClick={pick(() => onReschedule(task, { kind: "shift", days: 7 }))}>+1 semana</MenuItem>
              {now !== null && <MenuItem onClick={pick(() => onReschedule(task, { kind: "move_to", date: nextMonday(now) }))}>Próxima segunda</MenuItem>}
              <div className="my-1 border-t border-admin-divider" />
            </>
          )}
          <MenuItem icon={FaPen} onClick={pick(() => onEdit(task))}>
            {task.done_at ? "Ver / editar" : "Editar ou escolher data"}
          </MenuItem>
          {confirm ? (
            <button type="button" role="menuitem" autoFocus onClick={pick(() => onDelete(task))} className="flex h-9 items-center gap-2.5 rounded-lg bg-admin-danger-strong px-3 text-left text-sm font-semibold text-text-primary hover:bg-admin-danger-strong-hover">
              <FaTrash aria-hidden className="h-3 w-3" /> Confirmar exclusão
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={() => setConfirm(true)} className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-admin-danger hover:bg-admin-badge">
              <FaTrash aria-hidden className="h-3 w-3" /> Excluir tarefa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, onClick, children }: { icon?: Icon; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-text-primary hover:bg-admin-badge">
      {Icon ? <Icon aria-hidden className="h-3 w-3 text-admin-text-hint" /> : <FaCircleCheck aria-hidden className="h-3 w-3 text-transparent" />}
      {children}
    </button>
  );
}
