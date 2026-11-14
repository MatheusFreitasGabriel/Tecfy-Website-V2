/**
 * Base pública do painel admin, derivada da env `ADMIN_PATH` (somente servidor).
 * Ex.: ADMIN_PATH=meu-painel → "/meu-painel". Retorna null se o painel estiver desativado.
 *
 * Use apenas em componentes de servidor / route handlers e passe o valor como prop
 * para componentes de cliente — nunca exponha via NEXT_PUBLIC_*.
 */
export function getAdminBasePath(): string | null {
  const slug = process.env.ADMIN_PATH?.trim().replace(/^\/+|\/+$/g, "");
  return slug ? `/${slug}` : null;
}
