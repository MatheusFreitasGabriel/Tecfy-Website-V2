import { redirect } from "next/navigation";
import LeadsView from "@/app/components/admin/leads/LeadsView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { getCachedAdmins, getCachedLeads, getCachedTemplates } from "@/lib/admin/crm/cache";

/**
 * Tela de Leads. Tudo vem do cache do servidor (só lê o Firestore quando algo mudou).
 * Contatos/empresas para as buscas NÃO vêm aqui: os modais carregam sob demanda.
 */
export default async function LeadsPage() {
  const basePath = getAdminBasePath() ?? "";
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const [{ leads, truncated }, admins, templates, profile] = await Promise.all([
    getCachedLeads(),
    getCachedAdmins(),
    getCachedTemplates(),
    getAdminProfile(session),
  ]);

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <LeadsView
        leads={leads}
        truncated={truncated}
        basePath={basePath}
        currentUid={session.uid}
        currentUserName={profile.name ?? profile.email}
        templates={templates}
        admins={admins}
      />
    </div>
  );
}
