import { FaHouse } from "react-icons/fa6";
import LogoutButton from "@/app/components/admin/LogoutButton";
import PageHeader from "@/app/components/admin/PageHeader";
import DashboardKpis from "@/app/components/admin/dashboard/DashboardKpis";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";

/** Primeiro nome para a saudação ("Matheus Freitas" → "Matheus"). */
function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export default async function AdminDashboardPage() {
  const basePath = getAdminBasePath() ?? "";
  const session = await getAdminSession();
  const profile = session ? await getAdminProfile(session) : null;
  const name = firstName(profile?.name ?? null);

  return (
    <div className="relative min-h-screen w-full p-8">
      <div className="absolute right-8 top-8">
        <LogoutButton basePath={basePath} />
      </div>

      <div className="flex flex-col gap-10">
        <PageHeader icon={FaHouse} section="Dashboard" title={name ? `Bem vindo de volta ${name}!` : "Bem vindo de volta!"} />
        <DashboardKpis />
      </div>
    </div>
  );
}
