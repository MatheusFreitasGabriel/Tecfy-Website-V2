import { CRM_TAGS, getCachedAdmins, getCachedTasks, invalidateCrm } from "@/lib/admin/crm/cache";
import { createTask } from "@/lib/admin/crm/tasks";
import { adminByUid, dealDetailErrorResponse, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { validateTaskForm, type TaskForm } from "@/lib/admin/crm/dealValidation";
import { crmResponses, guardRead } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARENT_TAGS = { deal: CRM_TAGS.deals, lead: CRM_TAGS.leads, contact: CRM_TAGS.contacts, company: CRM_TAGS.companies } as const;

/** Tarefas da tela (abertas + concluídas nos últimos 60 dias), do cache do servidor. */
export async function GET(request: Request) {
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  try {
    return Response.json(await getCachedTasks());
  } catch (error) {
    return dealDetailErrorResponse(error, "list tasks");
  }
}

/**
 * Cria uma tarefa. Corpo: `{ task: TaskForm }` (vínculo opcional: negociação, lead, contato ou empresa;
 * repetição e lembrete opcionais). Resposta: 201 { task } · 400 { fields } · 401 · 404 (vínculo não existe).
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
    // A negociação mostra os vencimentos (Kanban); lead/contato/empresa ganham uma observação.
    invalidateCrm(CRM_TAGS.tasks, task.parent ? PARENT_TAGS[task.parent.type] : null);
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return dealDetailErrorResponse(error, "create task");
  }
}
