import { CRM_TAGS, getCachedAdmins, invalidateCrm } from "@/lib/admin/crm/cache";
import { createTask } from "@/lib/admin/crm/deals";
import { adminByUid, dealErrorResponse, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { validateTaskForm, type TaskForm } from "@/lib/admin/crm/dealValidation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cria uma tarefa (na negociação, se `deal_id`). Corpo: `{ task: TaskForm }`.
 * Resposta: 201 { task } · 400 { fields } · 401 · 404 (negociação não existe).
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request, 8 * 1024);
  if (guard instanceof Response) return guard;
  const admins = await getCachedAdmins();
  const parsed = guard.body.task && typeof guard.body.task === "object" ? validateTaskForm(guard.body.task as Partial<TaskForm>, admins.map((a) => a.uid)) : null;
  if (!parsed) return crmResponses.invalid();
  if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
  const assignee = await adminByUid(parsed.value.assignee_uid);
  if (!assignee) return crmResponses.invalid();
  try {
    const task = await createTask(parsed.value, assignee, guard.actor);
    invalidateCrm(CRM_TAGS.tasks);
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return dealErrorResponse(error, "create task");
  }
}
