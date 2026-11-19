import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { DuplicateCnpjError, createCompany } from "@/lib/admin/crm/companies";
import { actorOf, crmResponses } from "@/lib/admin/crm/routeHelpers";
import { CREATE_LEAD_MAX_BYTES, validateCompanyForm, type CompanyForm } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cria uma empresa avulsa (tela Empresas). Corpo: `{ company: CompanyForm }`.
 * Resposta: 201 { company } · 400 · 401 · 409 duplicate_cnpj { owner } · 500.
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, CREATE_LEAD_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return crmResponses.unauthorized();

  const parsed = body.company && typeof body.company === "object" ? validateCompanyForm(body.company as Partial<CompanyForm>) : null;
  if (!parsed?.ok) return crmResponses.invalid();

  try {
    const company = await createCompany(parsed.value, await actorOf(session));
    invalidateCrm(CRM_TAGS.companies);
    return Response.json({ company }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateCnpjError) return Response.json({ error: "duplicate_cnpj", owner: error.owner }, { status: 409 });
    console.error("crm create company error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}
