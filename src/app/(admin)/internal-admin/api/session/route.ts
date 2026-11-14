import QRCode from "qrcode";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { verifyTurnstile } from "@/lib/turnstile";
import { validateEmail } from "@/shemas/validationSchema";
import { tryLogAdminEvent } from "@/lib/admin/audit";
import { findTotpEnrollmentId, signInWithPassword, startTotpEnrollment } from "@/lib/admin/identityToolkit";
import {
  EMAIL_MAX,
  PASSWORD_MAX,
  errorResponse,
  isServiceError,
  lockKeysFor,
  recordAuthFailure,
} from "@/lib/admin/loginFlow";
import { PENDING_TTL_SECONDS, newPendingId, sealPending } from "@/lib/admin/pendingCookie";
import { hitIp, isAnyLocked } from "@/lib/admin/rateLimit";
import { attemptContextHash, getRequestContext, guardAdminRequest, readGuardedJson } from "@/lib/admin/requestContext";
import { clearPendingCookie, clearSessionCookies, getAdminSession, setPendingCookie } from "@/lib/admin/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Etapa 1 do login: email + senha + Turnstile.
 * Resposta: { step: "mfa" } ou { step: "enroll", qr, secret } (cadastro do 2FA, só com janela liberada).
 * Nunca cria sessão aqui — a sessão só nasce depois do código TOTP.
 *
 * Ordem das checagens (das mais baratas para as mais caras, para não pagar Firestore por bot):
 * gate/origem/JSON → validação → Turnstile → rate limit (Firestore) → Firebase Auth.
 */
export async function POST(request: Request) {
  const ctx = getRequestContext(request);

  try {
    const body = await readGuardedJson(request);
    if (body instanceof Response) return body;

    const { email, password, turnstile_token } = body;
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof turnstile_token !== "string" ||
      email.length > EMAIL_MAX ||
      password.length === 0 ||
      password.length > PASSWORD_MAX ||
      turnstile_token.length === 0 ||
      turnstile_token.length > 4096
    ) {
      return errorResponse.invalidInput();
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!validateEmail(normalizedEmail)) return errorResponse.invalidInput();

    // Turnstile antes de qualquer acesso ao banco: bot não gera custo nem gravação.
    if (!(await verifyTurnstile(turnstile_token, ctx.ip, "admin_login"))) {
      console.warn("admin login: turnstile rejected");
      return errorResponse.turnstile();
    }

    if (!(await hitIp(ctx.ip))) {
      await tryLogAdminEvent(ctx, { event: "blocked", email: normalizedEmail, reason: "ip_rate_limited" });
      return errorResponse.tooMany();
    }

    if (await isAnyLocked(lockKeysFor(normalizedEmail, ctx.ip))) {
      await tryLogAdminEvent(ctx, { event: "blocked", email: normalizedEmail, reason: "email_locked" });
      return errorResponse.tooMany();
    }

    const signIn = await signInWithPassword(normalizedEmail, password);
    if (!signIn.ok) {
      if (isServiceError(signIn.code)) {
        console.error("admin sign-in service error", signIn.code);
        return errorResponse.unavailable();
      }
      await recordAuthFailure(ctx, normalizedEmail, "login_failed", signIn.code);
      return errorResponse.invalidCredentials();
    }

    const uid = signIn.data.localId;

    // Só quem tem a claim admin passa. Mesmo erro genérico para não revelar nada.
    const user = await getAdminAuth().getUser(uid);
    if (user.disabled || user.customClaims?.admin !== true) {
      await recordAuthFailure(ctx, normalizedEmail, "login_failed", "not_admin", uid);
      return errorResponse.invalidCredentials();
    }

    const base = {
      uid,
      email: normalizedEmail,
      attempts: 0,
      exp: Date.now() + PENDING_TTL_SECONDS * 1000,
      ctx: attemptContextHash(ctx),
      jti: newPendingId(),
    };

    // Usuário com 2FA já cadastrado → pede o código.
    if (signIn.data.mfaPendingCredential) {
      const enrollmentId = findTotpEnrollmentId(signIn.data.mfaInfo);
      if (!enrollmentId) {
        await recordAuthFailure(ctx, normalizedEmail, "login_failed", "no_totp_factor", uid);
        return errorResponse.invalidCredentials();
      }
      await setPendingCookie(
        sealPending({
          ...base,
          kind: "mfa",
          mfaPendingCredential: signIn.data.mfaPendingCredential,
          mfaEnrollmentId: enrollmentId,
        })
      );
      return Response.json({ step: "mfa" });
    }

    // Admin sem 2FA: o cadastro do autenticador SÓ é permitido dentro da janela liberada
    // pelo dono (scripts/admin-setup.mjs allow-enroll). Sem ela, quem tiver apenas a senha
    // não consegue registrar o próprio celular.
    const enrollUntil = user.customClaims?.mfa_enroll_until;
    if (typeof enrollUntil !== "number" || enrollUntil < Date.now()) {
      await recordAuthFailure(ctx, normalizedEmail, "login_failed", "enroll_not_allowed", uid);
      return errorResponse.invalidCredentials();
    }

    if (!signIn.data.idToken) return errorResponse.unavailable();
    const enrollment = await startTotpEnrollment(signIn.data.idToken);
    if (!enrollment.ok) {
      console.error("admin totp enrollment start failed", enrollment.code);
      return errorResponse.unavailable();
    }

    const { sharedSecretKey, sessionInfo, hashingAlgorithm, verificationCodeLength, periodSec } =
      enrollment.data.totpSessionInfo;
    const issuer = "Tecfy Painel";
    const otpauth =
      `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(normalizedEmail)}` +
      `?secret=${sharedSecretKey}&issuer=${encodeURIComponent(issuer)}` +
      `&algorithm=${(hashingAlgorithm ?? "SHA1").replace("-", "")}` +
      `&digits=${verificationCodeLength ?? 6}&period=${periodSec ?? 30}`;
    const qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 220, color: { dark: "#000000", light: "#ffffff" } });

    await setPendingCookie(sealPending({ ...base, kind: "enroll", idToken: signIn.data.idToken, sessionInfo }));
    return Response.json({ step: "enroll", qr, secret: sharedSecretKey });
  } catch (error) {
    console.error("admin login error", error instanceof Error ? error.message : "unknown");
    await clearPendingCookie().catch(() => undefined);
    return errorResponse.unavailable();
  }
}

/** Logout: revoga todos os tokens do usuário no Firebase, apaga o registro da sessão e os cookies. */
export async function DELETE(request: Request) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  const ctx = getRequestContext(request);
  const session = await getAdminSession();
  try {
    if (session) {
      await getAdminAuth().revokeRefreshTokens(session.uid);
      await tryLogAdminEvent(ctx, { event: "logout", uid: session.uid, email: session.email });
    }
  } finally {
    await clearSessionCookies();
  }
  return Response.json({ ok: true });
}
