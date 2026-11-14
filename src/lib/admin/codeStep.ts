import "server-only";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { logAdminEvent, tryLogAdminEvent } from "./audit";
import { finalizeTotpEnrollment, finalizeTotpSignIn } from "./identityToolkit";
import { CODE_REGEX, errorResponse, isServiceError, lockKeysFor, recordAuthFailure } from "./loginFlow";
import { PENDING_MAX_ATTEMPTS, openPending, sealPending } from "./pendingCookie";
import { clearFailures, hitIp, ipKey, isAnyLocked } from "./rateLimit";
import { attemptContextHash, getRequestContext, readGuardedJson } from "./requestContext";
import { clearPendingCookie, clearSessionCookies, establishSession, readPendingCookie, setPendingCookie } from "./session";

/**
 * Etapa 2 do login (código de 6 dígitos), compartilhada entre:
 *  - "mfa":    admin que já tem autenticador → finaliza o login com o código;
 *  - "enroll": primeiro acesso dentro da janela liberada → confirma o cadastro do autenticador.
 *
 * Ordem: gate/origem/JSON → cookie temporário (sem custo) → formato do código →
 * rate limit (Firestore) → Firebase Auth → sessão → auditoria.
 */
export async function handleCodeStep(request: Request, kind: "mfa" | "enroll"): Promise<Response> {
  const ctx = getRequestContext(request);

  try {
    const body = await readGuardedJson(request);
    if (body instanceof Response) return body;

    const pending = openPending(await readPendingCookie(), attemptContextHash(ctx));
    if (!pending || pending.kind !== kind) {
      await clearPendingCookie();
      return errorResponse.expired();
    }

    const { code } = body;
    if (typeof code !== "string" || !CODE_REGEX.test(code)) return errorResponse.invalidInput();

    if (!(await hitIp(ctx.ip))) {
      await tryLogAdminEvent(ctx, { event: "blocked", email: pending.email, uid: pending.uid, reason: "ip_rate_limited" });
      return errorResponse.tooMany();
    }

    const lockKeys = lockKeysFor(pending.email, ctx.ip);
    if (await isAnyLocked(lockKeys)) {
      await clearPendingCookie();
      await tryLogAdminEvent(ctx, { event: "blocked", email: pending.email, uid: pending.uid, reason: "email_locked" });
      return errorResponse.tooMany();
    }

    const result =
      pending.kind === "mfa"
        ? await finalizeTotpSignIn(pending.mfaPendingCredential, pending.mfaEnrollmentId, code)
        : await finalizeTotpEnrollment(pending.idToken, pending.sessionInfo, code);

    if (!result.ok) {
      if (isServiceError(result.code)) {
        console.error(`admin ${kind} service error`, result.code);
        return errorResponse.unavailable();
      }
      const reason = kind === "enroll" ? `enroll_${result.code}` : result.code;
      await recordAuthFailure(ctx, pending.email, "mfa_failed", reason, pending.uid);
      const attempts = pending.attempts + 1;
      if (attempts >= PENDING_MAX_ATTEMPTS) {
        await clearPendingCookie();
        return errorResponse.expired();
      }
      await setPendingCookie(sealPending({ ...pending, attempts }));
      return errorResponse.invalidCode();
    }

    if (kind === "enroll") {
      // Fecha a janela de cadastro imediatamente: ninguém mais cadastra outro autenticador.
      const auth = getAdminAuth();
      const user = await auth.getUser(pending.uid);
      const claims = { ...(user.customClaims ?? {}) };
      delete claims.mfa_enroll_until;
      await auth.setCustomUserClaims(pending.uid, claims);
      await tryLogAdminEvent(ctx, { event: "mfa_enrolled", email: pending.email, uid: pending.uid });
    }

    const sessionOk = await establishSession(result.data.idToken, pending.uid, ctx).catch(() => false);
    if (!sessionOk) {
      await clearSessionCookies();
      if (kind === "enroll") {
        // 2FA ativado, mas o token não comprova o 2º fator: pede login completo (senha + código).
        return Response.json({ step: "relogin" });
      }
      await recordAuthFailure(ctx, pending.email, "login_failed", "session_rejected", pending.uid);
      return errorResponse.invalidCredentials();
    }

    await clearFailures([...lockKeys, ipKey(ctx.ip)]).catch(() => undefined);

    // Todo login precisa ficar registrado: se a auditoria falhar, desfaz a sessão.
    try {
      await logAdminEvent(ctx, { event: "login_success", email: pending.email, uid: pending.uid });
    } catch {
      await clearSessionCookies();
      return errorResponse.unavailable();
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error(`admin ${kind} error`, error instanceof Error ? error.message : "unknown");
    return errorResponse.unavailable();
  }
}
