import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from "@/lib/admin/crm/templatesStore";
import { TEMPLATES_MAX_BYTES, parseTemplateAction } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Modelos de mensagem personalizados: `{ action: "create" | "update" | "delete", id?, data? }`.
 * Modelos padrão (ids "builtin-…") vivem no código e não passam por aqui.
 * Resposta: 200 { id?, templates } (lista atualizada, a tela troca sem recarregar) · 400 · 401 · 404 · 500.
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, TEMPLATES_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = parseTemplateAction(body);
  if (!parsed || ("id" in parsed && parsed.id.startsWith("builtin-"))) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    if (parsed.action === "create") {
      const profile = await getAdminProfile(session);
      const id = await createTemplate(parsed.data, { uid: session.uid, name: profile.name ?? profile.email ?? session.uid });
      invalidateCrm(CRM_TAGS.templates);
      return Response.json({ id, templates: await listTemplates() });
    }
    if (parsed.action === "update") {
      const ok = await updateTemplate(parsed.id, parsed.data);
      if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
      invalidateCrm(CRM_TAGS.templates);
      return Response.json({ id: parsed.id, templates: await listTemplates() });
    }
    await deleteTemplate(parsed.id);
    invalidateCrm(CRM_TAGS.templates);
    return Response.json({ ok: true, templates: await listTemplates() });
  } catch (error) {
    console.error("crm templates error", parsed.action, error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
