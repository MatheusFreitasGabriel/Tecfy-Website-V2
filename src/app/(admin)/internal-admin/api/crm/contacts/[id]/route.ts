import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, companyTag, contactTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { CompanyNotFoundError, ContactNotFoundError, DuplicateEmailError, setContactStatus, updateContact } from "@/lib/admin/crm/contacts";
import { entityStatuses } from "@/lib/admin/crm/options";
import { actorOf, crmResponses, isDocId } from "@/lib/admin/crm/routeHelpers";
import { CREATE_LEAD_MAX_BYTES, validateContactForm, type ContactForm } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Edita o contato (`{ contact: ContactForm }`) ou muda o status (`{ status: "ativo" | "inativo" }`).
 * Cada alteração fica registrada na timeline do contato.
 * Resposta: 200 { changed } · 400 · 401 · 404 · 409 duplicate_email { owner } · 500.
 */
export async function PATCH(request: Request, { params }: Context) {
  const body = await readGuardedJson(request, CREATE_LEAD_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return crmResponses.unauthorized();
  const { id } = await params;
  if (!isDocId(id)) return crmResponses.invalid();

  try {
    const actor = await actorOf(session);
    let changed: boolean;
    let companyIds: string[];
    if (body.status !== undefined) {
      if (!entityStatuses.is(body.status)) return crmResponses.invalid();
      const result = await setContactStatus(id, body.status, actor);
      changed = result.changed;
      companyIds = result.companyId ? [result.companyId] : [];
    } else {
      const parsed = body.contact && typeof body.contact === "object" ? validateContactForm(body.contact as Partial<ContactForm>) : null;
      if (!parsed?.ok) return crmResponses.invalid();
      ({ changed, companyIds } = await updateContact(id, parsed.value, actor));
    }
    // Só o que mostra este contato: a lista, a página dele e as páginas das empresas envolvidas.
    // (Os leads guardam só o id do contato e mostram o nome dele → só a LISTA de leads, não as outras páginas.)
    if (changed) invalidateCrm(CRM_TAGS.contacts, CRM_TAGS.leadsList, contactTag(id), ...companyIds.map(companyTag));
    return Response.json({ changed });
  } catch (error) {
    if (error instanceof ContactNotFoundError) return crmResponses.notFound();
    if (error instanceof DuplicateEmailError) return Response.json({ error: "duplicate_email", owner: error.owner }, { status: 409 });
    if (error instanceof CompanyNotFoundError) return crmResponses.invalid();
    console.error("crm update contact error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
