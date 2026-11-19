import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { AlreadyLinkedError, MissingReferenceError, linkLeadRelations } from "@/lib/admin/crm/leads";
import { CREATE_LEAD_MAX_BYTES, parseLinkLeadPayload } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Vincula contato e/ou empresa a um lead que ainda não tem. Corpo: `{ contact?, company? }`
 * (mesmo formato do "Criar lead": none / existing { id } / new { draft }). Não troca vínculos existentes.
 * Resposta: 200 { contact, company } · 400 invalid_input · 401 · 409 already_linked · 500.
 */
export async function POST(request: Request, { params }: Context) {
  const body = await readGuardedJson(request, CREATE_LEAD_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return Response.json({ error: "invalid_input" }, { status: 400 });
  const parsed = parseLinkLeadPayload(body);
  if (!parsed) return Response.json({ error: "invalid_input" }, { status: 400 });

  try {
    const profile = await getAdminProfile(session);
    const result = await linkLeadRelations(id, parsed, { uid: session.uid, name: profile.name ?? profile.email ?? session.uid });
    invalidateCrm(
      CRM_TAGS.leads,
      ...(parsed.contact.mode === "new" ? [CRM_TAGS.contacts] : []),
      ...(parsed.company.mode === "new" ? [CRM_TAGS.companies] : []),
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof AlreadyLinkedError) return Response.json({ error: "already_linked" }, { status: 409 });
    if (error instanceof MissingReferenceError) return Response.json({ error: "invalid_input" }, { status: 400 });
    console.error("crm link lead error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
