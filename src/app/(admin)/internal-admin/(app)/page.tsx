import LogoutButton from "@/app/components/admin/LogoutButton";
import { getAdminBasePath } from "@/lib/adminPath";

// Tela do sistema — vazia por enquanto (o conteúdo será definido na próxima etapa).
export default function AdminSystemPage() {
  const basePath = getAdminBasePath() ?? "";

  return (
    <div className="relative min-h-screen w-full bg-background">
      <div className="absolute right-6 top-6">
        <LogoutButton basePath={basePath} />
      </div>
    </div>
  );
}
