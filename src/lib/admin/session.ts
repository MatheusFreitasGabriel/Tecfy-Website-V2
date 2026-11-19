import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { tryLogAdminEvent } from "./audit";
import { ADMIN_PENDING_COOKIE, ADMIN_SESSION_COOKIE, ADMIN_SESSION_ID_COOKIE } from "./cookieNames";
import { PENDING_TTL_SECONDS } from "./pendingCookie";
import { getContextFromHeaders, userAgentHash, type RequestContext } from "./requestContext";

/** Sessão do painel: 14 dias (máximo permitido pelo Firebase). Depois disso, login de novo. */
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

const SESSIONS_COLLECTION = "admin_sessions";
const isProd = process.env.NODE_ENV === "production";

const baseCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: "strict" as const,
  path: "/",
};

export interface AdminSession {
  uid: string;
  email: string | null;
  /** Nome e foto do perfil no Firebase Auth (displayName / photoURL), se existirem. */
  name: string | null;
  picture: string | null;
}

interface SessionRecord {
  uid: string;
  ua_hash: string;
  expires_at_ms: number;
}

/**
 * Valida o ID token recém-obtido e cria a sessão de 14 dias:
 *  - exige claim admin, uid esperado e login pelo 2º fator (TOTP);
 *  - cria o cookie de sessão do Firebase;
 *  - grava admin_sessions/{sid} com o hash do user-agent (amarra ao dispositivo).
 * Retorna false se qualquer condição falhar.
 */
export async function establishSession(idToken: string, expectedUid: string, ctx: RequestContext): Promise<boolean> {
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken, true);
  if (decoded.uid !== expectedUid) return false;
  if (decoded.admin !== true) return false;
  if (decoded.firebase?.sign_in_second_factor !== "totp") return false;

  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 });

  const sid = randomBytes(32).toString("hex");
  const now = Date.now();
  await getAdminDb()
    .collection(SESSIONS_COLLECTION)
    .doc(sid)
    .set({
      uid: decoded.uid,
      email: decoded.email ?? null,
      ua_hash: userAgentHash(ctx),
      ip: ctx.ip,
      geo: ctx.geo,
      created_at: FieldValue.serverTimestamp(),
      expires_at_ms: now + SESSION_MAX_AGE_SECONDS * 1000,
      // Campo para política de TTL do Firestore (limpeza automática).
      expires_at: new Date(now + SESSION_MAX_AGE_SECONDS * 1000),
    });

  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, sessionCookie, { ...baseCookie, maxAge: SESSION_MAX_AGE_SECONDS });
  jar.set(ADMIN_SESSION_ID_COOKIE, sid, { ...baseCookie, maxAge: SESSION_MAX_AGE_SECONDS });
  jar.delete(ADMIN_PENDING_COOKIE);
  return true;
}

/** Apaga o registro da sessão atual (se houver) e todos os cookies do painel. */
export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(ADMIN_SESSION_ID_COOKIE)?.value;
  if (sid && /^[a-f0-9]{64}$/.test(sid)) {
    await getAdminDb().collection(SESSIONS_COLLECTION).doc(sid).delete().catch(() => undefined);
  }
  jar.set(ADMIN_SESSION_COOKIE, "", { ...baseCookie, maxAge: 0 });
  jar.set(ADMIN_SESSION_ID_COOKIE, "", { ...baseCookie, maxAge: 0 });
  jar.set(ADMIN_PENDING_COOKIE, "", { ...baseCookie, maxAge: 0 });
}

/** Limpa só o estado temporário do login (não mexe em sessão existente). */
export async function clearPendingCookie(): Promise<void> {
  (await cookies()).set(ADMIN_PENDING_COOKIE, "", { ...baseCookie, maxAge: 0 });
}

export async function setPendingCookie(value: string): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_PENDING_COOKIE, value, { ...baseCookie, maxAge: PENDING_TTL_SECONDS });
}

export async function readPendingCookie(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_PENDING_COOKIE)?.value;
}

/**
 * Sessão atual (ou null). A cada requisição verifica:
 *  - cookie do Firebase: assinatura, expiração, REVOGAÇÃO (checkRevoked) e claim admin;
 *  - registro em admin_sessions: existe, é do mesmo usuário e do MESMO navegador (hash do UA).
 * Se o cookie aparecer em outro navegador, a sessão é revogada (todos os tokens do usuário)
 * e o evento session_anomaly é registrado. Memoizada por requisição com cache().
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const jar = await cookies();
  const value = jar.get(ADMIN_SESSION_COOKIE)?.value;
  const sid = jar.get(ADMIN_SESSION_ID_COOKIE)?.value;
  if (!value || !sid || !/^[a-f0-9]{64}$/.test(sid)) return null;

  try {
    // Assinatura + expiração do cookie: verificação local (chaves públicas do Google em cache).
    const decoded = await getAdminAuth().verifySessionCookie(value, false);
    if (decoded.admin !== true) return null;

    // As duas consultas de rede rodam EM PARALELO (antes eram 3 em sequência, ~1 s por tela):
    //  - usuário no Firebase Auth → revogação (o mesmo que checkRevoked faz) + nome/foto atuais;
    //  - registro da sessão no Firestore → mesmo usuário, validade e mesmo navegador.
    const ref = getAdminDb().collection(SESSIONS_COLLECTION).doc(sid);
    const [user, snap] = await Promise.all([getAdminAuth().getUser(decoded.uid), ref.get()]);

    // Revogação, exatamente como o checkRevoked do Firebase: conta desativada ou tokens revogados
    // depois do login (revokeRefreshTokens no logout, "revoke" ou anomalia de sessão).
    if (user.disabled) return null;
    const validSinceSeconds = user.tokensValidAfterTime ? new Date(user.tokensValidAfterTime).getTime() / 1000 : 0;
    if (decoded.auth_time < validSinceSeconds) return null;
    // Claim atual (não só a do cookie): admin removido pelo "revoke" perde acesso na hora.
    if (user.customClaims?.admin !== true) return null;

    const record = snap.data() as SessionRecord | undefined;
    if (!record || record.uid !== decoded.uid || record.expires_at_ms < Date.now()) return null;

    const ctx = getContextFromHeaders(await headers());
    if (record.ua_hash !== userAgentHash(ctx)) {
      await getAdminAuth().revokeRefreshTokens(decoded.uid).catch(() => undefined);
      await ref.delete().catch(() => undefined);
      await tryLogAdminEvent(ctx, {
        event: "session_anomaly",
        uid: decoded.uid,
        email: decoded.email ?? null,
        reason: "user_agent_mismatch",
      });
      return null;
    }

    // Nome/foto/e-mail ATUAIS (do mesmo getUser): mudanças com set-name/set-photo aparecem sem relogar.
    return {
      uid: decoded.uid,
      email: user.email ?? decoded.email ?? null,
      name: user.displayName?.trim() || (typeof decoded.name === "string" ? decoded.name : null),
      picture: user.photoURL || (typeof decoded.picture === "string" ? decoded.picture : null),
    };
  } catch {
    return null;
  }
});

export interface AdminProfile {
  email: string | null;
  name: string | null;
  picture: string | null;
}

/**
 * Perfil atual (nome/foto/e-mail). Já vem atualizado do Firebase Auth dentro de getAdminSession
 * (mesma consulta da checagem de revogação) — aqui não há nenhuma ida extra à rede.
 */
export const getAdminProfile = cache(async (session: AdminSession): Promise<AdminProfile> => ({
  email: session.email,
  name: session.name,
  picture: session.picture,
}));
