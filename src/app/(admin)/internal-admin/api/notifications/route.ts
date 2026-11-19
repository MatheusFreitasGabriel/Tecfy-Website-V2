import { hasValidAdminGate } from "@/lib/admin/gate";
import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { listNotifications, markNotificationsRead } from "@/lib/admin/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/**
 * Notificações do usuário logado: `{ items, unread }`.
 * Só leitura: gate do proxy + sessão (GET da mesma origem não manda Origin).
 */
export async function GET(request: Request) {
  if (!(await hasValidAdminGate(request.headers))) return new Response(null, { status: 404 });
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await listNotifications(session.uid));
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
