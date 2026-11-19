import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, companyTag, invalidateCrm } from "@/lib/admin/crm/cache";
import { CompanyMissingError, DuplicateCnpjError, setCompanyStatus, updateCompany } from "@/lib/admin/crm/companies";
import { entityStatuses } from "@/lib/admin/crm/options";
import { actorOf, crmResponses, isDocId } from "@/lib/admin/crm/routeHelpers";
import { CREATE_LEAD_MAX_BYTES, validateCompanyForm, type CompanyForm } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Edita a empresa (`{ company: CompanyForm }`) ou muda o status (`{ status: "ativo" | "inativo" }`).
 * Cada alteração fica registrada na timeline da empresa.
 * Resposta: 200 { changed } · 400 · 401 · 404 · 409 duplicate_cnpj { owner } · 500.
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
    if (body.status !== undefined) {
      if (!entityStatuses.is(body.status)) return crmResponses.invalid();
      changed = await setCompanyStatus(id, body.status, actor);
    } else {
      const parsed = body.company && typeof body.company === "object" ? validateCompanyForm(body.company as Partial<CompanyForm>) : null;
      if (!parsed?.ok) return crmResponses.invalid();
      changed = (await updateCompany(id, parsed.value, actor)).changed;
    }
    // A página dela + listas que mostram o nome (contatos e páginas de contato usam a tag de empresas; leads).
    if (changed) invalidateCrm(companyTag(id), CRM_TAGS.companies, CRM_TAGS.leadsList);
    return Response.json({ changed });
  } catch (error) {
    if (error instanceof CompanyMissingError) return crmResponses.notFound();
    if (error instanceof DuplicateCnpjError) return Response.json({ error: "duplicate_cnpj", owner: error.owner }, { status: 409 });
    console.error("crm update company error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
