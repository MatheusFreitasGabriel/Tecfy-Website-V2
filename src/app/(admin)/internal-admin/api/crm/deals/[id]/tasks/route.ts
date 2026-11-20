import { listDealTasks } from "@/lib/admin/crm/deals";
import { dealDetailErrorResponse, validId } from "@/lib/admin/crm/dealRoutes";
import { crmResponses, guardRead } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Tarefas da negociação (abertas e concluídas). */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  try {
    return Response.json({ tasks: await listDealTasks(id) });
  } catch (error) {
    return dealDetailErrorResponse(error, "deal tasks");
  }
}
