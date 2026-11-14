import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Estado temporário entre "email+senha" e "código 2FA", guardado num cookie HttpOnly
 * CRIPTOGRAFADO (AES-256-GCM). As credenciais intermediárias do Firebase
 * (mfaPendingCredential / idToken de cadastro) nunca chegam ao JavaScript da página.
 *
 * O cookie é amarrado ao contexto da tentativa (hash de IP + user-agent): copiado para
 * outra máquina/rede, ele deixa de valer.
 */

export const PENDING_TTL_SECONDS = 5 * 60;
export const PENDING_MAX_ATTEMPTS = 5;

interface PendingBase {
  uid: string;
  email: string;
  attempts: number;
  /** epoch ms */
  exp: number;
  /** hash de IP + user-agent da tentativa */
  ctx: string;
  /** id aleatório da tentativa */
  jti: string;
}

export type PendingLogin =
  | (PendingBase & { kind: "mfa"; mfaPendingCredential: string; mfaEnrollmentId: string })
  | (PendingBase & { kind: "enroll"; idToken: string; sessionInfo: string });

export function newPendingId(): string {
  return randomBytes(16).toString("hex");
}

function getKey(): Buffer {
  const secret = process.env.ADMIN_PENDING_SECRET;
  if (!secret) throw new Error("ADMIN_PENDING_SECRET ausente.");
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) throw new Error("ADMIN_PENDING_SECRET deve ter 32 bytes em base64.");
  return key;
}

export function sealPending(data: PendingLogin): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

/** Abre o cookie; retorna null se inválido, expirado, esgotado ou de outro contexto (IP/UA). */
export function openPending(value: string | undefined, expectedCtx: string): PendingLogin | null {
  if (!value || value.length > 8192) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const data = JSON.parse(json) as PendingLogin;
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    if (typeof data.attempts !== "number" || data.attempts >= PENDING_MAX_ATTEMPTS) return null;
    if (data.ctx !== expectedCtx || typeof data.jti !== "string") return null;
    return data;
  } catch {
    return null;
  }
}
