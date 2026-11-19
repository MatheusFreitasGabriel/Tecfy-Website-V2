import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, companyTag, contactTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { CompanyMissingError, addCompanyMember } from "@/lib/admin/crm/companies";
import { CompanyNotFoundError, ContactNotFoundError, DuplicateEmailError } from "@/lib/admin/crm/contacts";
import { actorOf, crmResponses, isDocId } from "@/lib/admin/crm/routeHelpers";
import { CREATE_LEAD_MAX_BYTES, validateContactForm, type ContactForm } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Adiciona um funcionário à empresa: `{ member: { mode: "existing", id } | { mode: "new", draft: ContactForm } }`.
 * Contato existente que estava em outra empresa passa para esta (registrado nas timelines).
 * Resposta: 200 { contact } · 400 · 401 · 404 · 409 duplicate_email { owner } · 500.
 */
export async function POST(request: Request, { params }: Context) {
  const body = await readGuardedJson(request, CREATE_LEAD_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return crmResponses.unauthorized();
  const { id } = await params;
  if (!isDocId(id)) return crmResponses.invalid();

  const raw = body.member as Record<string, unknown> | undefined;
  let member: Parameters<typeof addCompanyMember>[1];
  if (raw?.mode === "existing" && isDocId(raw.id)) {
    member = { mode: "existing", id: raw.id };
  } else if (raw?.mode === "new" && raw.draft && typeof raw.draft === "object") {
    const parsed = validateContactForm(raw.draft as Partial<ContactForm>);
    if (!parsed.ok) return crmResponses.invalid();
    member = { mode: "new", data: parsed.value };
  } else {
    return crmResponses.invalid();
  }

  try {
    const { contact, previousCompanyId } = await addCompanyMember(id, member, await actorOf(session));
    invalidateCrm(CRM_TAGS.contacts, contactTag(contact.id), companyTag(id), companyTag(previousCompanyId));
    return Response.json({ contact });
  } catch (error) {
    if (error instanceof CompanyMissingError || error instanceof ContactNotFoundError || error instanceof CompanyNotFoundError) {
      return crmResponses.notFound();
    }
    if (error instanceof DuplicateEmailError) return Response.json({ error: "duplicate_email", owner: error.owner }, { status: 409 });
    console.error("crm add company member error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
