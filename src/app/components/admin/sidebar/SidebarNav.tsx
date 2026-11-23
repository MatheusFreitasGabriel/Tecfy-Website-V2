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
    <nav aria-label="Menu do painel" className="flex w-full flex-col gap-7">
      {sidebarBlocks.map((block) => (
        <div key={block.title} className="flex w-full flex-col gap-3">
          <p className="px-3 text-[11px] font-semibold uppercase leading-3 tracking-[0.1em] text-white/35">{block.title}</p>

          <ul className="flex w-full flex-col gap-1">
            {block.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(current, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={buildAdminHref(basePath, item.href)}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-11 w-full items-center gap-4 border px-3 text-[13px] font-bold uppercase leading-4 tracking-[0.04em] transition-colors ${
                      active
                        ? "border-white bg-white text-background"
                        : "border-transparent text-white/45 hover:border-border-primary hover:bg-white/[0.03] hover:text-white"
                    }`}
                  >
                    <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
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
