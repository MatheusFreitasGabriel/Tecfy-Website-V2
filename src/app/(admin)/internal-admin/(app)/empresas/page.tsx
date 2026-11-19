import { redirect } from "next/navigation";
import CompaniesView from "@/app/components/admin/companies/CompaniesView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedCompanies } from "@/lib/admin/crm/cache";

/** Lista de empresas (do cache do servidor; só lê o Firestore quando algo mudou). */
export default async function CompaniesPage() {
  const basePath = getAdminBasePath() ?? "";
  // Dados começam a carregar JUNTO com a checagem de sessão (economiza uma ida inteira ao servidor).
  // Nada é exibido sem sessão válida: sem ela, o resultado é descartado e vai para o login.
  const data = getCachedCompanies();
  data.catch(() => undefined); // se a sessão falhar e redirecionar, um erro aqui não fica solto
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const { companies, truncated } = await data;
  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <CompaniesView companies={companies} truncated={truncated} basePath={basePath} />
    </div>
  );
}
