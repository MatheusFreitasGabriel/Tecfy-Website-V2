/**
 * Descreve o que mudou numa edição, para o registro automático da timeline:
 * "Telefone: (11) 9999-0000 → (11) 98888-7777 · Cargo: — → Diretora comercial".
 * Módulo puro (servidor e cliente).
 */
import { maskCep, maskCnpj, maskPhoneNumber } from "@/utils/masks";
import { companyRegions, companySegments, companySizes, contactChannels, contactConsents } from "./options";
import type { CompanyData, ContactData } from "./types";

type Formatter = (value: unknown) => string;

const text: Formatter = (v) => (typeof v === "string" && v ? v : "—");
const phone: Formatter = (v) => (typeof v === "string" && v ? maskPhoneNumber(v) : "—");
const option =
  (opts: { label: (v: string | null | undefined) => string }): Formatter =>
  (v) =>
    typeof v === "string" && v ? opts.label(v) : "—";
/** Textos longos (observações) não entram inteiros no histórico. */
const long: Formatter = (v) => (typeof v === "string" && v ? (v.length > 60 ? `${v.slice(0, 57)}…` : v) : "—");

interface FieldSpec {
  key: string;
  label: string;
  format: Formatter;
}

export const CONTACT_FIELDS: FieldSpec[] = [
  { key: "name", label: "Nome", format: text },
  { key: "email", label: "E-mail", format: text },
  { key: "phone", label: "Telefone", format: phone },
  { key: "role", label: "Cargo", format: text },
  { key: "preferred_channel", label: "Canal preferido", format: option(contactChannels) },
  { key: "comm_consent", label: "Permissão para comunicações", format: option(contactConsents) },
  { key: "notes", label: "Observações do cadastro", format: long },
];

export const COMPANY_FIELDS: FieldSpec[] = [
  { key: "trade_name", label: "Nome fantasia", format: text },
  { key: "legal_name", label: "Razão social", format: text },
  { key: "cnpj", label: "CNPJ", format: (v) => (typeof v === "string" && v ? maskCnpj(v) : "—") },
  { key: "website", label: "Site", format: text },
  { key: "email", label: "E-mail", format: text },
  { key: "phone", label: "Telefone", format: phone },
  { key: "segment", label: "Segmento", format: option(companySegments) },
  { key: "size", label: "Porte", format: option(companySizes) },
  { key: "address.street", label: "Endereço", format: text },
  { key: "address.number", label: "Número", format: text },
  { key: "address.zip", label: "CEP", format: (v) => (typeof v === "string" && v ? maskCep(v) : "—") },
  { key: "address.district", label: "Bairro", format: text },
  { key: "address.city", label: "Cidade", format: text },
  { key: "address.region", label: "Estado", format: option(companyRegions) },
  { key: "notes", label: "Observações do cadastro", format: long },
];

const read = (obj: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);

const norm = (v: unknown) => (v === undefined || v === "" ? null : v);

/** Lista "Campo: antes → depois" só dos campos que mudaram. */
export function describeChanges(fields: FieldSpec[], before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const changes: string[] = [];
  for (const field of fields) {
    const a = norm(read(before, field.key));
    const b = norm(read(after, field.key));
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    changes.push(`${field.label}: ${field.format(a)} → ${field.format(b)}`);
  }
  return changes;
}

export const describeContactChanges = (before: Record<string, unknown>, after: ContactData) =>
  describeChanges(CONTACT_FIELDS, before, after as unknown as Record<string, unknown>);
export const describeCompanyChanges = (before: Record<string, unknown>, after: CompanyData) =>
  describeChanges(COMPANY_FIELDS, before, after as unknown as Record<string, unknown>);
