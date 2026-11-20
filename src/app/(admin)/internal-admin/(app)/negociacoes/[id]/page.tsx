import { notFound, redirect } from "next/navigation";
import DealDetailView from "@/app/components/admin/deal-detail/DealDetailView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedAdmins, getCachedPipelineSetup, getCachedTemplates } from "@/lib/admin/crm/cache";
import { getDealDetail, listDealFiles, listDealHistory } from "@/lib/admin/crm/dealDetail";
import { DEFAULT_PIPELINE_ID, listDealTasks } from "@/lib/admin/crm/deals";
import { isEmailConfigured } from "@/lib/admin/crm/email";

const HISTORY_FIRST_PAGE = 50;

/** Página da negociação: tudo carregado em paralelo (e junto com a checagem de sessão). */
export default async function NegociacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const basePath = getAdminBasePath() ?? "";
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();

  // Tarefas uma vez só: os vencimentos das abertas vão para o detalhe. Histórico: os 50 mais recentes
  // (o resto carrega sob demanda na aba Histórico).
  const tasksPromise = listDealTasks(id);
  const detailPromise = tasksPromise.then((tasks) => getDealDetail(id, { openTaskDue: tasks.filter((t) => !t.done_at).map((t) => t.due_at) }));
  const data = Promise.all([detailPromise, listDealHistory(id, HISTORY_FIRST_PAGE), tasksPromise, listDealFiles(id), getCachedPipelineSetup(), getCachedAdmins(), getCachedTemplates()]);
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const [deal, history, tasks, files, setup, admins, templates] = await data;
  if (!deal) notFound();
  const pipeline =
    setup.pipelines.find((p) => p.id === deal.pipeline_id) ?? setup.pipelines.find((p) => p.id === DEFAULT_PIPELINE_ID) ?? setup.pipelines[0];
  if (!pipeline) notFound();

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <DealDetailView
        deal={deal}
        history={history}
        historyComplete={history.length < HISTORY_FIRST_PAGE}
        tasks={tasks}
        files={files}
        boards={setup.boards}
        pipeline={pipeline}
        pipelines={setup.pipelines.filter((p) => !p.archived && p.stages.length && setup.boards.some((b) => b.id === p.board_id && !b.archived))}
        admins={admins}
        templates={templates}
        basePath={basePath}
        currentUid={session.uid}
        storageConfigured={Boolean(process.env.FIREBASE_STORAGE_BUCKET)}
        emailConfigured={isEmailConfigured()}
      />
    </div>
  );
}
