import { redirect } from "next/navigation";
import LeadsHeader from "@/app/components/admin/leads/LeadsHeader";
import LeadsView from "@/app/components/admin/leads/LeadsView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { listAdminUsers } from "@/lib/admin/crm/admins";
import { countLeads, listCompanyOptions, listContactOptions, listLeads } from "@/lib/admin/crm/leads";
import { listTemplates } from "@/lib/admin/crm/templatesStore";

export default async function LeadsPage() {
  const basePath = getAdminBasePath() ?? "";
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const [total, leads, contacts, companies, admins, templates, profile] = await Promise.all([
    countLeads(),
    listLeads(),
    listContactOptions(),
    listCompanyOptions(),
    listAdminUsers(),
    listTemplates(),
    getAdminProfile(session),
  ]);

  return (
    <div className="flex min-h-screen w-full flex-col gap-8 p-8">
      <LeadsHeader
        total={total}
        basePath={basePath}
        admins={admins}
        currentUid={session.uid}
        contacts={contacts}
        companies={companies}
      />
      <LeadsView
        leads={leads}
        basePath={basePath}
        currentUid={session.uid}
        currentUserName={profile.name ?? profile.email}
        templates={templates}
        admins={admins}
        contacts={contacts}
        companies={companies}
      />
    </div>
  );
}
