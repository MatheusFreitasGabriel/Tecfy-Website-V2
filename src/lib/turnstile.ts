import "server-only";

interface TurnstileResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

const PRODUCTION_HOSTNAMES = ["tecfy.dev", "www.tecfy.dev"];
const DEV_HOSTNAMES = [...PRODUCTION_HOSTNAMES, "localhost", "127.0.0.1"];

/**
 * Verifica um token do Cloudflare Turnstile no servidor.
 * Confere sucesso, hostname permitido e a `action` esperada (cada formulário usa a sua).
 * Retorna false em qualquer falha (inclusive timeout ou secret ausente).
 */
export async function verifyTurnstile(token: string, ip: string, expectedAction: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let data: TurnstileResponse;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return false;
    data = (await response.json()) as TurnstileResponse;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!data.success) return false;

  // Em produção, localhost só com ADMIN_ALLOW_LOCALHOST=1 (teste local com `npm start`; NUNCA na Vercel).
  const strict = process.env.NODE_ENV === "production" && process.env.ADMIN_ALLOW_LOCALHOST !== "1";
  const allowedHostnames = strict ? PRODUCTION_HOSTNAMES : DEV_HOSTNAMES;
  const hostnameOk = !!data.hostname && allowedHostnames.includes(data.hostname);
  const actionOk = data.action === expectedAction;

  if (!hostnameOk || !actionOk) {
    console.error("Turnstile validation failed", { hostname: data.hostname, action: data.action });
    return false;
  }
  return true;
}
