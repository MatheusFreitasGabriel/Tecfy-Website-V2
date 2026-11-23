"use client";

import { useMemo, useState } from "react";
import { FaChevronDown, FaMugHot, FaPlus } from "react-icons/fa6";
import type { AdminUserOption, TaskRow } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import { brazilDate } from "../deals/dealVisuals";
import { TaskLine, type QuickReschedule } from "./taskVisuals";

interface MyDayProps {
  tasks: TaskRow[];
  admins: AdminUserOption[];
  currentUid: string;
  now: number | null;
  basePath: string;
  busyIds: Set<string>;
  onCreate: () => void;
  onToggle: (task: TaskRow, done: boolean) => void;
  onEdit: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
  onReschedule: (task: TaskRow, how: QuickReschedule) => void;
}

const DAY = 86_400_000;
const byDue = (a: TaskRow, b: TaskRow) => a.due_at.localeCompare(b.due_at);

/** Meu dia: o que a pessoa tem para fazer agora (atrasadas, hoje, amanhã, próximos 7 dias). */
export default function MyDay({ tasks, admins, currentUid, now, basePath, busyIds, onCreate, onToggle, onEdit, onDelete, onReschedule }: MyDayProps) {
  const [person, setPerson] = useState(currentUid);
  const [showDone, setShowDone] = useState(false);

  const groups = useMemo(() => {
    const mine = tasks.filter((t) => t.assignee_uid === person);
    if (now === null) return null;
    const today = brazilDate(now);
    const tomorrow = brazilDate(now + DAY);
    const week = brazilDate(now + 7 * DAY);
    const open = mine.filter((t) => !t.done_at).sort(byDue);
    const day = (t: TaskRow) => brazilDate(Date.parse(t.due_at));
    return {
      overdue: open.filter((t) => Date.parse(t.due_at) < now),
      today: open.filter((t) => Date.parse(t.due_at) >= now && day(t) === today),
      tomorrow: open.filter((t) => day(t) === tomorrow),
      week: open.filter((t) => day(t) > tomorrow && day(t) <= week),
      doneToday: mine.filter((t) => t.done_at && brazilDate(Date.parse(t.done_at)) === today).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")),
    };
  }, [tasks, person, now]);

  const personName = person === currentUid ? "Você" : (admins.find((a) => a.uid === person)?.name ?? "Pessoa");
  const line = (t: TaskRow, showDay = false) => (
    <TaskLine key={t.id} task={t} now={now} basePath={basePath} showDay={showDay} busy={busyIds.has(t.id)} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onReschedule={onReschedule} />
  );

  if (!groups) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Carregando...</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-admin-card motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  const planned = groups.today.length + groups.overdue.length + groups.doneToday.length;
  const progress = planned ? Math.round((groups.doneToday.length / planned) * 100) : 0;
  const nothing = !groups.overdue.length && !groups.today.length && !groups.tomorrow.length && !groups.week.length;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        {nothing && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-background-kpi px-6 py-14 text-center outline outline-1 -outline-offset-1 outline-admin-card-border">
            <FaMugHot aria-hidden className="h-7 w-7 text-admin-accent" />
            <p className="text-base font-semibold text-text-primary">{person === currentUid ? "Nada pendente por aqui." : `${personName} não tem tarefas pendentes.`}</p>
            <p className="text-sm text-admin-text-description">Sem atrasadas e nada para os próximos 7 dias.</p>
            <Button icon={FaPlus} onClick={onCreate} className="mt-2">
              Nova tarefa
            </Button>
          </div>
        )}
        <Section title="Atrasadas" tone="danger" items={groups.overdue} render={(t) => line(t, true)} />
        <Section title="Hoje" items={groups.today} render={(t) => line(t)} empty={!nothing ? "Nada mais para hoje." : undefined} />
        <Section title="Amanhã" items={groups.tomorrow} render={(t) => line(t)} />
        <Section title="Próximos 7 dias" items={groups.week} render={(t) => line(t, true)} />
        {groups.doneToday.length > 0 && (
          <section className="flex flex-col gap-2">
            <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="flex items-center gap-2 self-start text-xs font-semibold uppercase tracking-wide text-admin-text-description hover:text-text-primary">
              <FaChevronDown aria-hidden className={`h-2.5 w-2.5 transition-transform ${showDone ? "" : "-rotate-90"}`} />
              Concluídas hoje · {groups.doneToday.length}
            </button>
            {showDone && <ul className="flex flex-col gap-2">{groups.doneToday.map((t) => line(t))}</ul>}
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-admin-text-description">Dia de</span>
          <span className="relative">
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="h-11 w-full cursor-pointer appearance-none rounded-lg bg-background-kpi pl-3.5 pr-10 text-[13px] font-medium text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border focus:outline-2 focus:outline-admin-primary [color-scheme:dark]"
            >
              {admins.map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.uid === currentUid ? `${a.name} (você)` : a.name}
                </option>
              ))}
            </select>
            <FaChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-description" />
          </span>
        </label>
        <div className="flex flex-col gap-3 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border">
          <p className="text-sm font-semibold text-text-primary">Progresso de hoje</p>
          <div className="flex items-end justify-between">
            <span className="text-[28px] font-semibold leading-8 text-text-primary">{progress}%</span>
            <span className="text-xs text-admin-text-description">
              {groups.doneToday.length} de {planned} feitas
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-admin-badge" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso de hoje">
            <div className="h-full rounded-full bg-admin-success transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <dl className="grid grid-cols-2 gap-3 pt-1 text-xs">
            <div>
              <dt className="text-admin-text-hint">Atrasadas</dt>
              <dd className={`text-lg font-semibold ${groups.overdue.length ? "text-admin-danger" : "text-text-primary"}`}>{groups.overdue.length}</dd>
            </div>
            <div>
              <dt className="text-admin-text-hint">Para hoje</dt>
              <dd className="text-lg font-semibold text-text-primary">{groups.today.length}</dd>
            </div>
            <div>
              <dt className="text-admin-text-hint">Amanhã</dt>
              <dd className="text-lg font-semibold text-text-primary">{groups.tomorrow.length}</dd>
            </div>
            <div>
              <dt className="text-admin-text-hint">Próx. 7 dias</dt>
              <dd className="text-lg font-semibold text-text-primary">{groups.week.length}</dd>
            </div>
          </dl>
        </div>
        <Button icon={FaPlus} onClick={onCreate} block>
          Nova tarefa
        </Button>
      </aside>
    </div>
  );
}

function Section({ title, tone, items, render, empty }: { title: string; tone?: "danger"; items: TaskRow[]; render: (t: TaskRow) => React.ReactNode; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className={`text-xs font-semibold uppercase tracking-wide ${tone === "danger" ? "text-admin-danger" : "text-admin-text-description"}`}>
        {title} · {items.length}
      </h2>
      {items.length ? <ul className="flex flex-col gap-2">{items.map(render)}</ul> : <p className="rounded-xl bg-admin-drawer-card px-4 py-3 text-sm text-admin-text-hint">{empty}</p>}
    </section>
  );
}
