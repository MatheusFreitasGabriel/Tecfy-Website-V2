import { redirect } from "next/navigation";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";

/**
 * Área protegida do painel. Toda página aqui dentro exige sessão válida:
 * cookie assinado pelo Firebase, não expirado (14 dias), não revogado e com claim admin.
 */
export default async function AdminAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getAdminSession();
  if (!session) redirect(`${getAdminBasePath() ?? ""}/login`);

  return <>{children}</>;
}
