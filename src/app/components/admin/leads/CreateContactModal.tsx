"use client";

import { useState } from "react";
import { contactChannels, contactConsents } from "@/lib/admin/crm/options";
import type { PickerOption } from "@/lib/admin/crm/types";
import {
  CONTACT_COMPANY_FROM_LEAD,
  CONTACT_COMPANY_NONE,
  validateContactForm,
  type ContactForm,
  type FieldErrors,
  withoutKey,
} from "@/lib/admin/crm/validation";
import { maskPhoneNumber } from "@/utils/masks";
import Button from "../form/Button";
import { Field, Select, TextArea, TextInput } from "../form/Field";
import Modal from "../form/Modal";

interface CreateContactModalProps {
  initial: ContactForm;
  /** Empresas existentes (para "Empresa" do contato). */
  companies: PickerOption[];
  /** Nome da empresa já vinculada ao lead, se houver (aparece na opção "Usar empresa vinculada ao lead"). */
  leadCompanyName: string | null;
  onClose: () => void;
  /** Dados válidos → quem chamou decide (no lead: volta sem gravar; avulso/edição: grava). */
  onSubmit: (draft: ContactForm) => void;
  /**
   * "lead" (padrão): sub-modal do lead, com a opção "empresa do lead".
   * "create" / "edit": tela Contatos (cadastro avulso / edição), sem essa opção.
   */
  mode?: "lead" | "create" | "edit";
  /** Gravando no servidor (avulso/edição). */
  busy?: boolean;
  /** Erro do servidor (ex.: e-mail já de outro contato). */
  serverError?: string | null;
}

const COPY = {
  lead: { title: "Criar contato", description: "Prepare o contato e vincule-o ao lead sem perder o preenchimento.", submit: "Vincular contato", hint: "Será salvo em Contatos ao criar o lead." },
  create: { title: "Criar contato", description: "Cadastre uma pessoa de contato.", submit: "Criar contato", hint: "O e-mail é único: não pode ser de outro contato." },
  edit: { title: "Editar contato", description: "Cada alteração fica registrada no histórico do contato.", submit: "Salvar alterações", hint: "O e-mail é único: não pode ser de outro contato." },
} as const;

/** Sub-modal "Criar contato": prepara o contato; ele só é gravado junto com o lead. */
export default function CreateContactModal({
  initial,
  companies,
  leadCompanyName,
  onClose,
  onSubmit,
  mode = "lead",
  busy = false,
  serverError = null,
}: CreateContactModalProps) {
  const copy = COPY[mode];
  const [form, setForm] = useState<ContactForm>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((prev) => withoutKey(prev, key));
  };

  const submit = () => {
    const result = validateContactForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(form);
  };

  const companyOptions = [
    ...(mode === "lead"
      ? [
          {
            value: CONTACT_COMPANY_FROM_LEAD,
            label: leadCompanyName ? `Usar empresa vinculada ao lead (${leadCompanyName})` : "Usar empresa vinculada ao lead",
          },
        ]
      : []),
    { value: CONTACT_COMPANY_NONE, label: "Sem empresa" },
    ...companies.map((c) => ({ value: c.id, label: c.label })),
  ];

  return (
    <Modal
      title={copy.title}
      description={copy.description}
      onClose={() => !busy && onClose()}
      widthClass="max-w-[720px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy} className="sm:w-[200px]">
            {busy ? "Salvando..." : copy.submit}
          </Button>
        </div>
      }
    >
      {serverError && (
        <p role="alert" className="mb-5 rounded-lg bg-admin-danger/10 px-4 py-3 text-sm font-medium text-admin-danger">
          {serverError}
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          // O modal fica num portal, mas o evento React ainda sobe para o modal do lead.
          event.preventDefault();
          event.stopPropagation();
          submit();
        }}
        className="grid grid-cols-1 gap-x-4 gap-y-[18px] sm:grid-cols-2"
      >
        <Field label="Nome completo" required error={errors.name} className="sm:col-span-2">
          {(p) => (
            <TextInput {...p} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Carolina Mendes" />
          )}
        </Field>

        <Field label="E-mail" error={errors.email}>
          {(p) => (
            <TextInput
              {...p}
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="nome@empresa.com"
            />
          )}
        </Field>
        <Field label="Telefone / WhatsApp" error={errors.phone}>
          {(p) => (
            <TextInput
              {...p}
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set("phone", maskPhoneNumber(e.target.value))}
              placeholder="(11) 99999-9999"
            />
          )}
        </Field>

        <Field label="Cargo" error={errors.role}>
          {(p) => <TextInput {...p} value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Ex.: Diretora comercial" />}
        </Field>
        <Field label="Canal de contato preferido" error={errors.preferred_channel}>
          {(p) => (
            <Select
              {...p}
              options={contactChannels.options}
              placeholder="Não definido"
              value={form.preferred_channel}
              onChange={(e) => set("preferred_channel", e.target.value)}
            />
          )}
        </Field>

        <Field label="Empresa" error={errors.company_choice} className="sm:col-span-2">
          {(p) => (
            <Select {...p} options={companyOptions} value={form.company_choice} onChange={(e) => set("company_choice", e.target.value)} />
          )}
        </Field>

        <Field label="Observações do contato" error={errors.notes} className="sm:col-span-2">
          {(p) => (
            <TextArea
              {...p}
              heightClass="h-[72px]"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Ex.: Responsável pela avaliação da solução."
            />
          )}
        </Field>

        <Field label="Permissão para comunicações" error={errors.comm_consent}>
          {(p) => (
            <Select {...p} options={contactConsents.options} value={form.comm_consent} onChange={(e) => set("comm_consent", e.target.value)} />
          )}
        </Field>
        <p className="self-end pb-3 text-xs font-medium leading-[18px] text-admin-text-description">
          {copy.hint}
        </p>

        {/* Enter em qualquer campo envia. */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
