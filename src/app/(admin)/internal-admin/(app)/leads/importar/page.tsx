import { redirect } from "next/navigation";
import ImportView from "@/app/components/admin/leads/import/ImportView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedAdmins, getCachedImports } from "@/lib/admin/crm/cache";

/**
 * Importar lista (planilha → revisão → confirmação). A planilha é lida no navegador; a análise de
 * duplicados e a gravação passam pelas rotas `api/crm/leads/import/*`.
 */
export default async function ImportLeadsPage() {
  const basePath = getAdminBasePath() ?? "";
  const data = Promise.all([getCachedAdmins(), getCachedImports()]);
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const [admins, history] = await data;

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <ImportView basePath={basePath} admins={admins} currentUid={session.uid} history={history} />
    </div>
  );
}
