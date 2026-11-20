import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { bulkTasks, parseBulkTasks, type BulkTaskAction } from "@/lib/admin/crm/tasks";
import { adminByUid, dealDetailErrorResponse, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ações em massa nas tarefas (até 100): `{ ids, action: complete | reopen | delete | assign | shift | move_to, value? }`.
 * assign: value = uid · shift: value = ±dias · move_to: value = "AAAA-MM-DD". Resposta: 200 { ids }.
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request, 8 * 1024);
  if (guard instanceof Response) return guard;
  const parsed = parseBulkTasks(guard.body);
  if (!parsed) return crmResponses.invalid();
  let input: BulkTaskAction;
  if (parsed.action === "assign") {
    const assignee = await adminByUid(parsed.value as string);
    if (!assignee) return crmResponses.invalid();
    input = { action: "assign", ids: parsed.ids, assignee };
  } else if (parsed.action === "shift") input = { action: "shift", ids: parsed.ids, days: parsed.value as number };
  else if (parsed.action === "move_to") input = { action: "move_to", ids: parsed.ids, date: parsed.value as string };
  else input = { action: parsed.action as "complete" | "reopen" | "delete", ids: parsed.ids };
  try {
    const ids = await bulkTasks(input, guard.actor);
    if (ids.length) invalidateCrm(CRM_TAGS.tasks, CRM_TAGS.deals);
    return Response.json({ ids });
  } catch (error) {
    return dealDetailErrorResponse(error, "bulk tasks");
  }
}
