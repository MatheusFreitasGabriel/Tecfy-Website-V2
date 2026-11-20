import { redirect } from "next/navigation";
import DealsView from "@/app/components/admin/deals/DealsView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedAdmins, getCachedDeals, getCachedPipelineSetup } from "@/lib/admin/crm/cache";

const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);

/**
 * Tela de Negociações. Tudo do cache do servidor; o funil e a visão ficam na URL
 * (`?funil=<id>&visao=lista`) e `?converter=<leadId>` abre a conversão de um lead.
 */
export default async function NegociacoesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const basePath = getAdminBasePath() ?? "";
  // Dados começam junto com a checagem de sessão; sem sessão, são descartados.
  const data = Promise.all([getCachedDeals(), getCachedPipelineSetup(), getCachedAdmins()]);
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const [[{ deals, truncated }, setup, admins], params] = await Promise.all([data, searchParams]);
  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <DealsView
        deals={deals}
        truncated={truncated}
        boards={setup.boards}
        pipelines={setup.pipelines}
        admins={admins}
        basePath={basePath}
        currentUid={session.uid}
        initialPipelineId={isId(params.funil) ? params.funil : null}
        initialView={params.visao === "lista" ? "list" : "kanban"}
        convertLeadId={isId(params.converter) ? params.converter : null}
      />
    </div>
  );
}
