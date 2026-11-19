"use client";

import { leadQualifications, leadSources, leadStages, leadStatuses } from "@/lib/admin/crm/options";
import type { AdminUserOption } from "@/lib/admin/crm/types";
import type { FieldErrors, LeadForm } from "@/lib/admin/crm/validation";
import { maskCurrencyBRL, maskPhoneNumber } from "@/utils/masks";
import { Field, Select, TextArea, TextInput } from "../form/Field";
import TagsInput from "../form/TagsInput";

interface LeadFieldsProps {
  form: LeadForm;
  errors: FieldErrors;
  admins: AdminUserOption[];
  set: <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => void;
}

/** Campos do lead no modal "Criar lead". */
export default function LeadFields({ form, errors, admins, set }: LeadFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-[18px] sm:grid-cols-2">
      <Field label="Nome do lead" required error={errors.title} className="sm:col-span-2">
        {(p) => (
          <TextInput
            {...p}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Ex.: Consultoria comercial · Mendes"
          />
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

      <Field label="Responsável pela captura" required error={errors.owner_uid}>
        {(p) => (
          <Select
            {...p}
            options={admins.map((a) => ({ value: a.uid, label: a.name }))}
            placeholder={admins.length ? undefined : "Nenhum usuário disponível"}
            value={form.owner_uid}
            onChange={(e) => set("owner_uid", e.target.value)}
          />
        )}
      </Field>
      <Field label="Etapa inicial" error={errors.stage}>
        {(p) => <Select {...p} options={leadStages.options} value={form.stage} onChange={(e) => set("stage", e.target.value)} />}
      </Field>

      <Field label="Qualificação" error={errors.qualification}>
        {(p) => (
          <Select
            {...p}
            options={leadQualifications.options}
            value={form.qualification}
            onChange={(e) => set("qualification", e.target.value)}
          />
        )}
      </Field>
      <Field label="Status" error={errors.status}>
        {(p) => <Select {...p} options={leadStatuses.options} value={form.status} onChange={(e) => set("status", e.target.value)} />}
      </Field>

      <Field label="Origem do lead" error={errors.source}>
        {(p) => (
          <Select
            {...p}
            options={leadSources.options}
            placeholder="Não informada"
            value={form.source}
            onChange={(e) => set("source", e.target.value)}
          />
        )}
      </Field>
      <Field label="Campanha / referência" error={errors.campaign}>
        {(p) => (
          <TextInput
            {...p}
            value={form.campaign}
            onChange={(e) => set("campaign", e.target.value)}
            placeholder="Sem campanha vinculada"
          />
        )}
      </Field>

      <Field label="Valor estimado" error={errors.estimated_value}>
        {(p) => (
          <TextInput
            {...p}
            inputMode="numeric"
            value={form.estimated_value}
            onChange={(e) => set("estimated_value", maskCurrencyBRL(e.target.value))}
            placeholder="R$ 0,00"
          />
        )}
      </Field>
      <Field label="Previsão de fechamento" error={errors.expected_close_date}>
        {(p) => (
          <TextInput
            {...p}
            type="date"
            value={form.expected_close_date}
            onChange={(e) => set("expected_close_date", e.target.value)}
          />
        )}
      </Field>

      <Field label="Tags" error={errors.tags} hint="Enter ou vírgula para adicionar." className="sm:col-span-2">
        {(p) => (
          <TagsInput {...p} value={form.tags} onChange={(tags) => set("tags", tags)} placeholder="Ex.: Consultoria, B2B" />
        )}
      </Field>

      <Field label="Observações" error={errors.notes} className="sm:col-span-2">
        {(p) => (
          <TextArea
            {...p}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Ex.: Quer centralizar os contatos e acompanhar as oportunidades da equipe."
          />
        )}
      </Field>
    </div>
  );
}
