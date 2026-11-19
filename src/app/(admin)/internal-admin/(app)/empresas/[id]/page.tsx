import { notFound, redirect } from "next/navigation";
import CompanyDetailView from "@/app/components/admin/companies/CompanyDetailView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedCompanyDetail } from "@/lib/admin/crm/cache";
import { listNotes } from "@/lib/admin/crm/notes";
import { COMPANIES_COLLECTION } from "@/lib/admin/crm/types";

/** Página da empresa (dados, funcionários, leads, negociações, produtos e histórico). */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const basePath = getAdminBasePath() ?? "";
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  // Dados começam a carregar JUNTO com a checagem de sessão (economiza uma ida inteira ao servidor).
  // Nada é exibido sem sessão válida: sem ela, o resultado é descartado e vai para o login.
  // Dados (cache) e timeline (sempre atual) também em paralelo entre si.
  const data = Promise.all([getCachedCompanyDetail(id), listNotes(COMPANIES_COLLECTION, id)]);
  data.catch(() => undefined); // se a sessão falhar e redirecionar, um erro aqui não fica solto
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const [company, notes] = await data;
  if (!company) notFound();

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <CompanyDetailView company={company} initialNotes={notes} basePath={basePath} />
    </div>
  );
}
