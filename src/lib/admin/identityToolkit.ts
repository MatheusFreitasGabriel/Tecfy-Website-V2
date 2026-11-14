import "server-only";

/**
 * Chamadas à REST API do Firebase Auth (Identity Toolkit), feitas SOMENTE pelo servidor.
 * O navegador nunca fala com o Firebase: toda tentativa passa antes pelo Turnstile e
 * pelo rate limit das nossas rotas. A Web API key fica só no servidor (FIREBASE_WEB_API_KEY).
 */

const V1 = "https://identitytoolkit.googleapis.com/v1";
const V2 = "https://identitytoolkit.googleapis.com/v2";

export type ToolkitResult<T> = { ok: true; data: T } | { ok: false; code: string };

async function call<T>(url: string, body: Record<string, unknown>): Promise<ToolkitResult<T>> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) return { ok: false, code: "MISSING_API_KEY" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!response.ok || !data) {
      const code = data?.error?.message?.split(" ")[0] ?? `HTTP_${response.status}`;
      return { ok: false, code };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeoutId);
  }
}

interface MfaInfo {
  mfaEnrollmentId: string;
  displayName?: string;
  totpInfo?: Record<string, unknown>;
  phoneInfo?: string;
}

export interface PasswordSignInResult {
  localId: string;
  email?: string;
  /** Presente quando o usuário NÃO tem 2º fator. */
  idToken?: string;
  /** Presentes quando o usuário tem 2º fator cadastrado. */
  mfaPendingCredential?: string;
  mfaInfo?: MfaInfo[];
}

export function signInWithPassword(email: string, password: string) {
  return call<PasswordSignInResult>(`${V1}/accounts:signInWithPassword`, {
    email,
    password,
    returnSecureToken: true,
  });
}

export function finalizeTotpSignIn(mfaPendingCredential: string, mfaEnrollmentId: string, verificationCode: string) {
  return call<{ idToken: string }>(`${V2}/accounts/mfaSignIn:finalize`, {
    mfaPendingCredential,
    mfaEnrollmentId,
    totpVerificationInfo: { verificationCode },
  });
}

export interface TotpEnrollmentStart {
  totpSessionInfo: {
    sharedSecretKey: string;
    verificationCodeLength?: number;
    hashingAlgorithm?: string;
    periodSec?: number;
    sessionInfo: string;
  };
}

export function startTotpEnrollment(idToken: string) {
  return call<TotpEnrollmentStart>(`${V2}/accounts/mfaEnrollment:start`, {
    idToken,
    totpEnrollmentInfo: {},
  });
}

export function finalizeTotpEnrollment(idToken: string, sessionInfo: string, verificationCode: string) {
  return call<{ idToken: string }>(`${V2}/accounts/mfaEnrollment:finalize`, {
    idToken,
    displayName: "Autenticador",
    totpVerificationInfo: { sessionInfo, verificationCode },
  });
}

/** Retorna o enrollmentId do fator TOTP, se houver. */
export function findTotpEnrollmentId(mfaInfo: MfaInfo[] | undefined): string | null {
  return mfaInfo?.find((info) => info.totpInfo !== undefined)?.mfaEnrollmentId ?? null;
}
