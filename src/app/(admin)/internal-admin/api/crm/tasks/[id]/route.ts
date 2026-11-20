import { CRM_TAGS, getCachedAdmins, invalidateCrm } from "@/lib/admin/crm/cache";
import { deleteTask, setTaskDone, toTaskRow, updateTask } from "@/lib/admin/crm/tasks";
import { adminByUid, dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { validateTaskEdit, type TaskForm } from "@/lib/admin/crm/dealValidation";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { TASKS_COLLECTION } from "@/lib/admin/crm/types";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Conclui/reabre (`{ done: boolean }`; recorrente cria a próxima) ou edita/reagenda (`{ task: TaskForm }`).
 * Resposta: 200 { task } · 400 { fields } · 401 · 404.
 */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 8 * 1024);
  if (guard instanceof Response) return guard;
  try {
    if (typeof guard.body.done === "boolean") {
      const task = await setTaskDone(id, guard.body.done, guard.actor);
      if (!task) return crmResponses.notFound();
      invalidateCrm(CRM_TAGS.tasks, task.deal_id ? CRM_TAGS.deals : null);
      // Recorrente: devolve também a próxima ocorrência (a tela mostra na hora).
      const nextSnap = guard.body.done && task.next_task_id ? await getAdminDb().collection(TASKS_COLLECTION).doc(task.next_task_id).get() : null;
      return Response.json({ task, next: nextSnap?.exists ? toTaskRow(nextSnap) : null });
    }
    if (!guard.body.task || typeof guard.body.task !== "object") return crmResponses.invalid();
    const admins = await getCachedAdmins();
    const parsed = validateTaskEdit(guard.body.task as Partial<TaskForm>, admins.map((a) => a.uid));
    if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
    const assignee = await adminByUid(parsed.value.assignee_uid);
    if (!assignee) return crmResponses.invalid();
    await updateTask(id, parsed.value, assignee, guard.actor);
    const task = toTaskRow(await getAdminDb().collection(TASKS_COLLECTION).doc(id).get());
    invalidateCrm(CRM_TAGS.tasks, task.deal_id ? CRM_TAGS.deals : null);
    return Response.json({ task });
  } catch (error) {
    return dealDetailErrorResponse(error, "update task");
  }
}

/** Exclui a tarefa (registra no histórico do vínculo). Resposta: 200 { ok } · 404. */
export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 1024);
  if (guard instanceof Response) return guard;
  try {
    await deleteTask(id, guard.actor);
    invalidateCrm(CRM_TAGS.tasks, CRM_TAGS.deals);
    return Response.json({ ok: true });
  } catch (error) {
    return dealDetailErrorResponse(error, "delete task");
  }
}
