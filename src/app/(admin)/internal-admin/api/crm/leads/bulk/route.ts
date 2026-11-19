import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, getCachedAdmins, invalidateCrm } from "@/lib/admin/crm/cache";
import { assignOwner, convertLeads, deleteLeads, updateLeads } from "@/lib/admin/crm/leads";
import { BULK_MAX_BYTES, parseBulkLeadAction } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ações na lista de leads (uma ou várias linhas): mudar qualificação/etapa/status, atribuir
 * responsável (`set_owner`, value = uid de um usuário do painel), converter em negociação ou excluir.
 * Corpo: `{ ids, action, value? }` (até 200 ids).
 * Ordem: gate/origem/JSON → sessão de admin → validação → gravação (transação).
 * Resposta: 200 { updated, ids, deals?, owner? } — `ids` = os realmente afetados (a tela aplica só neles).
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, BULK_MAX_BYTES);
  if (body instanceof Response) return body;

  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = parseBulkLeadAction(body);
  if (!parsed) return Response.json({ error: "invalid_input" }, { status: 400 });

  const actorOf = async () => {
    const profile = await getAdminProfile(session);
    return { uid: session.uid, name: profile.name ?? profile.email ?? session.uid };
  };

  try {
    let response: Record<string, unknown>;
    switch (parsed.action) {
      case "set_qualification":
      case "set_stage":
      case "set_status": {
        const field = parsed.action.slice(4) as "qualification" | "stage" | "status";
        const ids = await updateLeads(parsed.ids, { [field]: parsed.value });
        response = { updated: ids.length, ids };
        break;
      }
      case "delete": {
        const ids = await deleteLeads(parsed.ids);
        response = { updated: ids.length, ids };
        break;
      }
      case "convert": {
        const deals = await convertLeads(parsed.ids, await actorOf());
        response = { updated: deals.length, ids: deals.map((d) => d.id), deals };
        break;
      }
      case "set_owner": {
        const owner = (await getCachedAdmins()).find((a) => a.uid === parsed.value);
        if (!owner) return Response.json({ error: "invalid_input" }, { status: 400 });
        const ids = await assignOwner(parsed.ids, { uid: owner.uid, name: owner.name }, await actorOf());
        response = { updated: ids.length, ids, owner: { uid: owner.uid, name: owner.name } };
        break;
      }
    }
    if ((response.updated as number) > 0) invalidateCrm(CRM_TAGS.leads);
    return Response.json(response);
  } catch (error) {
    console.error("crm bulk leads error", parsed.action, error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
