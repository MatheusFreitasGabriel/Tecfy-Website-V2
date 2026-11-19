"use client";

import { useRef, useState } from "react";
import { FaCopy, FaEnvelope, FaPlus, FaTrash, FaWhatsapp } from "react-icons/fa6";
import { TEMPLATE_VARIABLES } from "@/lib/admin/crm/templates";
import type { MessageTemplate, TemplateChannel } from "@/lib/admin/crm/types";
import { TEMPLATE_LIMITS, validateTemplateForm, withoutKey, type FieldErrors, type TemplateForm } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import { Field, TextInput } from "../form/Field";
import Modal from "../form/Modal";

interface TemplatesManagerProps {
  basePath: string;
  templates: MessageTemplate[];
  initialChannel?: TemplateChannel;
  /** Lista atualizada devolvida pelo servidor (a tela troca sem recarregar). */
  onChange: (templates: MessageTemplate[]) => void;
  onClose: () => void;
}

type Editing = { id: string | null; form: TemplateForm };

const emptyForm = (channel: TemplateChannel): TemplateForm => ({ channel, name: "", subject: "", body: "" });

/** Lista, cria, edita e exclui modelos de WhatsApp e e-mail. Os padrões só podem ser duplicados. */
export default function TemplatesManager({ basePath, templates, initialChannel = "whatsapp", onChange, onClose }: TemplatesManagerProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [channel, setChannel] = useState<TemplateChannel>(initialChannel);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const list = templates.filter((t) => t.channel === channel);

  const startNew = () => {
    setEditing({ id: null, form: emptyForm(channel) });
    setErrors({});
  };
  const startEdit = (t: MessageTemplate) => {
    setEditing({ id: t.builtin ? null : t.id, form: { channel: t.channel, name: t.builtin ? `${t.name} (cópia)` : t.name, subject: t.subject ?? "", body: t.body } });
    setErrors({});
  };
  const setField = (key: keyof TemplateForm, value: string) => {
    setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e));
    setErrors((x) => withoutKey(x, key));
  };

  const call = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${basePath}/api/crm/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setMessage({ tone: "error", text: response.status === 401 ? "Sua sessão expirou." : "Não foi possível salvar. Tente de novo." });
        return false;
      }
      const data = (await response.json().catch(() => ({}))) as { templates?: MessageTemplate[] };
      if (data.templates) onChange(data.templates);
      setMessage({ tone: "success", text: success });
      return true;
    } catch {
      setMessage({ tone: "error", text: "Sem conexão com o servidor." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const result = validateTemplateForm(editing.form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const ok = await call(
      editing.id ? { action: "update", id: editing.id, data: editing.form } : { action: "create", data: editing.form },
      editing.id ? "Modelo atualizado." : "Modelo criado.",
    );
    if (ok) setEditing(null);
  };

  const remove = async (id: string) => {
    const ok = await call({ action: "delete", id }, "Modelo excluído.");
    if (ok && editing?.id === id) setEditing(null);
  };

  const insertVariable = (key: string) => {
    if (!editing) return;
    const el = bodyRef.current;
    const body = editing.form.body;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setField("body", body.slice(0, start) + key + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + key.length, start + key.length);
    });
  };

  return (
    <Modal
      title="Modelos de mensagem"
      description="Textos prontos para WhatsApp e e-mail. As variáveis são trocadas pelos dados do lead."
      onClose={() => !busy && onClose()}
      widthClass="max-w-[960px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div role="tablist" aria-label="Canal" className="flex gap-2">
          {(
            [
              ["whatsapp", "WhatsApp", FaWhatsapp],
              ["email", "E-mail", FaEnvelope],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={channel === value}
              onClick={() => {
                setChannel(value);
                setEditing(null);
              }}
              className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors ${
                channel === value ? "bg-admin-primary text-text-primary" : "bg-admin-card text-admin-text-label hover:bg-admin-badge"
              }`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium ${message.tone === "error" ? "bg-admin-danger/10 text-admin-danger" : "bg-admin-success/10 text-admin-success"}`}
          >
            {message.text}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <Button variant="secondary" icon={FaPlus} block onClick={startNew} disabled={busy}>
              Novo modelo
            </Button>
            <ul className="flex flex-col gap-1.5">
              {list.map((t) => (
                <li key={t.id}>
                  <div
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${editing && editing.id === t.id ? "bg-admin-badge" : "bg-admin-drawer-card"}`}
                  >
                    <button type="button" onClick={() => startEdit(t)} className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="truncate text-sm font-medium text-text-primary">{t.name}</span>
                      <span className="truncate text-xs text-admin-text-hint">{t.builtin ? "Padrão · clique para duplicar" : "Personalizado"}</span>
                    </button>
                    {t.builtin ? (
                      <FaCopy aria-hidden className="h-3 w-3 shrink-0 text-admin-text-hint" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        disabled={busy}
                        aria-label={`Excluir modelo ${t.name}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-admin-text-hint hover:bg-admin-badge hover:text-admin-danger"
                      >
                        <FaTrash aria-hidden className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {editing ? (
            <div className="flex flex-col gap-4">
              <Field label="Nome do modelo" required error={errors.name}>
                {(p) => <TextInput {...p} maxLength={TEMPLATE_LIMITS.name} value={editing.form.name} onChange={(e) => setField("name", e.target.value)} />}
              </Field>
              {channel === "email" && (
                <Field label="Assunto" required error={errors.subject}>
                  {(p) => <TextInput {...p} maxLength={TEMPLATE_LIMITS.subject} value={editing.form.subject} onChange={(e) => setField("subject", e.target.value)} />}
                </Field>
              )}
              <Field label="Mensagem" required error={errors.body}>
                {(p) => (
                  <textarea
                    {...p}
                    ref={bodyRef}
                    value={editing.form.body}
                    maxLength={TEMPLATE_LIMITS.body}
                    onChange={(e) => setField("body", e.target.value)}
                    className="h-56 w-full resize-y rounded-lg bg-admin-input px-3.5 py-3 text-sm font-medium leading-6 text-admin-text-input outline outline-1 -outline-offset-1 outline-admin-input-border focus:outline-2 focus:outline-admin-primary aria-[invalid=true]:outline-admin-danger"
                  />
                )}
              </Field>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Inserir variável">
                <span className="mr-1 text-xs text-admin-text-hint">Variáveis:</span>
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
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
                  Cancelar
                </Button>
                <Button onClick={save} disabled={busy}>
                  {busy ? "Salvando..." : editing.id ? "Salvar alterações" : "Criar modelo"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-admin-card-border p-8 text-center text-sm text-admin-text-hint">
              Escolha um modelo para editar, duplique um padrão ou crie um novo.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
