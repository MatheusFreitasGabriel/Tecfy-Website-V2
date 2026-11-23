"use client";

import { useMemo, useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { FaChevronDown, FaChevronLeft, FaChevronRight, FaPlus } from "react-icons/fa6";
import type { AdminUserOption, TaskRow } from "@/lib/admin/crm/types";
import { brazilDate } from "../deals/dealVisuals";
import { TASK_TYPE_ICON, TaskLine, taskStatus, taskTime, type QuickReschedule } from "./taskVisuals";

interface TasksCalendarProps {
  tasks: TaskRow[];
  admins: AdminUserOption[];
  currentUid: string;
  now: number | null;
  basePath: string;
  busyIds: Set<string>;
  onCreateOn: (date: string) => void;
  onToggle: (task: TaskRow, done: boolean) => void;
  onEdit: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
  onReschedule: (task: TaskRow, how: QuickReschedule) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const utc = (key: string) => new Date(`${key}T12:00:00Z`);
const addDays = (key: string, n: number) => {
  const d = utc(key);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
const monthTitle = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const MAX_CHIPS = 3;

/** Calendário (mês/semana) das tarefas. Arrastar uma tarefa para outro dia reagenda (mesmo horário). */
export default function TasksCalendar({ tasks, admins, currentUid, now, basePath, busyIds, onCreateOn, onToggle, onEdit, onDelete, onReschedule }: TasksCalendarProps) {
  const [initial] = useState(() => brazilDate(Date.now()));
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(initial);
  const [person, setPerson] = useState<string>(currentUid);
  const [showDone, setShowDone] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const today = now === null ? null : brazilDate(now);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  const byDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      if (person && t.assignee_uid !== person) continue;
      if (!showDone && t.done_at) continue;
      const key = brazilDate(Date.parse(t.due_at));
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    for (const list of map.values()) list.sort((a, b) => a.due_at.localeCompare(b.due_at));
    return map;
  }, [tasks, person, showDone]);

  // Dias visíveis.
  const days = useMemo(() => {
    if (mode === "week") {
      const start = addDays(anchor, -utc(anchor).getUTCDay());
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const first = `${anchor.slice(0, 7)}-01`;
    const start = addDays(first, -utc(first).getUTCDay());
    const lastDay = new Date(Date.UTC(utc(first).getUTCFullYear(), utc(first).getUTCMonth() + 1, 0)).getUTCDate();
    const cells = Math.ceil((utc(first).getUTCDay() + lastDay) / 7) * 7;
    return Array.from({ length: cells }, (_, i) => addDays(start, i));
  }, [mode, anchor]);

  const shift = (dir: -1 | 1) => {
    if (mode === "week") setAnchor((a) => addDays(a, 7 * dir));
    else
      setAnchor((a) => {
        const d = utc(`${a.slice(0, 7)}-01`);
        d.setUTCMonth(d.getUTCMonth() + dir);
        return ymd(d);
      });
    setSelected(null);
  };
  const title = mode === "month" ? monthTitle.format(utc(`${anchor.slice(0, 7)}-01`)) : `${shortDay.format(utc(days[0]))} – ${shortDay.format(utc(days[6]))}`;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    const target = String(over.id);
    if (!task || task.done_at || brazilDate(Date.parse(task.due_at)) === target) return;
    onReschedule(task, { kind: "move_to", date: target });
  };

  const line = (t: TaskRow) => (
    <TaskLine key={t.id} task={t} now={now} basePath={basePath} showAssignee={!person} busy={busyIds.has(t.id)} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onReschedule={onReschedule} />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Barra */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label="Anterior" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-card">
            <FaChevronLeft aria-hidden className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Próximo" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-card">
            <FaChevronRight aria-hidden className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (today) setAnchor(today);
              setSelected(today);
            }}
            className="h-10 rounded-lg px-3 text-[13px] font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-card"
          >
            Hoje
          </button>
          <h2 className="ml-2 text-lg font-semibold capitalize text-text-primary" aria-live="polite">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-admin-text-description">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-4 w-4 accent-admin-primary" />
            Mostrar concluídas
          </label>
          <span className="relative">
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              aria-label="De quem"
              className="h-10 cursor-pointer appearance-none rounded-lg bg-background-kpi pl-3 pr-9 text-[13px] font-medium text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border [color-scheme:dark]"
            >
              <option value="">Todo o time</option>
              {admins.map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.uid === currentUid ? `${a.name} (você)` : a.name}
                </option>
              ))}
            </select>
            <FaChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-description" />
          </span>
          <div role="tablist" aria-label="Visão do calendário" className="inline-flex h-10 rounded-lg bg-background-kpi p-1 outline outline-1 -outline-offset-1 outline-admin-picker-border">
            {(
              [
                ["month", "Mês"],
                ["week", "Semana"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className="rounded-md px-3 text-[13px] font-semibold text-admin-text-description aria-selected:bg-admin-primary aria-selected:text-admin-primary-text">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="overflow-hidden rounded-2xl outline outline-1 -outline-offset-1 outline-admin-card-border">
          <div className="grid grid-cols-7 bg-admin-table-head">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-admin-table-head-text">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((key) => (
              <DayCell
                key={key}
                day={key}
                tall={mode === "week"}
                outside={mode === "month" && key.slice(0, 7) !== anchor.slice(0, 7)}
                isToday={key === today}
                selected={selected === key}
                tasks={byDay.get(key) ?? []}
                now={now}
                onSelect={() => setSelected(selected === key ? null : key)}
                onCreate={() => onCreateOn(key)}
                onEdit={onEdit}
                limit={mode === "week" ? 50 : MAX_CHIPS}
              />
            ))}
          </div>
        </div>
      </DndContext>
      <p className="text-xs text-admin-text-hint">Arraste uma tarefa para outro dia para reagendar (o horário é mantido). Clique no dia para ver tudo dele.</p>

      {selected && (
        <section className="flex flex-col gap-3 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border" aria-label={`Tarefas de ${longDay.format(utc(selected))}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold capitalize text-text-primary">{longDay.format(utc(selected))}</h3>
            <button type="button" onClick={() => onCreateOn(selected)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-admin-accent hover:underline">
              <FaPlus aria-hidden className="h-3 w-3" /> Nova tarefa neste dia
            </button>
          </div>
          {(byDay.get(selected) ?? []).length ? <ul className="flex flex-col gap-2">{(byDay.get(selected) ?? []).map(line)}</ul> : <p className="text-sm text-admin-text-hint">Nenhuma tarefa neste dia.</p>}
        </section>
      )}
    </div>
  );
}

function DayCell({
  day,
  tall,
  outside,
  isToday,
  selected,
  tasks,
  now,
  limit,
  onSelect,
  onCreate,
  onEdit,
}: {
  day: string;
  tall: boolean;
  outside: boolean;
  isToday: boolean;
  selected: boolean;
  tasks: TaskRow[];
  now: number | null;
  limit: number;
  onSelect: () => void;
  onCreate: () => void;
  onEdit: (t: TaskRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const extra = tasks.length - limit;
  return (
    <div
      ref={setNodeRef}
      className={`group relative flex flex-col gap-1 border-b border-r border-admin-table-divider p-1.5 ${tall ? "min-h-[420px]" : "min-h-[118px]"} ${outside ? "bg-admin-table/60" : "bg-admin-table"} ${isOver ? "!bg-admin-tip" : ""} ${selected ? "outline outline-2 -outline-offset-2 outline-admin-accent" : ""}`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onSelect}
          aria-label={`${longDay.format(utc(day))}: ${tasks.length} tarefa(s)`}
          className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${isToday ? "bg-admin-primary text-admin-primary-text" : outside ? "text-admin-text-hint" : "text-admin-text-label hover:bg-admin-card"}`}
        >
          {Number(day.slice(8))}
        </button>
        <button type="button" onClick={onCreate} aria-label={`Nova tarefa em ${longDay.format(utc(day))}`} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-admin-text-hint opacity-0 hover:bg-admin-card hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100">
          <FaPlus aria-hidden className="h-2.5 w-2.5" />
        </button>
      </div>
      {tasks.slice(0, limit).map((t) => (
        <Chip key={t.id} task={t} now={now} onEdit={onEdit} />
      ))}
      {extra > 0 && (
        <button type="button" onClick={onSelect} className="rounded px-1.5 text-left text-[11px] font-semibold text-admin-accent hover:underline">
          +{extra} mais
        </button>
      )}
    </div>
  );
}

function Chip({ task, now, onEdit }: { task: TaskRow; now: number | null; onEdit: (t: TaskRow) => void }) {
  const status = taskStatus(task, now);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: status === "done" });
  const TypeIcon = TASK_TYPE_ICON[task.type];
  const tone =
    status === "done"
      ? "bg-admin-deal-won/60 text-admin-deal-won-text line-through"
      : status === "overdue"
        ? "bg-admin-deal-lost text-admin-deal-lost-text"
        : status === "today"
          ? "bg-admin-qual-hot text-admin-qual-hot-text"
          : "bg-admin-deal-progress text-admin-deal-progress-text";
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onEdit(task)}
      title={`${taskTime(task.due_at)} · ${task.title}${task.parent ? ` · ${task.parent.label}` : ""}${task.assignee_name ? ` · ${task.assignee_name}` : ""}`}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 40 } : undefined}
      className={`flex w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-left text-[11px] font-semibold ${tone} ${isDragging ? "shadow-2xl" : ""} ${status === "done" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
    >
      <TypeIcon aria-hidden className="h-2.5 w-2.5 shrink-0 opacity-80" />
      <span className="shrink-0 tabular-nums opacity-80">{taskTime(task.due_at)}</span>
      <span className="truncate">{task.title}</span>
    </button>
  );
}
