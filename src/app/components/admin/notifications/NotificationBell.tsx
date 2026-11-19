"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FaBell, FaCheckDouble, FaRotateRight, FaUserPlus } from "react-icons/fa6";
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

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${basePath}/api/notifications`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { items: NotificationItem[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
      setNow(Date.now());
    }
  }, [basePath]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

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
            load();
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
        </button>
      </Tooltip>

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
