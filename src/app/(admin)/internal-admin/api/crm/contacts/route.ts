import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, companyTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { CompanyNotFoundError, DuplicateEmailError, createContact } from "@/lib/admin/crm/contacts";
import { actorOf, crmResponses } from "@/lib/admin/crm/routeHelpers";
import { CREATE_LEAD_MAX_BYTES, validateContactForm, type ContactForm } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cria um contato avulso (tela Contatos). Corpo: `{ contact: ContactForm }`.
 * Resposta: 201 { contact } · 400 · 401 · 409 duplicate_email { owner } · 500.
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, CREATE_LEAD_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return crmResponses.unauthorized();

  const parsed = body.contact && typeof body.contact === "object" ? validateContactForm(body.contact as Partial<ContactForm>) : null;
  if (!parsed?.ok) return crmResponses.invalid();

  try {
    const contact = await createContact(parsed.value, await actorOf(session));
    invalidateCrm(CRM_TAGS.contacts, companyTag(contact.company?.id));
    return Response.json({ contact }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateEmailError) return Response.json({ error: "duplicate_email", owner: error.owner }, { status: 409 });
    if (error instanceof CompanyNotFoundError) return crmResponses.invalid();
    console.error("crm create contact error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
