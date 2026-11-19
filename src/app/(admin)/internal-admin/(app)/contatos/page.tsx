import { redirect } from "next/navigation";
import ContactsView from "@/app/components/admin/contacts/ContactsView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedContacts } from "@/lib/admin/crm/cache";

/** Lista de contatos (do cache do servidor; só lê o Firestore quando algo mudou). */
export default async function ContactsPage() {
  const basePath = getAdminBasePath() ?? "";
  // Dados começam a carregar JUNTO com a checagem de sessão (economiza uma ida inteira ao servidor).
  // Nada é exibido sem sessão válida: sem ela, o resultado é descartado e vai para o login.
  const data = getCachedContacts();
  data.catch(() => undefined); // se a sessão falhar e redirecionar, um erro aqui não fica solto
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const { contacts, truncated } = await data;
  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <ContactsView contacts={contacts} truncated={truncated} basePath={basePath} />
    </div>
  );
}
