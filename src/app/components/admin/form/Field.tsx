"use client";

import { useId } from "react";
import { FaChevronDown } from "react-icons/fa6";
import type { Option } from "@/lib/admin/crm/options";

/** Base visual dos campos (design: fundo #0D0D0D, borda #3B3B3B, 44px de altura, raio 8). */
export const inputClass =
  "w-full min-w-0 rounded-lg bg-admin-input px-3.5 text-sm font-medium leading-5 text-admin-text-input outline outline-1 -outline-offset-1 outline-admin-input-border placeholder:text-admin-text-hint transition-[outline-color] focus:outline-2 focus:outline-admin-primary aria-[invalid=true]:outline-admin-danger [color-scheme:dark]";

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  /** Texto de apoio abaixo do campo. */
  hint?: string;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => React.ReactNode;
}

/** Rótulo + campo + mensagem de erro, com os ids de acessibilidade ligados. */
export function Field({ label, required, error, hint, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className={`flex min-w-0 flex-col gap-[3px] ${className ?? ""}`}>
      <label htmlFor={id} className="text-[13px] font-medium leading-[19px] text-admin-text-label">
        {label}
        {required && " *"}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": error || hint ? messageId : undefined })}
      {error ? (
        <p id={messageId} className="text-xs font-medium leading-[18px] text-admin-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-xs font-medium leading-[18px] text-admin-text-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

export function TextInput(props: InputProps) {
  return <input type="text" autoComplete="off" {...props} className={`${inputClass} h-11`} />;
}

type TextAreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & { heightClass?: string };

export function TextArea({ heightClass = "h-[74px]", ...props }: TextAreaProps) {
  return <textarea {...props} className={`${inputClass} ${heightClass} resize-y py-3`} />;
}

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className" | "children"> & {
  options: readonly Option[];
  /** Primeira opção vazia (ex.: "Selecione"). Sem ela, o select sempre tem um valor. */
  placeholder?: string;
};

/** Select nativo com o visual do painel (seta ⌄ à direita). */
export function Select({ options, placeholder, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select {...props} className={`${inputClass} h-11 cursor-pointer appearance-none pr-10`}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FaChevronDown
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-hint"
      />
    </div>
  );
}
