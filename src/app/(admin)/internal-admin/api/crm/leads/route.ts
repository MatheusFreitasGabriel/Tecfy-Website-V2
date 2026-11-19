import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { listAdminUsers } from "@/lib/admin/crm/admins";
import { MissingReferenceError, createManualLead } from "@/lib/admin/crm/leads";
import { CREATE_LEAD_MAX_BYTES, parseCreateLeadPayload } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const invalidInput = () => Response.json({ error: "invalid_input" }, { status: 400 });

/**
 * Cadastro manual de lead (modal "Criar lead"), com contato e empresa novos ou existentes.
 * Ordem: gate/origem/JSON → sessão de admin → validação → gravação (transação).
 * Resposta: 201 { id } · 400 invalid_input · 401 unauthorized · 500 internal_error.
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, CREATE_LEAD_MAX_BYTES);
  if (body instanceof Response) return body;

  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const admins = await listAdminUsers();
    const parsed = parseCreateLeadPayload(
      body,
      admins.map((a) => a.uid),
    );
    if (!parsed) return invalidInput();

    const owner = admins.find((a) => a.uid === parsed.lead.owner_uid);
    if (!owner) return invalidInput();

    const profile = await getAdminProfile(session);
    const actor = { uid: session.uid, name: profile.name ?? profile.email ?? session.uid };

    const id = await createManualLead(parsed, { uid: owner.uid, name: owner.name }, actor);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof MissingReferenceError) return invalidInput();
    console.error("crm create lead error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
