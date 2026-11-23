"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaCalendarDays, FaClock, FaListUl, FaPlus, FaSun, FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import type { AdminUserOption, TaskRow } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import { ReloadButton } from "../shared/ListControls";
import TaskModal from "../deals/TaskModal";
import { brazilDate, useNow } from "../deals/dealVisuals";
import MyDay from "./MyDay";
import TasksCalendar from "./TasksCalendar";
import TasksList, { type TaskBulkAction } from "./TasksList";
import { dueOn, shiftDue, type QuickReschedule } from "./taskVisuals";

type View = "day" | "list" | "calendar";
const VIEW_PARAM: Record<View, string | null> = { day: null, list: "lista", calendar: "calendario" };

interface TasksViewProps {
  tasks: TaskRow[];
  truncated: boolean;
  admins: AdminUserOption[];
  basePath: string;
  currentUid: string;
  initialView: View;
}

type ModalState = null | { kind: "create"; date: string | null } | { kind: "edit"; task: TaskRow };

const DAY = 86_400_000;
const integer = new Intl.NumberFormat("pt-BR");

async function api<T>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" });
  return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as T & { error?: string } };
}
const failText = (status: number) =>
  status === 401 ? "Sua sessão expirou. Entre de novo no painel." : status === 404 ? "Esta tarefa não existe mais. Atualize a lista." : "Não foi possível salvar. Tente de novo.";

