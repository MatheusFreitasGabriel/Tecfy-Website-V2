import "server-only";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { CONTACTS_COLLECTION, LEAD_EMAILS_SUBCOLLECTION, LEADS_COLLECTION, type LeadEmailRow } from "./types";
import type { Actor } from "./leads";
import type { SendEmailForm } from "./validation";

/**
 * E-mails enviados pelo CRM para um lead, via Resend (https://resend.com).
 * Envs (server-only): RESEND_API_KEY e CRM_EMAIL_FROM (ex.: "Tecfy <comercial@tecfy.dev>").
 * O domínio do remetente precisa estar verificado no Resend.
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.CRM_EMAIL_FROM?.trim());
}

export class LeadNotFoundError extends Error {}
export class RecipientNotAllowedError extends Error {}
export class EmailProviderError extends Error {}

/**
 * Envio cru pelo Resend (remetente = CRM_EMAIL_FROM). Retorna o id do Resend.
 * Lança EmailProviderError se o Resend recusar ou a rede falhar.
 */
export async function sendViaResend(message: { to: string; subject: string; html: string; text: string; replyTo?: string | null }): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.CRM_EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new EmailProviderError("network");
  }
  const data = (await response.json().catch(() => ({}))) as { id?: string; name?: string };
  if (!response.ok) throw new EmailProviderError(data.name ?? `http_${response.status}`);
  return data.id ?? null;
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Texto digitado → HTML simples (parágrafos e quebras de linha), sempre escapado. */
function toHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">${paragraphs}</div>`;
}

/**
 * Envia o e-mail e registra no histórico do lead. O destinatário PRECISA ser o e-mail do próprio lead
 * ou do contato vinculado (o CRM não envia para qualquer endereço).
 */
export async function sendLeadEmail(leadId: string, input: SendEmailForm, actor: Actor, replyTo: string | null): Promise<void> {
  const db = getAdminDb();
  const leadRef = db.collection(LEADS_COLLECTION).doc(leadId);
  const lead = await leadRef.get();
  if (!lead.exists) throw new LeadNotFoundError();

  const allowed = new Set<string>();
  for (const value of [lead.get("email"), lead.get("lead_email")]) {
    if (typeof value === "string" && value) allowed.add(value.toLowerCase());
  }
  const contactId = lead.get("contact_id");
  if (typeof contactId === "string" && contactId) {
    const contact = await db.collection(CONTACTS_COLLECTION).doc(contactId).get();
    const email = contact.get("email");
    if (typeof email === "string" && email) allowed.add(email.toLowerCase());
  }
  if (!allowed.has(input.to)) throw new RecipientNotAllowedError();

  const history = leadRef.collection(LEAD_EMAILS_SUBCOLLECTION).doc();
  const record = {
    to: input.to,
    subject: input.subject,
    body: input.body,
    reply_to: replyTo,
    sent_by_uid: actor.uid,
    sent_by_name: actor.name,
    created_at: FieldValue.serverTimestamp(),
  };

  let providerId: string | null = null;
  try {
    providerId = await sendViaResend({ to: input.to, subject: input.subject, html: toHtml(input.body), text: input.body, replyTo });
  } catch (error) {
    const reason = error instanceof EmailProviderError ? error.message : "network";
    await history.create({ ...record, status: "failed", error: reason, provider_id: null }).catch(() => undefined);
    throw error instanceof EmailProviderError ? error : new EmailProviderError(reason);
  }

  const batch = db.batch();
  batch.create(history, { ...record, status: "sent", provider_id: providerId });
  batch.update(leadRef, { last_contact_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
  await batch.commit();
}

/** Últimos e-mails enviados para o lead (mais recentes primeiro). */
export async function listLeadEmails(leadId: string, limit = 20): Promise<LeadEmailRow[]> {
  const snap = await getAdminDb()
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(LEAD_EMAILS_SUBCOLLECTION)
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const created = d.created_at as Timestamp | undefined;
    return {
      id: doc.id,
      to: String(d.to ?? ""),
      subject: String(d.subject ?? ""),
      status: d.status === "sent" ? "sent" : "failed",
      sent_by_name: typeof d.sent_by_name === "string" ? d.sent_by_name : null,
      created_at: created && typeof created.toDate === "function" ? created.toDate().toISOString() : null,
    };
  });
}
