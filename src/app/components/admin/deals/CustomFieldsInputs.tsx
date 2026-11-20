"use client";

import type { CustomField } from "@/lib/admin/crm/types";
import type { FieldErrors } from "@/lib/admin/crm/validation";
import { maskCurrencyBRL } from "@/utils/masks";
import { Field, Select, TextInput, inputClass } from "../form/Field";

interface CustomFieldsInputsProps {
  fields: CustomField[];
  values: Record<string, unknown>;
  errors: FieldErrors;
  onChange: (id: string, value: string | boolean) => void;
}

/** Campos personalizados do funil (texto, número, moeda, data, lista, sim/não). */
export default function CustomFieldsInputs({ fields, values, errors, onChange }: CustomFieldsInputsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const raw = values[field.id];
        const value = typeof raw === "string" ? raw : typeof raw === "number" ? (field.type === "currency" ? maskCurrencyBRL(String(raw)) : String(raw)) : "";
        const error = errors[`custom_${field.id}`];
        if (field.type === "boolean") {
          return (
            <label key={field.id} className="flex h-11 cursor-pointer items-center gap-3 self-end rounded-lg bg-admin-input px-3.5 text-sm font-medium text-admin-text-input outline outline-1 -outline-offset-1 outline-admin-input-border">
              <input type="checkbox" checked={raw === true || raw === "true"} onChange={(e) => onChange(field.id, e.target.checked)} className="h-4 w-4 accent-admin-primary" />
              {field.label}
            </label>
          );
        }
        return (
          <Field key={field.id} label={field.label} required={field.required} error={error}>
            {(p) =>
              field.type === "select" ? (
                <Select {...p} placeholder="Selecione" options={field.options.map((o) => ({ value: o, label: o }))} value={value} onChange={(e) => onChange(field.id, e.target.value)} />
              ) : field.type === "date" ? (
                <input {...p} type="date" value={value} onChange={(e) => onChange(field.id, e.target.value)} className={`${inputClass} h-11`} />
              ) : (
                <TextInput
                  {...p}
                  inputMode={field.type === "number" || field.type === "currency" ? "decimal" : undefined}
                  maxLength={500}
                  value={value}
                  placeholder={field.type === "currency" ? "R$ 0,00" : undefined}
                  onChange={(e) => onChange(field.id, field.type === "currency" ? maskCurrencyBRL(e.target.value) : e.target.value)}
                />
              )
            }
          </Field>
        );
      })}
    </div>
  );
}
