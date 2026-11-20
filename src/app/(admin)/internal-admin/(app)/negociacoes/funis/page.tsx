import { redirect } from "next/navigation";
import PipelinesManager from "@/app/components/admin/deals/PipelinesManager";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedDeals, getCachedPipelineSetup } from "@/lib/admin/crm/cache";

/** Gerenciar quadros e funis: etapas (até 6, arrastar para reordenar) e campos da negociação. */
export default async function FunisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const basePath = getAdminBasePath() ?? "";
  const data = Promise.all([getCachedPipelineSetup(), getCachedDeals()]);
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);
  const [[setup, { deals }], params] = await Promise.all([data, searchParams]);

  // Quantas negociações há em cada etapa (para avisar antes de remover uma etapa ocupada).
  const counts: Record<string, Record<string, number>> = {};
  for (const d of deals) {
    if (!d.pipeline_id || !d.stage_id) continue;
    counts[d.pipeline_id] ??= {};
    counts[d.pipeline_id][d.stage_id] = (counts[d.pipeline_id][d.stage_id] ?? 0) + 1;
  }
  const initial = typeof params.funil === "string" ? params.funil : null;

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <PipelinesManager basePath={basePath} boards={setup.boards} pipelines={setup.pipelines} counts={counts} initialPipelineId={initial} />
    </div>
  );
}
