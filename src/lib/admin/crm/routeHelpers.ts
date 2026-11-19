import "server-only";
import { hasValidAdminGate } from "@/lib/admin/gate";
import { getAdminProfile, getAdminSession, type AdminSession } from "@/lib/admin/session";
import type { Actor } from "./leads";

/** Respostas padrão das rotas do CRM. */
export const crmResponses = {
  invalid: () => Response.json({ error: "invalid_input" }, { status: 400 }),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
  notFound: () => Response.json({ error: "not_found" }, { status: 404 }),
  internal: () => Response.json({ error: "internal_error" }, { status: 500 }),
};

export const isDocId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** Quem está fazendo a ação (nome do perfil, para timelines e autoria). */
export async function actorOf(session: AdminSession): Promise<Actor> {
  const profile = await getAdminProfile(session);
  return { uid: session.uid, name: profile.name ?? profile.email ?? session.uid };
}

/**
 * GET de leitura do painel: gate do proxy + sessão. (GET da mesma origem não manda header Origin,
 * então não usa guardAdminRequest; o cookie SameSite=Strict já impede uso cruzado.)
 */
export async function guardRead(request: Request): Promise<AdminSession | Response> {
  if (!(await hasValidAdminGate(request.headers))) return new Response(null, { status: 404 });
  const session = await getAdminSession();
  return session ?? crmResponses.unauthorized();
}
