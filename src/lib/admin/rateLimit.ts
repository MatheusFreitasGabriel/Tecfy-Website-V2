import "server-only";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";

/**
 * Rate limit + bloqueio persistidos no Firestore (coleção admin_rate_limits).
 * Em memória não funciona na Vercel (cada instância serverless tem a sua memória).
 * As chaves são hashes — o documento não expõe IP nem email em texto puro.
 *
 * Três chaves por tentativa:
 *  - ip_       → o IP inteiro (qualquer email)
 *  - emailip_  → aquele email A PARTIR daquele IP (bloqueio rápido, não afeta o admin em outra rede)
 *  - email_    → aquele email somando todos os IPs (limite alto: ataque distribuído)
 */

const COLLECTION = "admin_rate_limits";
const MIN = 60 * 1000;

export interface Policy {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}

export const IP_POLICY: Policy = { maxFailures: 10, windowMs: 15 * MIN, lockMs: 60 * MIN };
export const EMAIL_IP_POLICY: Policy = { maxFailures: 5, windowMs: 15 * MIN, lockMs: 30 * MIN };
export const EMAIL_GLOBAL_POLICY: Policy = { maxFailures: 30, windowMs: 60 * MIN, lockMs: 60 * MIN };

/** Teto de requisições por IP (qualquer resultado), contra rajadas. */
const IP_BURST = { max: 30, windowMs: 10 * MIN };

interface LimitDoc {
  failures?: number[];
  requests?: number[];
  locked_until?: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

export const ipKey = (ip: string) => `ip_${hash(ip)}`;
export const emailIpKey = (email: string, ip: string) => `emailip_${hash(`${email.toLowerCase()}|${ip}`)}`;
export const emailKey = (email: string) => `email_${hash(email.toLowerCase())}`;

function docRef(key: string) {
  return getAdminDb().collection(COLLECTION).doc(key);
}

function expiresAt(now: number) {
  return new Date(now + 24 * 60 * MIN);
}

/** Registra a requisição do IP e diz se ele pode prosseguir (não bloqueado e dentro do teto). */
export async function hitIp(ip: string): Promise<boolean> {
  const ref = docRef(ipKey(ip));
  const now = Date.now();
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as LimitDoc;
    if ((data.locked_until ?? 0) > now) return false;
    const requests = (data.requests ?? []).filter((ts) => now - ts < IP_BURST.windowMs);
    if (requests.length >= IP_BURST.max) return false;
    requests.push(now);
    tx.set(ref, { requests, updated_at: now, expires_at: expiresAt(now) }, { merge: true });
    return true;
  });
}

/** Alguma das chaves está bloqueada agora? */
export async function isAnyLocked(keys: string[]): Promise<boolean> {
  const now = Date.now();
  const snaps = await getAdminDb().getAll(...keys.map(docRef));
  return snaps.some((snap) => ((snap.data() as LimitDoc | undefined)?.locked_until ?? 0) > now);
}

/** Registra uma falha. Retorna true se esta falha causou bloqueio. */
export async function registerFailure(key: string, policy: Policy): Promise<boolean> {
  const ref = docRef(key);
  const now = Date.now();
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as LimitDoc;
    const failures = (data.failures ?? []).filter((ts) => now - ts < policy.windowMs);
    failures.push(now);
    const shouldLock = failures.length >= policy.maxFailures;
    tx.set(
      ref,
      {
        failures: shouldLock ? [] : failures,
        locked_until: shouldLock ? now + policy.lockMs : data.locked_until ?? 0,
        updated_at: now,
        expires_at: expiresAt(now),
      },
      { merge: true }
    );
    return shouldLock;
  });
}

export async function clearFailures(keys: string[]): Promise<void> {
  const now = Date.now();
  await Promise.all(keys.map((key) => docRef(key).set({ failures: [], updated_at: now }, { merge: true })));
}
