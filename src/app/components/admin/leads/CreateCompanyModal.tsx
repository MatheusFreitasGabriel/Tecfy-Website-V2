"use client";

import { useState } from "react";
import { companyRegions, companySegments, companySizes } from "@/lib/admin/crm/options";
import { validateCompanyForm, withoutKey, type CompanyForm, type FieldErrors } from "@/lib/admin/crm/validation";
import { maskCep, maskCnpj, maskPhoneNumber } from "@/utils/masks";
import Button from "../form/Button";
import { Field, Select, TextArea, TextInput } from "../form/Field";
import Modal from "../form/Modal";

interface CreateCompanyModalProps {
  initial: CompanyForm;
  onClose: () => void;
  /** Dados válidos → volta para o modal do lead (nada é gravado ainda). */
  onSubmit: (draft: CompanyForm) => void;
}

/** Sub-modal "Criar empresa": prepara a empresa; ela só é gravada junto com o lead. */
export default function CreateCompanyModal({ initial, onClose, onSubmit }: CreateCompanyModalProps) {
  const [form, setForm] = useState<CompanyForm>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = <K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((prev) => withoutKey(prev, key));
  };

  const submit = () => {
    const result = validateCompanyForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(form);
  };

  const text = (key: keyof CompanyForm, placeholder: string, mask?: (v: string) => string, extra?: React.InputHTMLAttributes<HTMLInputElement>) =>
    function Input(p: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) {
      return (
        <TextInput
          {...p}
          {...extra}
          value={form[key]}
          onChange={(e) => set(key, mask ? mask(e.target.value) : e.target.value)}
          placeholder={placeholder}
        />
      );
    };

  return (
    <Modal
      title="Criar empresa"
      description="Prepare a empresa. O cadastro será criado junto com o lead."
      onClose={onClose}
      widthClass="max-w-[880px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium leading-[18px] text-admin-text-description">Será salva no módulo Empresas.</p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} className="sm:w-[224px]">
              Vincular empresa
            </Button>
          </div>
        </div>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          // O modal fica num portal, mas o evento React ainda sobe para o modal do lead.
          event.preventDefault();
          event.stopPropagation();
          submit();
        }}
        className="grid grid-cols-1 gap-x-4 gap-y-[18px] sm:grid-cols-6"
      >
        <Field label="Nome fantasia" required error={errors.trade_name} className="sm:col-span-3">
          {text("trade_name", "Ex.: Mendes Consultoria")}
        </Field>
        <Field label="Razão social" error={errors.legal_name} className="sm:col-span-3">
          {text("legal_name", "Ex.: Mendes Consultoria Ltda.")}
        </Field>

        <Field label="CNPJ" error={errors.cnpj} className="sm:col-span-3">
          {text("cnpj", "00.000.000/0000-00", maskCnpj, { inputMode: "numeric" })}
        </Field>
        <Field label="Site" error={errors.website} className="sm:col-span-3">
          {text("website", "empresa.com.br", undefined, { inputMode: "url" })}
        </Field>

        <Field label="E-mail corporativo" error={errors.email} className="sm:col-span-3">
          {text("email", "contato@empresa.com.br", undefined, { type: "email", inputMode: "email" })}
        </Field>
        <Field label="Telefone corporativo" error={errors.phone} className="sm:col-span-3">
          {text("phone", "(11) 3333-0000", maskPhoneNumber, { type: "tel", inputMode: "tel" })}
        </Field>

        <Field label="Segmento" error={errors.segment} className="sm:col-span-3">
          {(p) => (
            <Select
              {...p}
              options={companySegments.options}
              placeholder="Não definido"
              value={form.segment}
              onChange={(e) => set("segment", e.target.value)}
            />
          )}
        </Field>
        <Field label="Porte" error={errors.size} className="sm:col-span-3">
          {(p) => (
            <Select
              {...p}
              options={companySizes.options}
              placeholder="Não definido"
              value={form.size}
              onChange={(e) => set("size", e.target.value)}
            />
          )}
        </Field>

        <Field label="Endereço" error={errors.street} className="sm:col-span-4">
          {text("street", "Rua, avenida...")}
        </Field>
        <Field label="Número / complemento" error={errors.number} className="sm:col-span-2">
          {text("number", "Ex.: 100 · Sala 2")}
        </Field>

        <Field label="CEP" error={errors.zip} className="sm:col-span-2">
          {text("zip", "00000-000", maskCep, { inputMode: "numeric" })}
        </Field>
        <Field label="Bairro" error={errors.district} className="sm:col-span-4">
          {text("district", "Ex.: Centro")}
        </Field>

        <Field label="Cidade" error={errors.city} className="sm:col-span-3">
          {text("city", "Ex.: São Paulo")}
        </Field>
        <Field label="Estado / país" error={errors.region} className="sm:col-span-3">
          {(p) => (
            <Select
              {...p}
              options={companyRegions.options}
              placeholder="Não definido"
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
            />
          )}
        </Field>

        <Field label="Observações da empresa" error={errors.notes} className="sm:col-span-6">
          {(p) => (
            <TextArea
              {...p}
              heightClass="h-[52px]"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Ex.: Equipe comercial em expansão."
            />
          )}
        </Field>

        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
