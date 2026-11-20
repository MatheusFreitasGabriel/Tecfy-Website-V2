import { CRM_TAGS, companyTag, getCachedAdmins, getCachedLeads, invalidateCrm } from "@/lib/admin/crm/cache";
import { convertLeadToDeal } from "@/lib/admin/crm/deals";
import { activePipelines, adminByUid, dealErrorResponse, freshDealRow, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { parseConvertLeadPayload } from "@/lib/admin/crm/dealValidation";
import { crmResponses, guardRead } from "@/lib/admin/crm/routeHelpers";
import type { ConvertibleLead } from "@/lib/admin/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Leads que ainda não viraram negociação (lista do "Converter lead"). Vem do cache da tela de Leads. */
export async function GET(request: Request) {
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  try {
    const { leads } = await getCachedLeads();
    const options: ConvertibleLead[] = leads
      .filter((l) => !l.deal_id && l.status !== "arquivado")
      .map((l) => ({
        id: l.id,
        title: l.title,
        qualification: l.qualification,
        source: l.source,
        entry: l.entry,
        owner_uid: l.owner_uid,
        estimated_value_cents: l.estimated_value_cents,
        expected_close_date: l.expected_close_date,
        interest_plan: l.interest_plan,
        notes: l.notes,
        contact: l.contact?.id ? { id: l.contact.id, name: l.contact.name } : null,
        company: l.company,
        created_at: l.created_at,
      }));
    return Response.json({ leads: options });
  } catch (error) {
    console.error("crm convertible leads error", error instanceof Error ? error.message : "unknown");
    return crmResponses.internal();
  }
}

/**
 * Converte um lead em negociação. Corpo: `{ lead_id, deal: DealForm, contact_id?, company_id? }`.
 * Resposta: 201 { deal } · 400 · 401 · 404 · 409 already_converted { deal_id } | pipeline_changed | missing_link.
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request);
  if (guard instanceof Response) return guard;
  const [admins, pipelines] = await Promise.all([getCachedAdmins(), activePipelines()]);
  const parsed = parseConvertLeadPayload(guard.body, admins.map((a) => a.uid), pipelines);
  if (!parsed) return crmResponses.invalid();
  const owner = await adminByUid(parsed.deal.owner_uid);
  if (!owner) return crmResponses.invalid();
  try {
    const { id } = await convertLeadToDeal(parsed, owner, guard.actor);
    invalidateCrm(CRM_TAGS.deals, CRM_TAGS.leads, companyTag(parsed.company_id));
    return Response.json({ deal: await freshDealRow(id) }, { status: 201 });
  } catch (error) {
    return dealErrorResponse(error, "convert lead");
  }
}
