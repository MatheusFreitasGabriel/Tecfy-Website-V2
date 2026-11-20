import { hasValidAdminGate } from "@/lib/admin/gate";
import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { listNotifications, markNotificationsRead } from "@/lib/admin/notifications";
import { getCachedTasks } from "@/lib/admin/crm/cache";

const brazilDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Resumo das tarefas ABERTAS do usuário para o sino: atrasadas, de hoje e lembretes das próximas 24 h.
 * Vem do cache das tarefas (não lê o Firestore a cada consulta do sino).
 */
async function taskSummary(uid: string) {
  const now = Date.now();
  const today = brazilDay.format(new Date(now));
  const { tasks } = await getCachedTasks();
  const mine = tasks.filter((t) => !t.done_at && t.assignee_uid === uid);
  let overdue = 0;
  let dueToday = 0;
  const reminders: { id: string; title: string; due_at: string; remind_at: string; parent_label: string | null }[] = [];
  for (const t of mine) {
    const due = Date.parse(t.due_at);
    if (due < now) overdue++;
    else if (brazilDay.format(new Date(due)) === today) dueToday++;
    if (t.remind_minutes !== null && due > now - 5 * 60_000 && due < now + 26 * 3_600_000) {
      reminders.push({ id: t.id, title: t.title, due_at: t.due_at, remind_at: new Date(due - t.remind_minutes * 60_000).toISOString(), parent_label: t.parent?.label ?? null });
    }
  }
  return { overdue, today: dueToday, reminders: reminders.sort((a, b) => a.remind_at.localeCompare(b.remind_at)).slice(0, 50) };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/**
 * Notificações do usuário logado: `{ items, unread }`. Com `?since=<ISO>`, só as novas.
 * Só leitura: gate do proxy + sessão (GET da mesma origem não manda Origin).
 */
export async function GET(request: Request) {
  if (!(await hasValidAdminGate(request.headers))) return new Response(null, { status: 404 });
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    // ?since=<ISO> → só as novas desde a última consulta (o sino usa isso no polling).
    const sinceParam = new URL(request.url).searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : undefined;
    if (since && Number.isNaN(since.getTime())) return Response.json({ error: "invalid_input" }, { status: 400 });
    const [list, tasks] = await Promise.all([listNotifications(session.uid, since), taskSummary(session.uid).catch(() => null)]);
    return Response.json({ ...list, tasks });
  } catch (error) {
    console.error("notifications list error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

/** Marca como lidas: `{ ids: string[] }` ou `{ all: true }`. */
export async function POST(request: Request) {
  const body = await readGuardedJson(request);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  let target: string[] | "all";
  if (body.all === true) target = "all";
  else if (Array.isArray(body.ids) && body.ids.length <= 50 && body.ids.every(isId)) target = body.ids as string[];
  else return Response.json({ error: "invalid_input" }, { status: 400 });

  try {
    await markNotificationsRead(session.uid, target);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("notifications read error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
