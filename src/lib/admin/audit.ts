import "server-only";
import { after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendAdminAlert } from "./alerts";
import type { RequestContext } from "./requestContext";

export type AdminAuditEvent =
  | "login_success"
  | "login_failed"
  | "mfa_failed"
  | "mfa_enrolled"
  | "blocked"
  | "session_anomaly"
  | "logout";

interface AuditInput {
  event: AdminAuditEvent;
  email?: string | null;
  uid?: string | null;
  reason?: string | null;
}

/** Eventos que disparam alerta em tempo real (webhook). */
const ALERT_EVENTS: Partial<Record<AdminAuditEvent, string>> = {
  login_success: "✅ Login no painel",
  mfa_enrolled: "🔐 Novo autenticador 2FA cadastrado",
  blocked: "⛔ Bloqueio no login do painel",
  session_anomaly: "🚨 Sessão do painel usada em outro dispositivo — sessão revogada",
};

function formatAlert(title: string, ctx: RequestContext, input: AuditInput): string {
  const place = [ctx.geo.city, ctx.geo.region, ctx.geo.country].filter(Boolean).join(", ") || "local desconhecido";
  return [
    `**${title}**`,
    `Email: ${input.email ?? "—"}`,
    input.reason ? `Motivo: ${input.reason}` : null,
    `IP: ${ctx.ip} (${place})`,
    `Navegador: ${ctx.userAgent.slice(0, 120) || "—"}`,
    `Quando: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Grava um evento de acesso ao painel em admin_login_logs (IP, localização aproximada,
 * user-agent e horário do servidor). Lança erro se a gravação falhar — quem chama decide
 * se isso deve impedir a ação (no login bem-sucedido, impede).
 */
export async function logAdminEvent(ctx: RequestContext, input: AuditInput): Promise<void> {
  await getAdminDb()
    .collection("admin_login_logs")
    .add({
      event: input.event,
      email: input.email ? input.email.toLowerCase().slice(0, 254) : null,
      uid: input.uid ?? null,
      reason: input.reason ?? null,
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      geo: ctx.geo,
      created_at: FieldValue.serverTimestamp(),
    });

  const title = ALERT_EVENTS[input.event];
  if (title) {
    // Depois da resposta, para não atrasar o login.
    after(() => sendAdminAlert(formatAlert(title, ctx, input)));
  }
}

/** Versão "melhor esforço" para eventos de falha: nunca derruba a resposta. */
export async function tryLogAdminEvent(ctx: RequestContext, input: AuditInput): Promise<void> {
  try {
    await logAdminEvent(ctx, input);
  } catch {
    console.error("admin audit log failed", input.event);
  }
}
