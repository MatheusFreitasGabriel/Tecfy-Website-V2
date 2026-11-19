import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { listAdminUsers } from "@/lib/admin/crm/admins";
import { assignOwner, convertLeads, deleteLeads, updateLeads } from "@/lib/admin/crm/leads";
import { BULK_MAX_BYTES, parseBulkLeadAction } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ações na lista de leads (uma ou várias linhas): mudar qualificação/etapa/status, atribuir
 * responsável (`set_owner`, value = uid de um usuário do painel), converter em negociação ou excluir.
 * Corpo: `{ ids, action, value? }` (até 200 ids).
 * Ordem: gate/origem/JSON → sessão de admin → validação → gravação.
 * Resposta: 200 { updated } · 400 invalid_input · 401 unauthorized · 500 internal_error.
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, BULK_MAX_BYTES);
  if (body instanceof Response) return body;

  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = parseBulkLeadAction(body);
  if (!parsed) return Response.json({ error: "invalid_input" }, { status: 400 });

  try {
    let updated: number;
    switch (parsed.action) {
      case "set_qualification":
        updated = await updateLeads(parsed.ids, { qualification: parsed.value });
        break;
      case "set_stage":
        updated = await updateLeads(parsed.ids, { stage: parsed.value });
        break;
      case "set_status":
        updated = await updateLeads(parsed.ids, { status: parsed.value });
        break;
      case "delete":
        updated = await deleteLeads(parsed.ids);
        break;
      case "convert": {
        const profile = await getAdminProfile(session);
        updated = await convertLeads(parsed.ids, { uid: session.uid, name: profile.name ?? profile.email ?? session.uid });
        break;
      }
      case "set_owner": {
        const owner = (await listAdminUsers()).find((a) => a.uid === parsed.value);
        if (!owner) return Response.json({ error: "invalid_input" }, { status: 400 });
        const profile = await getAdminProfile(session);
        updated = await assignOwner(parsed.ids, { uid: owner.uid, name: owner.name }, { uid: session.uid, name: profile.name ?? profile.email ?? session.uid });
        break;
      }
    }
    return Response.json({ updated });
  } catch (error) {
    console.error("crm bulk leads error", parsed.action, error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
