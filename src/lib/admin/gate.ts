/**
 * "Portão" da rota oculta (defesa em profundidade).
 *
 * O proxy (src/proxy.ts) é a única coisa que deveria levar requisições até a pasta interna
 * `internal-admin`. Ele injeta o header `x-admin-gate` com um valor secreto (HMAC derivado de
 * ADMIN_PENDING_SECRET) e remove qualquer cópia enviada pelo cliente. As páginas e rotas do painel
 * exigem esse valor: se algum bypass do proxy (bug do Next, encoding de URL…) chegar direto na
 * pasta interna, a resposta é 404.
 *
 * Sem "server-only" porque o proxy também usa. Usa Web Crypto (disponível no proxy e no Node).
 */

export const ADMIN_GATE_HEADER = "x-admin-gate";

let cachedGate: Promise<string | null> | null = null;

export function getAdminGateValue(): Promise<string | null> {
  if (!cachedGate) {
    cachedGate = (async () => {
      const secret = process.env.ADMIN_PENDING_SECRET;
      if (!secret) return null;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("tecfy-admin-gate-v1"));
      return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
    })();
  }
  return cachedGate;
}

/** Comparação em tempo constante (evita descobrir o valor por medição de tempo). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A requisição passou pelo proxy? */
export async function hasValidAdminGate(headers: Headers): Promise<boolean> {
  const expected = await getAdminGateValue();
  const received = headers.get(ADMIN_GATE_HEADER);
  return !!expected && !!received && safeEqual(received, expected);
}
