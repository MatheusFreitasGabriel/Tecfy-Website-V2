'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  FaChevronLeft,
  FaChevronRight,
  FaCookieBite,
  FaFileContract,
  FaShieldHalved,
} from 'react-icons/fa6';

const NAV_ITEMS = [
  { href: '/politicas/privacidade', label: 'Privacidade', icon: FaShieldHalved },
  { href: '/politicas/cookies', label: 'Cookies', icon: FaCookieBite },
  { href: '/politicas/termos', label: 'Termos de uso', icon: FaFileContract },
];

export default function PoliticasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const navContent = (
    <div className="flex flex-col gap-4">
      {!isSidebarCollapsed && (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Navegação
        </p>
      )}

      <nav className="flex flex-col gap-1.5" aria-label="Navegação de políticas">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isSidebarCollapsed ? item.label : undefined}
              className={`rounded-md px-3 py-2 text-sm transition-colors duration-200 ${
                isActive
                  ? 'bg-white/5 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              } ${isSidebarCollapsed ? 'flex items-center justify-center' : 'flex items-center gap-2.5'}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!isSidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="w-full">
      <div className="mx-auto min-h-screen w-full max-w-[1800px]">
        <aside
          className={`fixed inset-y-0 left-0 z-30 hidden border-r border-white/10 bg-[#000000] py-8 transition-all duration-300 md:block ${
            isSidebarCollapsed ? 'w-20 px-3' : 'w-72 px-6'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#0d0d0d] text-gray-300 transition-colors hover:text-white"
            aria-label={isSidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            title={isSidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          >
            {isSidebarCollapsed ? (
              <FaChevronRight className="h-3 w-3" />
            ) : (
              <FaChevronLeft className="h-3 w-3" />
            )}
          </button>

          <div className="flex h-full flex-col gap-10">
            <Link
              href="/#hero"
              className={`inline-flex rounded-md px-1 py-1 transition-opacity hover:opacity-80 ${
                isSidebarCollapsed ? 'w-full justify-center' : 'w-fit'
              }`}
              aria-label="Voltar para o início"
              title={isSidebarCollapsed ? 'Voltar para o início' : undefined}
            >
              {isSidebarCollapsed ? (
                <span className="text-lg font-semibold text-white">T</span>
              ) : (
                <Image
                  src="/assets/visual-identity/logo-tecfy.svg"
                  alt="Tecfy Logo"
                  width={91}
                  height={24}
                  priority
                />
              )}
            </Link>
            {navContent}
          </div>
        </aside>

        <div
          className={`flex min-h-screen min-w-0 justify-center px-6 py-12 md:pr-10 md:py-16 ${
            isSidebarCollapsed ? 'md:pl-24' : 'md:pl-88'
          }`}
        >
          <div className="w-full max-w-[1440px]">
            <aside className="mb-8 border-b border-white/10 pb-6 md:hidden">
              <div className="mb-6">
                <Link
                  href="/#hero"
                  className="inline-flex w-fit rounded-md px-1 py-1 hover:opacity-80 transition-opacity"
                  aria-label="Voltar para o início"
                >
                  <Image
                    src="/assets/visual-identity/logo-tecfy.svg"
                    alt="Tecfy Logo"
                    width={91}
                    height={24}
                    priority
                  />
                </Link>
              </div>
              {navContent}
            </aside>
            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
