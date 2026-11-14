/**
 * Nomes dos cookies do painel. Sem "server-only" porque o proxy (src/proxy.ts) também usa.
 * Em produção usamos o prefixo __Host- (exige Secure, Path=/ e proíbe Domain),
 * o que impede que subdomínios sobrescrevam o cookie.
 */
const isProd = process.env.NODE_ENV === "production";

/** Cookie de sessão do Firebase (14 dias). */
export const ADMIN_SESSION_COOKIE = isProd ? "__Host-tecfy_adm" : "tecfy_adm";
/** Id do registro da sessão em admin_sessions (amarra a sessão ao dispositivo). */
export const ADMIN_SESSION_ID_COOKIE = isProd ? "__Host-tecfy_adm_sid" : "tecfy_adm_sid";
/** Estado temporário criptografado entre senha e código 2FA (5 min). */
export const ADMIN_PENDING_COOKIE = isProd ? "__Host-tecfy_adm_pending" : "tecfy_adm_pending";
