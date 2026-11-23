import Link from "next/link";
import { FaHouse, FaPlus } from "react-icons/fa6";
import LogoutButton from "@/app/components/admin/LogoutButton";
import AttentionPanel from "@/app/components/admin/dashboard/AttentionPanel";
import { DashboardDetails, HeadlineStrip } from "@/app/components/admin/dashboard/DashboardKpis";
import RevenueChart from "@/app/components/admin/dashboard/RevenueChart";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { getCachedContracts, getCachedDeals, getCachedLeads, getCachedProducts, getCachedTasks } from "@/lib/admin/crm/cache";
import { computeAttention, computeFunnel, computeSummary, revenueYears, type ContractLite } from "@/lib/admin/crm/dashboardMetrics";

/** Primeiro nome para a saudação ("Matheus Freitas" → "Matheus"). */
function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Falha de uma fonte não derruba o Dashboard: aquela parte mostra "—". */
const settle = <T,>(p: Promise<T>) =>
  p.catch((error: unknown) => {
    console.error("dashboard source error", error instanceof Error ? error.message : "unknown");
    return null;
  });

const today = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });

/**
 * Dashboard em 3 níveis: (1) os 6 números principais de todas as áreas; (2) faturamento do ano ao
 * lado do que precisa de atenção hoje; (3) detalhes — finanças, funil, produtos e origem dos leads.
 */
export default async function AdminDashboardPage() {
  const basePath = getAdminBasePath() ?? "";
  // Dados em paralelo com a sessão (cache do CRM: só lê o Firestore quando algo mudou).
  const data = Promise.all([settle(getCachedContracts()), settle(getCachedLeads()), settle(getCachedDeals()), settle(getCachedTasks()), settle(getCachedProducts())]);
  const session = await getAdminSession();
  const profile = session ? await getAdminProfile(session) : null;
  const name = firstName(profile?.name ?? null);
  const [contracts, leads, deals, tasks, products] = await data;

  // eslint-disable-next-line react-hooks/purity -- horário da renderização (base dos meses, prazos e previsão)
  const now = Date.now();
  const list: ContractLite[] = contracts ?? [];
  const missing = { leads: !leads, deals: !deals, tasks: !tasks };
  const summary = contracts ? computeSummary({ contracts, leads: leads?.leads ?? null, deals: deals?.deals ?? null, tasks: tasks?.tasks ?? null }, now) : null;
  const attention = computeAttention(
    {
      contracts: list,
      leads: leads?.leads ?? null,
      deals: deals?.deals ?? null,
      tasks: tasks?.tasks ?? null,
      promos: (products?.products ?? []).flatMap((p) => (p.promo ? [{ productId: p.id, productName: p.name, name: p.promo.name, starts_at: p.promo.starts_at, ends_at: p.promo.ends_at }] : [])),
    },
    session?.uid ?? null,
    now,
  );
  const funnel = computeFunnel(leads?.leads ?? null, deals?.deals ?? null, now);
  const href = (path: string) => `${basePath}${path}`;
  const action = "inline-flex h-10 items-center gap-2 border border-admin-button-border px-4 text-[13px] font-semibold text-white transition-colors hover:border-white/60 hover:bg-white/5";

  return (
    <div className="flex min-h-screen w-full flex-col gap-6 p-8">
      {/* Nível 0 — saudação, data e ações rápidas */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.06em] text-secondary">
            <FaHouse aria-hidden className="h-3.5 w-3.5" /> Dashboard · {today.format(new Date(now))}
          </p>
          <h1 className="text-2xl font-semibold uppercase leading-8 tracking-tight text-white">{name ? `Bem vindo de volta, ${name}!` : "Bem vindo de volta!"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={href("/leads?novo=1")} className={action}>
            <FaPlus aria-hidden className="h-3 w-3" /> Lead
          </Link>
          <Link href={href("/tarefas?nova=1")} className={action}>
            <FaPlus aria-hidden className="h-3 w-3" /> Tarefa
          </Link>
          <LogoutButton basePath={basePath} />
        </div>
      </header>

      {!summary ? (
        <p className="border border-admin-danger/40 px-5 py-4 text-sm text-admin-danger">Não foi possível carregar os contratos. Recarregue a página.</p>
      ) : (
        <>
          {/* Nível 1 */}
          <HeadlineStrip basePath={basePath} summary={summary} missing={missing} />

          {/* Nível 2 — o painel de atenção acompanha a altura do gráfico */}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <RevenueChart contracts={list} years={revenueYears(list, now)} renderedAt={now} />
            </div>
            <div className="relative min-h-[360px]">
              <div className="h-full xl:absolute xl:inset-0">
                <AttentionPanel basePath={basePath} sections={attention} unavailable={{ tasks: missing.tasks, deals: missing.deals, leads: missing.leads }} />
              </div>
            </div>
          </div>

          {/* Nível 3 */}
          <DashboardDetails basePath={basePath} summary={summary} funnel={funnel} missing={missing} />
        </>
      )}
    </div>
  );
}
