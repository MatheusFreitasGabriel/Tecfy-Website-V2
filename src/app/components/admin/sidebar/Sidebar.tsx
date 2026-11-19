import Image from "next/image";
import NotificationBell from "../notifications/NotificationBell";
import ProfileAvatar from "./ProfileAvatar";
import SidebarNav from "./SidebarNav";
import SidebarSearch from "./SidebarSearch";

interface SidebarProps {
  basePath: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

/** Sidebar do painel admin: logo + sino de notificações + avatar no topo e, 24px abaixo, a pesquisa. */
export default function Sidebar({ basePath, email, name, picture }: SidebarProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-[280px] shrink-0 flex-col gap-6 border-r border-border-primary bg-background p-6">
      <div className="flex w-full items-center justify-between">
        <Image src="/assets/visual-identity/logo-tecfy.svg" alt="Tecfy" width={91} height={24} priority />
        <div className="flex items-center gap-2">
          <NotificationBell basePath={basePath} />
          <ProfileAvatar email={email} name={name} picture={picture} />
        </div>
      </div>

      <SidebarSearch basePath={basePath} />

      <SidebarNav basePath={basePath} />
    </aside>
  );
}
