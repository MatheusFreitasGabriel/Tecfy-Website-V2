"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FaBell, FaCheckDouble, FaClock, FaListCheck, FaRotateRight, FaUserPlus, FaXmark } from "react-icons/fa6";
import Button from "../form/Button";
import Drawer from "../form/Drawer";
import Tooltip from "../form/Tooltip";

interface NotificationItem {
  id: string;
  type: "lead_created" | "lead_returned";
  title: string;
  body: string;
  lead_id: string | null;
  created_at: string | null;
  read: boolean;
}

interface TaskReminder {
  id: string;
  title: string;
  due_at: string;
  remind_at: string;
  parent_label: string | null;
}
interface TaskSummary {
  overdue: number;
  today: number;
  reminders: TaskReminder[];
}

const FIRED_KEY = "tecfy_fired_reminders";
/** Lembretes já disparados nesta sessão (não repete ao recarregar a página). */
function firedSet(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(FIRED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markFired(key: string) {
  try {
    const set = firedSet();
    set.add(key);
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-200)));
  } catch {
    /* sem sessionStorage: pode repetir, sem problema */
  }
}
const hourMinute = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** De quanto em quanto tempo o sino confere se chegou algo novo (também confere ao voltar para a aba). */
const POLL_MS = 60_000;

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Sino de notificações do painel (fica na sidebar, aparece em todas as telas).
 * Por enquanto: leads novos vindos do site. Clicar abre o lead na tela de Leads.
 */
