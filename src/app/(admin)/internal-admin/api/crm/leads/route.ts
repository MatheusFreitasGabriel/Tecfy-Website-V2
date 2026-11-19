import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, getCachedAdmins, invalidateCrm } from "@/lib/admin/crm/cache";
import { MissingReferenceError, createManualLead, getLeadRows } from "@/lib/admin/crm/leads";
import { CREATE_LEAD_MAX_BYTES, parseCreateLeadPayload } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const invalidInput = () => Response.json({ error: "invalid_input" }, { status: 400 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cadastro manual de lead (modal "Criar lead"), com contato e empresa novos ou existentes.
 * Idempotente: `request_id` (UUID gerado pelo modal) vira o id do lead — reenvio não duplica.
 * Ordem: gate/origem/JSON → sessão de admin → validação → gravação (transação).
 * Resposta: 201 { lead, created, contactReused } · 400 invalid_input · 401 · 500.
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, CREATE_LEAD_MAX_BYTES);
  if (body instanceof Response) return body;

  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (typeof body.request_id !== "string" || !UUID.test(body.request_id)) return invalidInput();

  try {
    const admins = await getCachedAdmins();
    const parsed = parseCreateLeadPayload(
      body,
      admins.map((a) => a.uid),
    );
    if (!parsed) return invalidInput();

    const owner = admins.find((a) => a.uid === parsed.lead.owner_uid);
    if (!owner) return invalidInput();

    const profile = await getAdminProfile(session);
    const actor = { uid: session.uid, name: profile.name ?? profile.email ?? session.uid };

    const result = await createManualLead(parsed, { uid: owner.uid, name: owner.name }, actor, body.request_id.toLowerCase());
    if (result.created) {
      invalidateCrm(
        CRM_TAGS.leads,
        ...(parsed.contact.mode === "new" ? [CRM_TAGS.contacts] : []),
        ...(parsed.company.mode === "new" ? [CRM_TAGS.companies] : []),
      );
    }
    const [lead] = await getLeadRows([result.id]);
    return Response.json({ lead: lead ?? null, created: result.created, contactReused: result.contactReused }, { status: 201 });
  } catch (error) {
    if (error instanceof MissingReferenceError) return invalidInput();
    console.error("crm create lead error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
