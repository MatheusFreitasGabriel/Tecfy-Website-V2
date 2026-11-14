import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/cookieNames";
import { ADMIN_GATE_HEADER, getAdminGateValue } from "@/lib/admin/gate";

/**
 * Painel administrativo em rota oculta.
 *
 * As páginas do painel vivem em `src/app/(admin)/internal-admin/`, mas NUNCA são
 * acessadas por esse caminho. O endereço público é definido pela env `ADMIN_PATH`
 * (ex.: ADMIN_PATH=meu-painel → https://www.tecfy.dev/meu-painel) e este proxy
 * faz o rewrite interno. Assim o slug não fica no repositório e pode ser trocado
 * só mudando a env.
 *
 * - `/${ADMIN_PATH}/*`     → rewrite para `/internal-admin/*` + headers de segurança (CSP com nonce etc.)
 * - sem cookie de sessão   → páginas (exceto /login) redirecionam para `/${ADMIN_PATH}/login`
 *                            (checagem rápida; a validação real é no servidor, em (app)/layout.tsx)
 * - `/internal-admin/*`    → 404 (acesso direto bloqueado)
 * - `ADMIN_PATH` ausente   → painel desativado (tudo 404)
 */

const INTERNAL_ADMIN_PREFIX = "/internal-admin";
const NOT_FOUND_PATH = "/__admin-not-found";
const isDev = process.env.NODE_ENV !== "production";

function getAdminSlug(): string | null {
  const raw = process.env.ADMIN_PATH?.trim().replace(/^\/+|\/+$/g, "");
  return raw ? raw : null;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Caminho decodificado e normalizado, para não ser enganado por `/%69nternal-admin`, `//x` etc. */
function normalizePath(pathname: string): string {
  let decoded = pathname;
  try {
    // Decodifica até estabilizar (cobre encoding duplo).
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    // Encoding inválido: usa o original.
  }
  return decoded.replace(/\/{2,}/g, "/").toLowerCase();
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cache-Control", "no-store, max-age=0");
  if (!isDev) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

/** Segue sem rewrite, removendo qualquer header de portão forjado pelo cliente. */
function passThrough(request: NextRequest): NextResponse {
  if (!request.headers.has(ADMIN_GATE_HEADER)) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.delete(ADMIN_GATE_HEADER);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Acesso direto à pasta interna (inclusive com encoding/maiúsculas): finge que não existe.
  if (matchesPrefix(normalizePath(pathname), INTERNAL_ADMIN_PREFIX)) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
  }

  const slug = getAdminSlug();
  if (!slug) return passThrough(request);

  const publicPrefix = `/${slug}`;
  if (!matchesPrefix(pathname, publicPrefix)) return passThrough(request);

  const gate = await getAdminGateValue();
  if (!gate) return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));

  const subPath = pathname.slice(publicPrefix.length) || "/";
  const isApi = matchesPrefix(subPath, "/api");
  const isLogin = matchesPrefix(subPath, "/login");

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Sem cookie de sessão → login (checagem otimista; o servidor valida de verdade).
  if (!isApi && !isLogin && !request.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `${publicPrefix}/login`;
    loginUrl.search = "";
    return applySecurityHeaders(NextResponse.redirect(loginUrl), csp);
  }

  const url = request.nextUrl.clone();
  url.pathname = INTERNAL_ADMIN_PREFIX + (subPath === "/" ? "" : subPath);

  // O Next lê a CSP dos headers da REQUISIÇÃO para aplicar o nonce nos próprios scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set(ADMIN_GATE_HEADER, gate);

  return applySecurityHeaders(NextResponse.rewrite(url, { request: { headers: requestHeaders } }), csp);
}

export const config = {
  // Ignora API pública, assets do Next, arquivos públicos e qualquer caminho com extensão.
  matcher: ["/((?!api/|_next/static/|_next/image|assets/|.*\\..*).*)"],
};
