import { FaHouse } from "react-icons/fa6";
import LogoutButton from "@/app/components/admin/LogoutButton";
import PageHeader from "@/app/components/admin/PageHeader";
import DashboardKpis from "@/app/components/admin/dashboard/DashboardKpis";
import RevenueChart from "@/app/components/admin/dashboard/RevenueChart";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { getCachedContracts, getCachedDeals, getCachedLeads, getCachedTasks } from "@/lib/admin/crm/cache";
import { computeSummary, revenueYears, type ContractLite } from "@/lib/admin/crm/dashboardMetrics";

/** Primeiro nome para a saudação ("Matheus Freitas" → "Matheus"). */
function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Falha de uma fonte não derruba o Dashboard: aquela parte mostra "—". */
const settle = <T,>(p: Promise<T>) => p.then((v) => v).catch((error: unknown) => {
  console.error("dashboard source error", error instanceof Error ? error.message : "unknown");
  return null;
});

export default async function AdminDashboardPage() {
  const basePath = getAdminBasePath() ?? "";
  // Dados em paralelo com a sessão (cache do CRM: só lê o Firestore quando algo mudou).
  const data = Promise.all([settle(getCachedContracts()), settle(getCachedLeads()), settle(getCachedDeals()), settle(getCachedTasks())]);
  const session = await getAdminSession();
  const profile = session ? await getAdminProfile(session) : null;
  const name = firstName(profile?.name ?? null);
  const [contracts, leads, deals, tasks] = await data;

  // eslint-disable-next-line react-hooks/purity -- horário da renderização (base dos meses e da previsão)
  const now = Date.now();
  const summary = contracts
    ? computeSummary({ contracts, leads: leads?.leads ?? null, deals: deals?.deals ?? null, tasks: tasks?.tasks ?? null }, now)
    : null;
  const list: ContractLite[] = contracts ?? [];

  return (
    <div className="relative min-h-screen w-full p-8">
      <div className="absolute right-8 top-8">
        <LogoutButton basePath={basePath} />
      </div>

      <div className="flex flex-col gap-10">
        <PageHeader icon={FaHouse} section="Dashboard" title={name ? `Bem vindo de volta, ${name}!` : "Bem vindo de volta!"} />
        <RevenueChart contracts={list} years={revenueYears(list, now)} renderedAt={now} />
        <DashboardKpis basePath={basePath} summary={summary} missing={{ leads: !leads, deals: !deals, tasks: !tasks }} />
      </div>
    </div>
  );
}
