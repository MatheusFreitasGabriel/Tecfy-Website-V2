"use client";

import { useRef, useState } from "react";
import { FaGear, FaPaperPlane, FaTriangleExclamation } from "react-icons/fa6";
import { TEMPLATE_VARIABLES, fillTemplate, type TemplateContext } from "@/lib/admin/crm/templates";
import type { LeadEmailRow, MessageTemplate } from "@/lib/admin/crm/types";
import { EMAIL_LIMITS, validateSendEmail, withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import { Field, Select, TextInput } from "../form/Field";
import Modal from "../form/Modal";

interface EmailComposerProps {
  basePath: string;
  leadId: string;
  /** E-mails permitidos (do lead e do contato vinculado). */
  recipients: { label: string; email: string }[];
  templates: MessageTemplate[];
  context: TemplateContext;
  /** O envio está configurado no servidor (Resend)? */
  configured: boolean;
  onClose: () => void;
  /** Registro do e-mail enviado (a tela acrescenta no histórico sem buscar de novo). */
  onSent: (email: LeadEmailRow | null) => void;
  onManageTemplates: () => void;
  /** URL de envio (padrão: e-mail do lead). A negociação usa a dela. */
  endpoint?: string;
}

const signatureFor = (ctx: TemplateContext) => `\n\n${ctx.owner ?? "Equipe"}\nTecfy · tecfy.dev`;

const SERVER_ERRORS: Record<number, string> = {
  400: "Confira o destinatário, o assunto e a mensagem.",
  401: "Sua sessão expirou. Entre de novo no painel.",
  404: "Este lead não existe mais.",
  502: "O serviço de e-mail recusou o envio. Confira o domínio no Resend e tente de novo.",
  503: "O envio de e-mail ainda não está configurado (RESEND_API_KEY e CRM_EMAIL_FROM).",
};

/** Compositor de e-mail estilo CRM: modelo, variáveis, assinatura e envio pelo Resend. */
export default function EmailComposer({
  basePath,
  leadId,
  recipients,
  templates,
  context,
  configured,
  onClose,
  onSent,
  onManageTemplates,
  endpoint,
}: EmailComposerProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const first = templates[0];
  const [to, setTo] = useState(recipients[0]?.email ?? "");
  const [templateId, setTemplateId] = useState(first?.id ?? "");
  const [subject, setSubject] = useState(first?.subject ? fillTemplate(first.subject, context) : "");
  const [body, setBody] = useState(first ? fillTemplate(first.body, context) + signatureFor(context) : signatureFor(context).trimStart());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject ? fillTemplate(t.subject, context) : "");
    setBody(fillTemplate(t.body, context) + signatureFor(context));
  };

  /** Insere a variável já preenchida onde está o cursor. */
  const insertVariable = (key: string) => {
    const value = fillTemplate(key, context);
    const el = bodyRef.current;
    if (!el) return setBody((b) => b + value);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + value + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const send = async () => {
    setFormError(null);
    const result = validateSendEmail({ to, subject, body });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSending(true);
    try {
      const response = await fetch(endpoint ?? `${basePath}/api/crm/leads/${leadId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.value),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setFormError(SERVER_ERRORS[response.status] ?? "Não foi possível enviar o e-mail. Tente de novo.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { email?: LeadEmailRow };
      onSent(data.email ?? null);
    } catch {
      setFormError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title="Enviar e-mail"
      description="O e-mail sai pelo CRM e as respostas chegam no seu e-mail."
      onClose={() => !sending && onClose()}
      widthClass="max-w-[760px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" icon={FaGear} onClick={onManageTemplates} disabled={sending}>
            Gerenciar modelos
          </Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              Cancelar
            </Button>
            <Button icon={FaPaperPlane} onClick={send} disabled={sending || !configured}>
              {sending ? "Enviando..." : "Enviar e-mail"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-[18px]">
        {!configured && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-admin-qual-hot px-4 py-3 text-sm font-medium text-admin-qual-hot-text">
            <FaTriangleExclamation aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            O envio ainda não está configurado. Adicione RESEND_API_KEY e CRM_EMAIL_FROM (Vercel e .env.local) com o domínio
            verificado no Resend. Você pode escrever o rascunho, mas não enviar.
          </p>
        )}
        {formError && (
          <p role="alert" className="rounded-lg bg-admin-danger/10 px-4 py-3 text-sm font-medium text-admin-danger">
            {formError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Para" error={errors.to}>
            {(p) => (
              <Select
                {...p}
                options={recipients.map((r) => ({ value: r.email, label: `${r.email} · ${r.label}` }))}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setErrors((x) => withoutKey(x, "to"));
                }}
              />
            )}
          </Field>
          <Field label="Modelo">
            {(p) => (
              <Select
                {...p}
                options={templates.map((t) => ({ value: t.id, label: t.name }))}
                placeholder={templates.length ? undefined : "Nenhum modelo"}
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label="Assunto" required error={errors.subject}>
          {(p) => (
            <TextInput
              {...p}
              maxLength={EMAIL_LIMITS.subject}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setErrors((x) => withoutKey(x, "subject"));
              }}
              placeholder="Assunto do e-mail"
            />
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <Field label="Mensagem" required error={errors.body}>
            {(p) => (
              <textarea
                {...p}
                ref={bodyRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setErrors((x) => withoutKey(x, "body"));
                }}
                placeholder="Escreva o e-mail..."
                className="h-72 w-full resize-y rounded-lg bg-admin-input px-3.5 py-3 text-sm font-medium leading-6 text-admin-text-input outline outline-1 -outline-offset-1 outline-admin-input-border placeholder:text-admin-text-hint focus:outline-2 focus:outline-admin-primary aria-[invalid=true]:outline-admin-danger"
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Inserir variável">
            <span className="mr-1 text-xs text-admin-text-hint">Inserir:</span>
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                title={v.description}
                onClick={() => insertVariable(v.key)}
                className="rounded-md bg-admin-badge px-2 py-1 font-mono text-[11px] text-admin-badge-text hover:bg-admin-card hover:text-text-primary"
              >
                {v.key}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