export default function NotificationBell({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const clicks = useRef(0);
  const [tasks, setTasks] = useState<TaskSummary | null>(null);
  const [alerts, setAlerts] = useState<TaskReminder[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  /** created_at da notificação mais nova que já temos (base da consulta incremental). */
  const latest = useRef<string | null>(null);
  const inflight = useRef(false);

  /**
   * Carga completa (1ª vez e ao abrir a gaveta): últimas 50 + contagem de não lidas.
   * Carga incremental (a cada minuto): só o que chegou depois da mais nova — quase sempre vazio.
   */
  const load = useCallback(
    async (mode: "full" | "since") => {
      if (inflight.current) return;
      if (mode === "since" && !latest.current) mode = "full";
      inflight.current = true;
      try {
        const query = mode === "since" ? `?since=${encodeURIComponent(latest.current!)}` : "";
        const response = await fetch(`${basePath}/api/notifications${query}`, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { items: NotificationItem[]; unread: number; tasks: TaskSummary | null };
        if (data.tasks) setTasks(data.tasks);
        if (mode === "full") {
          setItems(data.items);
          setUnread(data.unread);
        } else if (data.items.length) {
          setItems((list) => {
            const known = new Set(list.map((n) => n.id));
            return [...data.items.filter((n) => !known.has(n.id)), ...list].slice(0, 50);
          });
          setUnread((count) => count + data.unread);
        }
        if (data.items[0]?.created_at && (!latest.current || data.items[0].created_at > latest.current)) {
          latest.current = data.items[0].created_at;
        }
        setError(false);
      } catch {
        setError(true);
      } finally {
        inflight.current = false;
        setLoaded(true);
        setNow(Date.now());
      }
    },
    [basePath],
  );

  useEffect(() => {
    const first = setTimeout(() => load("full"), 0);
    // Só consulta com a aba visível; ao voltar para a aba, confere na hora.
    const timer = setInterval(() => document.visibilityState === "visible" && load("since"), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load("since");
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Permissão de notificação do navegador (lida no cliente).
  useEffect(() => {
    const t = setTimeout(() => setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission), 0);
    return () => clearTimeout(t);
  }, []);

  // Lembretes: agenda cada um para a hora certa (some se a tarefa for concluída/alterada: a lista muda).
  useEffect(() => {
    if (!tasks?.reminders.length) return;
    const fired = firedSet();
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const r of tasks.reminders) {
      const key = `${r.id}@${r.remind_at}`;
      if (fired.has(key)) continue;
      const wait = Date.parse(r.remind_at) - Date.now();
      if (wait < -2 * 60_000 || wait > 2_000_000_000) continue; // perdido há mais de 2 min ou longe demais
      timers.push(
        setTimeout(() => {
          markFired(key);
          setAlerts((list) => (list.some((a) => a.id === r.id) ? list : [...list, r]));
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(`Tarefa às ${hourMinute.format(new Date(r.due_at))}`, { body: [r.title, r.parent_label].filter(Boolean).join(" · "), tag: key });
            } catch {
              /* alguns navegadores só permitem via service worker */
            }
          }
        }, Math.max(0, wait)),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [tasks]);

  const askPermission = async () => {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  };

  const markRead = async (payload: { ids: string[] } | { all: true }) => {
    // Otimista: atualiza já; o servidor confirma em segundo plano.
    const ids = "ids" in payload ? new Set(payload.ids) : null;
    setItems((list) => list.map((n) => (ids === null || ids.has(n.id) ? { ...n, read: true } : n)));
    setUnread((count) => (ids === null ? 0 : Math.max(0, count - [...ids].filter((id) => items.some((n) => n.id === id && !n.read)).length)));
    try {
      await fetch(`${basePath}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
    } catch {
      // Se falhar, a próxima atualização traz o estado real.
    }
  };

  const openItem = (item: NotificationItem) => {
    if (!item.read) markRead({ ids: [item.id] });
    setOpen(false);
    // `t` torna cada clique único (reabrir o mesmo lead depois de fechar o painel).
    clicks.current += 1;
    if (item.lead_id) router.push(`${basePath}/leads?lead=${encodeURIComponent(item.lead_id)}&t=${clicks.current}`);
  };

  const label = unread > 0 ? `Notificações: ${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Notificações";

  return (
    <>
      <Tooltip label={label}>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            load("full");
          }}
          aria-label={label}
          className="relative flex h-[43px] w-[43px] shrink-0 items-center justify-center rounded-full border border-border-input bg-background-surface text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-admin-accent"
        >
          <FaBell aria-hidden className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1 text-[11px] font-semibold text-text-primary">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
          {unread === 0 && tasks && tasks.overdue > 0 && <span aria-hidden className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-admin-danger ring-2 ring-background-surface" />}
        </button>
      </Tooltip>

      {alerts.length > 0 && (
        <div className="fixed bottom-6 left-6 z-50 flex w-[340px] max-w-[calc(100vw-48px)] flex-col gap-2" role="status" aria-live="assertive">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-xl bg-admin-card px-4 py-3 shadow-2xl outline outline-1 -outline-offset-1 outline-admin-accent/50">
              <FaClock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-admin-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-admin-accent">Lembrete · {hourMinute.format(new Date(a.due_at))}</p>
                <p className="truncate text-sm font-semibold text-text-primary">{a.title}</p>
                {a.parent_label && <p className="truncate text-xs text-admin-text-description">{a.parent_label}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setAlerts((list) => list.filter((x) => x.id !== a.id));
                    router.push(`${basePath}/tarefas`);
                  }}
                  className="mt-1 text-xs font-semibold text-admin-accent hover:underline"
                >
                  Ver tarefa
                </button>
              </div>
              <button type="button" onClick={() => setAlerts((list) => list.filter((x) => x.id !== a.id))} aria-label="Dispensar lembrete" className="text-admin-text-hint hover:text-text-primary">
                <FaXmark aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Drawer
          eyebrow="Painel"
          title="Notificações"
          onClose={() => setOpen(false)}
          widthClass="max-w-[440px]"
          footer={
            <div className="flex justify-between gap-3">
              <Button variant="ghost" icon={FaCheckDouble} onClick={() => markRead({ all: true })} disabled={unread === 0}>
                Marcar todas como lidas
              </Button>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </div>
          }
        >
          {tasks && (
            <div className="-mx-1 mb-4 flex flex-col gap-2 rounded-xl bg-admin-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <FaListCheck aria-hidden className="h-3.5 w-3.5 text-admin-accent" /> Suas tarefas
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(`${basePath}/tarefas`);
                  }}
                  className="text-xs font-semibold text-admin-accent hover:underline"
                >
                  Abrir tarefas
                </button>
              </div>
              <p className="text-[13px] text-admin-text-description">
                <span className={tasks.overdue ? "font-semibold text-admin-danger" : ""}>{tasks.overdue} atrasada(s)</span> · {tasks.today} para hoje
              </p>
              {permission === "default" && (
                <button type="button" onClick={askPermission} className="self-start text-xs font-semibold text-admin-accent hover:underline">
                  Ativar alertas do navegador para os lembretes
                </button>
              )}
            </div>
          )}
          {!loaded ? (
            <p className="text-sm text-admin-text-hint">Carregando...</p>
          ) : error && items.length === 0 ? (
            <p className="text-sm text-admin-text-hint">Não foi possível carregar as notificações.</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FaBell aria-hidden className="h-6 w-6 text-admin-text-hint" />
              <p className="text-sm text-admin-text-description">Nada por aqui ainda. Leads novos do site (e quem voltar a entrar em contato) aparecem aqui.</p>
            </div>
          ) : (
            <ul className="-mx-3 flex flex-col gap-1" aria-label="Lista de notificações">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-admin-card focus-visible:outline-2 focus-visible:outline-admin-accent ${
                      item.read ? "" : "bg-admin-tip/40"
                    }`}
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-badge">
                      {item.type === "lead_returned" ? (
                        <FaRotateRight aria-hidden className="h-3.5 w-3.5 text-admin-qual-hot-text" />
                      ) : (
                        <FaUserPlus aria-hidden className="h-3.5 w-3.5 text-admin-tip-title" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${item.read ? "font-medium text-admin-text-label" : "font-semibold text-text-primary"}`}>
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-admin-text-hint">{timeAgo(item.created_at, now)}</span>
                      </span>
                      <span className="truncate text-xs text-admin-text-description">{item.body}</span>
                    </span>
                    {!item.read && <span aria-label="Não lida" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-admin-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Drawer>
      )}
    </>
  );
}