/** Tela de Tarefas: Meu dia, Lista (todas do time) e Calendário. Ações otimistas, com volta se falhar. */
export default function TasksView({ tasks, truncated, admins, basePath, currentUid, initialView }: TasksViewProps) {
  const router = useRouter();
  const now = useNow();
  const [view, setView] = useState<View>(initialView);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloading, startReload] = useTransition();

  // Camada local sobre a lista do servidor.
  const [base, setBase] = useState(tasks);
  const [added, setAdded] = useState<TaskRow[]>([]);
  const [patches, setPatches] = useState<Record<string, Partial<TaskRow>>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  if (base !== tasks) {
    setBase(tasks);
    setAdded([]);
    setPatches({});
    setRemoved(new Set());
  }
  const rows = useMemo(() => {
    const ids = new Set(tasks.map((t) => t.id));
    return [...added.filter((t) => !ids.has(t.id)), ...tasks].filter((t) => !removed.has(t.id)).map((t) => (patches[t.id] ? { ...t, ...patches[t.id] } : t));
  }, [tasks, added, patches, removed]);

  const flash = (text: string, tone: "ok" | "error" = "ok") => setNotice({ text, tone });
  const patch = (id: string, p: Partial<TaskRow> | null) =>
    setPatches((all) => {
      const next = { ...all };
      if (p === null) delete next[id];
      else next[id] = { ...next[id], ...p };
      return next;
    });
  const busy = (id: string, on: boolean) =>
    setBusyIds((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const upsert = (task: TaskRow) => {
    setAdded((list) => [task, ...list.filter((t) => t.id !== task.id)]);
    patch(task.id, task);
  };
  const chooseView = (v: View) => {
    setView(v);
    const url = new URL(window.location.href);
    if (VIEW_PARAM[v]) url.searchParams.set("visao", VIEW_PARAM[v]!);
    else url.searchParams.delete("visao");
    window.history.replaceState(window.history.state, "", url);
  };

  const toggle = async (task: TaskRow, done: boolean) => {
    const before = patches[task.id];
    busy(task.id, true);
    patch(task.id, { done_at: done ? new Date().toISOString() : null });
    try {
      const { ok, status, data } = await api<{ task: TaskRow; next: TaskRow | null }>(`${basePath}/api/crm/tasks/${task.id}`, "PATCH", { done });
      if (!ok) throw new Error(failText(status));
      upsert(data.task);
      if (data.next) {
        upsert(data.next);
        flash(`Concluída. Próxima “${data.next.title}” agendada.`);
      }
    } catch (error) {
      patch(task.id, before ?? null);
      flash(error instanceof Error ? error.message : "Não foi possível salvar.", "error");
    } finally {
      busy(task.id, false);
    }
  };

  const reschedule = async (task: TaskRow, how: QuickReschedule) => {
    const before = patches[task.id];
    const due = how.kind === "shift" ? shiftDue(task, how.days) : dueOn(task, how.date);
    busy(task.id, true);
    patch(task.id, { due_at: due });
    try {
      const { ok, status } = await api(`${basePath}/api/crm/tasks/bulk`, "POST", { ids: [task.id], action: how.kind, value: how.kind === "shift" ? how.days : how.date });
      if (!ok) throw new Error(failText(status));
    } catch (error) {
      patch(task.id, before ?? null);
      flash(error instanceof Error ? error.message : "Não foi possível reagendar.", "error");
    } finally {
      busy(task.id, false);
    }
  };

  const remove = async (task: TaskRow) => {
    setRemoved((s) => new Set(s).add(task.id));
    try {
      const { ok, status } = await api(`${basePath}/api/crm/tasks/${task.id}`, "DELETE", {});
      if (!ok && status !== 404) throw new Error(failText(status));
      flash(`Tarefa “${task.title}” excluída.`);
    } catch (error) {
      setRemoved((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
      flash(error instanceof Error ? error.message : "Não foi possível excluir.", "error");
    }
  };

  const bulk = async (action: TaskBulkAction, ids: string[], value?: string | number): Promise<boolean> => {
    if (!ids.length || bulkBusy) return false;
    setBulkBusy(true);
    try {
      const { ok, status, data } = await api<{ ids: string[] }>(`${basePath}/api/crm/tasks/bulk`, "POST", { ids, action, value });
      if (!ok) throw new Error(failText(status));
      const changed = new Set(data.ids);
      const stamp = new Date().toISOString();
      const byId = new Map(rows.map((t) => [t.id, t]));
      if (action === "delete") setRemoved((s) => new Set([...s, ...changed]));
      else
        setPatches((all) => {
          const next = { ...all };
          for (const id of changed) {
            const t = byId.get(id);
            if (!t) continue;
            const change: Partial<TaskRow> =
              action === "complete"
                ? { done_at: stamp }
                : action === "reopen"
                  ? { done_at: null }
                  : action === "assign"
                    ? { assignee_uid: String(value), assignee_name: admins.find((a) => a.uid === value)?.name ?? null }
                    : action === "shift"
                      ? { due_at: shiftDue(t, Number(value)) }
                      : { due_at: dueOn(t, String(value)) };
            next[id] = { ...next[id], ...change };
          }
          return next;
        });
      // Recorrentes concluídas em massa criam as próximas no servidor: traz a lista nova.
      if (action === "complete" && [...changed].some((id) => byId.get(id)?.recurrence)) startReload(() => router.refresh());
      flash(changed.size ? `${changed.size} tarefa(s) atualizada(s).` : "Nada para mudar: as selecionadas já estavam assim.");
      return true;
    } catch (error) {
      flash(error instanceof Error ? error.message : "Não foi possível aplicar.", "error");
      return false;
    } finally {
      setBulkBusy(false);
    }
  };

  // Indicadores (do usuário logado).
  const kpi = useMemo(() => {
    if (now === null) return null;
    const today = brazilDate(now);
    const week = brazilDate(now + 7 * DAY);
    const mine = rows.filter((t) => !t.done_at && t.assignee_uid === currentUid);
    return {
      overdue: mine.filter((t) => Date.parse(t.due_at) < now).length,
      today: mine.filter((t) => Date.parse(t.due_at) >= now && brazilDate(Date.parse(t.due_at)) === today).length,
      week: mine.filter((t) => {
        const d = brazilDate(Date.parse(t.due_at));
        return d > today && d <= week;
      }).length,
      team: rows.filter((t) => !t.done_at).length,
    };
  }, [rows, now, currentUid]);

  const common = { now, basePath, onToggle: toggle, onEdit: (task: TaskRow) => setModal({ kind: "edit", task }), onDelete: remove, onReschedule: reschedule };

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-center gap-4">
            <h1 className="text-[32px] font-semibold leading-[38px] text-text-primary">Tarefas</h1>
            <span className="flex h-7 min-w-[38px] items-center justify-center rounded-lg bg-admin-badge px-2.5 text-sm font-semibold text-admin-badge-text" aria-label={`${kpi?.team ?? 0} tarefas abertas no time`}>
              {integer.format(kpi?.team ?? rows.filter((t) => !t.done_at).length)}
            </span>
          </div>
          <p className="text-sm font-medium leading-5 text-admin-text-description">Follow-ups, ligações e reuniões do time: de negociações, leads, contatos, empresas ou avulsas.</p>
        </div>
        <div className="flex shrink-0 gap-3">
          <ReloadButton reloading={reloading} onClick={() => startReload(() => router.refresh())} />
          <Button icon={FaPlus} onClick={() => setModal({ kind: "create", date: null })}>
            Nova tarefa
          </Button>
        </div>
      </header>

      <div role="group" aria-label="Indicadores" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi icon={FaTriangleExclamation} label="Suas atrasadas" value={kpi?.overdue} danger={Boolean(kpi?.overdue)} onClick={() => chooseView("day")} />
        <Kpi icon={FaSun} label="Suas para hoje" value={kpi?.today} onClick={() => chooseView("day")} />
        <Kpi icon={FaClock} label="Seus próximos 7 dias" value={kpi?.week} onClick={() => chooseView("day")} />
        <Kpi icon={FaListUl} label="Abertas no time" value={kpi?.team} onClick={() => chooseView("list")} />
      </div>

      <div role="tablist" aria-label="Visões das tarefas" className="flex gap-1 border-b border-admin-divider">
        {(
          [
            ["day", "Meu dia", FaSun],
            ["list", "Lista", FaListUl],
            ["calendar", "Calendário", FaCalendarDays],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => chooseView(value)}
            className="-mb-px inline-flex h-11 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-admin-text-description hover:text-text-primary aria-selected:border-admin-primary aria-selected:text-text-primary"
          >
            <Icon aria-hidden className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {truncated && <p className="rounded-lg bg-admin-tip px-4 py-3 text-sm text-admin-tip-text">Há mais tarefas abertas do que esta tela carrega de uma vez. Use os filtros para encontrar as mais antigas.</p>}

      <div role="tabpanel">
        {view === "day" && <MyDay tasks={rows} admins={admins} currentUid={currentUid} busyIds={busyIds} onCreate={() => setModal({ kind: "create", date: null })} {...common} />}
        {view === "list" && <TasksList tasks={rows} admins={admins} currentUid={currentUid} busy={bulkBusy} onBulk={bulk} {...common} />}
        {view === "calendar" && <TasksCalendar tasks={rows} admins={admins} currentUid={currentUid} busyIds={busyIds} onCreateOn={(date) => setModal({ kind: "create", date })} {...common} />}
      </div>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`fixed bottom-6 right-6 z-40 flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl outline outline-1 -outline-offset-1 ${
            notice.tone === "error" ? "bg-admin-deal-lost text-admin-deal-lost-text outline-admin-danger/40" : "bg-admin-card text-text-primary outline-admin-card-border"
          }`}
        >
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="text-admin-text-hint hover:text-text-primary">
            <FaXmark aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {modal && (
        <TaskModal
          basePath={basePath}
          deal={null}
          admins={admins}
          currentUid={currentUid}
          task={modal.kind === "edit" ? modal.task : null}
          defaultDate={modal.kind === "create" ? modal.date : null}
          onClose={() => setModal(null)}
          onCreated={(task) => {
            upsert(task);
            setModal(null);
            flash(modal.kind === "edit" ? `Tarefa “${task.title}” salva.` : task.assignee_uid !== currentUid ? `Tarefa criada para ${task.assignee_name}.` : `Tarefa “${task.title}” criada.`);
          }}
        />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, danger, onClick }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string; value: number | undefined; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`border p-1.5 text-left transition-colors ${danger ? "border-admin-danger/40 hover:border-admin-danger" : "border-border-primary hover:border-border-secondary"}`}>
      <span className="flex h-full flex-col gap-3 bg-background-secondary p-5">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
          <Icon aria-hidden className={`h-3 w-3 ${danger ? "text-admin-danger" : "text-white/60"}`} />
          {label}
        </span>
        <span className={`text-[30px] font-medium leading-8 tracking-tight ${danger ? "text-admin-danger" : "text-text-primary"}`}>{value === undefined ? "—" : integer.format(value)}</span>
      </span>
    </button>
  );
}
