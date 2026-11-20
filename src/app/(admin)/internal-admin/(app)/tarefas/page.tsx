import { redirect } from "next/navigation";
import TasksView from "@/app/components/admin/tasks/TasksView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedAdmins, getCachedTasks } from "@/lib/admin/crm/cache";

/** Tela de Tarefas (Meu dia · Lista · Calendário). Tudo do cache do servidor. `?visao=lista|calendario`. */
export default async function TarefasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const basePath = getAdminBasePath() ?? "";
  // Dados começam junto com a checagem de sessão; sem sessão, são descartados.
  const data = Promise.all([getCachedTasks(), getCachedAdmins()]);
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);
  const [[{ tasks, truncated }, admins], params] = await Promise.all([data, searchParams]);
  const view = params.visao === "lista" ? "list" : params.visao === "calendario" ? "calendar" : "day";
  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <TasksView tasks={tasks} truncated={truncated} admins={admins} basePath={basePath} currentUid={session.uid} initialView={view} />
    </div>
  );
}
