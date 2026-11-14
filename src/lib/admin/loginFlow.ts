import "server-only";
import { tryLogAdminEvent, type AdminAuditEvent } from "./audit";
import {
  EMAIL_GLOBAL_POLICY,
  EMAIL_IP_POLICY,
  IP_POLICY,
  emailIpKey,
  emailKey,
  ipKey,
  registerFailure,
} from "./rateLimit";
import { failureDelay, type RequestContext } from "./requestContext";

/** Códigos do Identity Toolkit que indicam problema NOSSO (config/rede), não do usuário. */
const SERVICE_ERRORS = new Set([
  "MISSING_API_KEY",
  "NETWORK_ERROR",
  "CONFIGURATION_NOT_FOUND",
  "OPERATION_NOT_ALLOWED",
  "UNVERIFIED_EMAIL",
  "API_KEY_INVALID",
]);

export function isServiceError(code: string): boolean {
  return SERVICE_ERRORS.has(code) || code.startsWith("HTTP_5");
}

export const errorResponse = {
  invalidCredentials: () => Response.json({ error: "invalid_credentials" }, { status: 401 }),
  invalidCode: () => Response.json({ error: "invalid_code" }, { status: 401 }),
  expired: () => Response.json({ error: "expired" }, { status: 401 }),
  tooMany: () => Response.json({ error: "too_many_requests" }, { status: 429 }),
  turnstile: () => Response.json({ error: "turnstile_failed" }, { status: 403 }),
  invalidInput: () => Response.json({ error: "invalid_input" }, { status: 400 }),
  unavailable: () => Response.json({ error: "unavailable" }, { status: 503 }),
};

/** Chaves de bloqueio que valem para uma tentativa com este email a partir deste IP. */
export function lockKeysFor(email: string, ip: string): string[] {
  return [emailIpKey(email, ip), emailKey(email)];
}

/**
 * Registra uma falha de autenticação: conta para IP, email+IP e email global (podendo bloquear),
 * grava auditoria e aplica o atraso aleatório.
 */
export async function recordAuthFailure(
  ctx: RequestContext,
  email: string,
  event: Extract<AdminAuditEvent, "login_failed" | "mfa_failed">,
  reason: string,
  uid: string | null = null
): Promise<void> {
  const [ipLocked, emailIpLocked, emailLocked] = await Promise.all([
    registerFailure(ipKey(ctx.ip), IP_POLICY).catch(() => false),
    registerFailure(emailIpKey(email, ctx.ip), EMAIL_IP_POLICY).catch(() => false),
    registerFailure(emailKey(email), EMAIL_GLOBAL_POLICY).catch(() => false),
  ]);
  await tryLogAdminEvent(ctx, { event, email, uid, reason });
  if (ipLocked || emailIpLocked || emailLocked) {
    const lockReason = emailLocked ? "email_locked_global" : emailIpLocked ? "email_ip_locked" : "ip_locked";
    await tryLogAdminEvent(ctx, { event: "blocked", email, uid, reason: lockReason });
  }
  await failureDelay();
}

export const EMAIL_MAX = 254;
export const PASSWORD_MAX = 128;
export const CODE_REGEX = /^\d{6}$/;
