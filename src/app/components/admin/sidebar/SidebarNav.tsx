"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildAdminHref, sidebarBlocks } from "./SidebarData";

/** Caminho atual relativo ao painel ("/", "/leads"...), aceitando a URL pública ou a interna. */
function relativePath(pathname: string, basePath: string): string {
  for (const prefix of [basePath, "/internal-admin"]) {
    if (prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return pathname.slice(prefix.length) || "/";
    }
  }
  return pathname || "/";
}

function isActive(current: string, href: string): boolean {
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}

/** Navegação da sidebar, organizada em blocos (ex.: "Visão geral"). */
export default function SidebarNav({ basePath }: { basePath: string }) {
  const current = relativePath(usePathname(), basePath);

  return (
    <nav aria-label="Menu do painel" className="flex w-full flex-col gap-6">
      {sidebarBlocks.map((block) => (
        <div key={block.title} className="flex w-full flex-col gap-5">
          <p className="text-sm font-medium uppercase leading-[14px] text-text-muted">{block.title}</p>

          <ul className="flex w-full flex-col gap-1.5">
            {block.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(current, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={buildAdminHref(basePath, item.href)}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-12 w-full items-center gap-6 rounded-xl px-3 text-base font-medium leading-4 transition-colors ${
                      active
                        ? "bg-text-primary text-background"
                        : "text-text-disabled hover:bg-background-surface hover:text-text-muted"
                    }`}
                  >
                    <Icon aria-hidden className="h-6 w-6 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
