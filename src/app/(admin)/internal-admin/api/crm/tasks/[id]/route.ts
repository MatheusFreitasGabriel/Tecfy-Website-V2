import { CRM_TAGS, getCachedAdmins, invalidateCrm } from "@/lib/admin/crm/cache";
import { deleteTask, updateTask } from "@/lib/admin/crm/dealDetail";
import { setTaskDone } from "@/lib/admin/crm/deals";
import { adminByUid, dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { validateTaskEdit, type TaskForm } from "@/lib/admin/crm/dealValidation";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { TASKS_COLLECTION, type TaskRow } from "@/lib/admin/crm/types";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function readTask(id: string): Promise<TaskRow | null> {
  const snap = await getAdminDb().collection(TASKS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  const iso = (v: unknown) => (v && typeof (v as { toDate?: () => Date }).toDate === "function" ? (v as { toDate: () => Date }).toDate().toISOString() : null);
  return {
    id: snap.id,
    deal_id: typeof d.deal_id === "string" ? d.deal_id : null,
    title: String(d.title ?? "Tarefa"),
    type: d.type ?? "outro",
    due_at: iso(d.due_at) ?? new Date(0).toISOString(),
    done_at: iso(d.done_at),
    assignee_uid: typeof d.assignee_uid === "string" ? d.assignee_uid : null,
    assignee_name: typeof d.assignee_name === "string" ? d.assignee_name : null,
    notes: typeof d.notes === "string" ? d.notes : null,
    created_at: iso(d.created_at),
  };
}

/**
 * Conclui/reabre (`{ done: boolean }`) ou edita/reagenda (`{ task: TaskForm }`).
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
      invalidateCrm(CRM_TAGS.tasks);
      return Response.json({ task });
    }
    if (!guard.body.task || typeof guard.body.task !== "object") return crmResponses.invalid();
    const admins = await getCachedAdmins();
    const parsed = validateTaskEdit(guard.body.task as Partial<TaskForm>, admins.map((a) => a.uid));
    if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
    const assignee = await adminByUid(parsed.value.assignee_uid);
    if (!assignee) return crmResponses.invalid();
    await updateTask(id, parsed.value, assignee, guard.actor);
    invalidateCrm(CRM_TAGS.tasks);
    return Response.json({ task: await readTask(id) });
  } catch (error) {
    return dealDetailErrorResponse(error, "update task");
  }
}

/** Exclui a tarefa (registra no histórico da negociação). Resposta: 200 { ok } · 404. */
export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 1024);
  if (guard instanceof Response) return guard;
  try {
    await deleteTask(id, guard.actor);
    invalidateCrm(CRM_TAGS.tasks);
    return Response.json({ ok: true });
  } catch (error) {
    return dealDetailErrorResponse(error, "delete task");
  }
}
