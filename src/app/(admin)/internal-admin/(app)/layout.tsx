import { redirect } from "next/navigation";
import Sidebar from "@/app/components/admin/sidebar/Sidebar";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";

/**
 * Área protegida do painel. Toda página aqui dentro exige sessão válida:
 * cookie assinado pelo Firebase, não expirado (14 dias), não revogado e com claim admin.
 */
export default async function AdminAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getAdminSession();
  const basePath = getAdminBasePath() ?? "";
  if (!session) redirect(`${basePath}/login`);

  const profile = await getAdminProfile(session);

  return (
    <div className="admin-shell flex min-h-screen w-full bg-background">
      <Sidebar basePath={basePath} email={profile.email} name={profile.name} picture={profile.picture} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
