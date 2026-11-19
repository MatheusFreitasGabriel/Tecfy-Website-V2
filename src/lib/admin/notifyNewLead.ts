import "server-only";
import { sendAdminAlert } from "@/lib/admin/alerts";
import { escapeHtml, isEmailConfigured, sendViaResend } from "@/lib/admin/crm/email";
import { whatsappLink } from "@/lib/admin/crm/templates";
import { maskPhoneNumber } from "@/utils/masks";

/**
 * Avisos de lead novo pelo site (chamado com `after()`, depois da resposta ao visitante):
 *  1. e-mail para LEAD_NOTIFY_EMAIL (padrão contato@tecfy.dev) via Resend, com telefone e botão do WhatsApp;
 *  2. mensagem no webhook ADMIN_ALERT_WEBHOOK_URL (Discord/Slack), se configurado — notificação no celular.
 * Melhor esforço: falhas só vão para o log; o lead já foi salvo.
 * O link do painel NÃO vai no e-mail (o endereço do painel é secreto).
 */

export interface NewLeadInfo {
  name: string;
  email: string;
  /** Só dígitos. */
  phone: string;
  /** "Plano Pro" ou "Website". */
  planLabel: string;
  /** Já era lead e preencheu o site de novo. */
  returning?: boolean;
}

const NOTIFY_TO = () => process.env.LEAD_NOTIFY_EMAIL?.trim() || "contato@tecfy.dev";

function whenInBrazil(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildEmail(lead: NewLeadInfo, waUrl: string, when: string) {
  const phone = maskPhoneNumber(lead.phone);
  const heading = lead.returning ? "🔁 Lead voltou pelo site" : "🔔 Novo lead pelo site";
  const subject = `${heading}: ${lead.name} (${lead.planLabel})`;
  const text = [
    lead.returning ? "Lead voltou pelo site (já estava cadastrado — costuma ser lead quente)" : "Novo lead pelo site",
    "",
    `Nome: ${lead.name}`,
    `E-mail: ${lead.email}`,
    `Telefone: ${phone}`,
    `Interesse: ${lead.planLabel}`,
    `Recebido em: ${when}`,
    "",
    `Chamar no WhatsApp: ${waUrl}`,
    "",
    "Responda este e-mail para falar direto com o lead.",
  ].join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b6b6b;font-size:13px;width:110px">${label}</td><td style="padding:6px 0;color:#111;font-size:15px;font-weight:600">${value}</td></tr>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#3901FB;color:#fff;padding:20px 24px;font-size:18px;font-weight:700">${heading}</div>
  ${lead.returning ? '<div style="background:#FFF4E5;color:#8a4b00;padding:10px 24px;font-size:13px">Esta pessoa já estava cadastrada e entrou em contato de novo — costuma ser lead quente.</div>' : ""}
  <div style="padding:20px 24px">
    <table style="width:100%;border-collapse:collapse">
      ${row("Nome", escapeHtml(lead.name))}
      ${row("E-mail", `<a href="mailto:${escapeHtml(lead.email)}" style="color:#3901FB">${escapeHtml(lead.email)}</a>`)}
      ${row("Telefone", escapeHtml(phone))}
      ${row("Interesse", escapeHtml(lead.planLabel))}
      ${row("Recebido em", escapeHtml(when))}
    </table>
    <a href="${escapeHtml(waUrl)}" style="display:block;margin-top:20px;background:#25D366;color:#fff;text-align:center;padding:14px;border-radius:10px;font-size:16px;font-weight:700;text-decoration:none">Chamar no WhatsApp</a>
    <p style="margin:16px 0 0;color:#6b6b6b;font-size:12px;text-align:center">Responda este e-mail para falar direto com o lead.</p>
  </div>
</div></body></html>`;

  return { subject, text, html };
}

export async function notifyNewWebsiteLead(lead: NewLeadInfo): Promise<void> {
  const firstName = lead.name.split(/\s+/)[0] ?? lead.name;
  const waUrl = whatsappLink(
    lead.phone,
    `Olá, ${firstName}! Aqui é da Tecfy. Recebemos seu contato pelo site sobre o ${lead.planLabel === "Website" ? "nosso serviço" : lead.planLabel}. Podemos conversar?`,
  );
  const when = whenInBrazil(new Date());

  const tasks: Promise<unknown>[] = [
    sendAdminAlert(
      `${lead.returning ? "🔁 Lead voltou pelo site" : "🔔 Novo lead pelo site"}: ${lead.name} · ${lead.planLabel} · ${maskPhoneNumber(lead.phone)}\nWhatsApp: ${waUrl}`,
    ),
  ];
  if (isEmailConfigured()) {
    const { subject, html, text } = buildEmail(lead, waUrl, when);
    // reply-to = o próprio lead: responder a notificação já fala com ele.
    tasks.push(sendViaResend({ to: NOTIFY_TO(), subject, html, text, replyTo: lead.email }));
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.error("new lead notification failed", r.reason instanceof Error ? r.reason.message : "unknown");
  }
}
