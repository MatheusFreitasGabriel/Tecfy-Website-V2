import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { listDealHistory, logDealActivity } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { parseActivity } from "@/lib/admin/crm/dealValidation";
import { crmResponses, guardRead } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Histórico completo da negociação (mais recentes primeiro). */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  try {
    const raw = Number(new URL(request.url).searchParams.get("limit") ?? 500);
    const limit = Number.isInteger(raw) ? Math.min(500, Math.max(1, raw)) : 500;
    return Response.json({ history: await listDealHistory(id, limit) });
  } catch (error) {
    return dealDetailErrorResponse(error, "deal history");
  }
}

/** Registro manual/automático: `{ kind: "note" | "call" | "whatsapp", text }`. Resposta: 201 { entry }. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 12 * 1024);
  if (guard instanceof Response) return guard;
  const parsed = parseActivity(guard.body);
  if (!parsed) return crmResponses.invalid();
  try {
    const entry = await logDealActivity(id, parsed.kind, parsed.text, guard.actor);
    invalidateCrm(CRM_TAGS.deals);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return dealDetailErrorResponse(error, "deal activity");
  }
}
