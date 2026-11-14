import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAdminBasePath } from "@/lib/adminPath";
import { hasValidAdminGate } from "@/lib/admin/gate";

/**
 * Painel administrativo (rota oculta).
 * O endereço público vem da env ADMIN_PATH; o rewrite e os headers de segurança ficam em src/proxy.ts.
 * Esta área NÃO herda Header/Footer/FAQ/CTA nem GA/Adopt (ficam em (public)/layout.tsx).
 *  - login/   → tela de login (pública dentro do painel)
 *  - (app)/   → sistema (exige sessão válida)
 */
export const metadata: Metadata = {
  title: "Painel | Tecfy",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

// Lê env/cookies em tempo de requisição e permite o nonce da CSP.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Só responde se a requisição passou pelo proxy (slug + headers de segurança).
  if (!getAdminBasePath() || !(await hasValidAdminGate(await headers()))) notFound();
  return <>{children}</>;
}
