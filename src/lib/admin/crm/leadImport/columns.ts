/**
 * Importação de leads por planilha — parte PURA (cliente e servidor).
 * Colunas do modelo, conversão "como veio na planilha" → formulários do CRM e validação com os
 * MESMOS validadores do modal "Criar lead" (`crm/validation.ts`). O servidor revalida tudo.
 */
import {
  companyRegions,
  companySegments,
  companySizes,
  contactChannels,
  contactConsents,
  leadQualifications,
  leadSources,
  leadStages,
  leadStatuses,
  type Option,
} from "../options";
import type { CompanyData, ContactData, LeadData } from "../types";
import {
  CONTACT_COMPANY_FROM_LEAD,
  validateCompanyForm,
  validateContactForm,
  validateLeadForm,
  type CompanyForm,
  type ContactForm,
  type LeadForm,
} from "../validation";

export type ImportGroup = "lead" | "contact" | "company";

interface ColumnSpec {
  field: string;
  header: string;
  group: ImportGroup;
  required?: boolean;
  /** Lista de valores aceitos (aceita o rótulo da tela ou o valor salvo). */
  options?: readonly Option[];
  hint?: string;
  long?: boolean;
}

/** Ordem = ordem do modelo (35 colunas). */
export const IMPORT_COLUMNS = [
  { field: "title", header: "Nome do lead", group: "lead", required: true },
  { field: "owner", header: "Responsável", group: "lead", hint: "Nome ou e-mail de um usuário do painel. Vazio = responsável padrão." },
  { field: "lead_email", header: "E-mail do lead", group: "lead" },
  { field: "lead_phone", header: "Telefone do lead", group: "lead", hint: "(11) 99999-9999" },
  { field: "stage", header: "Etapa", group: "lead", options: leadStages.options },
  { field: "qualification", header: "Qualificação", group: "lead", options: leadQualifications.options },
  { field: "status", header: "Status", group: "lead", options: leadStatuses.options },
  { field: "source", header: "Origem", group: "lead", options: leadSources.options },
  { field: "campaign", header: "Campanha", group: "lead" },
  { field: "estimated_value", header: "Valor estimado", group: "lead", hint: "R$ 12.000,00" },
  { field: "expected_close_date", header: "Previsão de fechamento", group: "lead", hint: "DD/MM/AAAA" },
  { field: "tags", header: "Tags", group: "lead", hint: "Separadas por vírgula (até 10)." },
  { field: "notes", header: "Observações", group: "lead", long: true },
  { field: "contact_name", header: "Nome do contato", group: "contact" },
  { field: "contact_email", header: "E-mail do contato", group: "contact" },
  { field: "contact_phone", header: "Telefone do contato", group: "contact" },
  { field: "role", header: "Cargo", group: "contact" },
  { field: "preferred_channel", header: "Canal preferido", group: "contact", options: contactChannels.options },
  { field: "comm_consent", header: "Consentimento de comunicação", group: "contact", options: contactConsents.options },
  { field: "contact_notes", header: "Obs. do contato", group: "contact", long: true },
  { field: "trade_name", header: "Nome fantasia", group: "company" },
  { field: "legal_name", header: "Razão social", group: "company" },
  { field: "cnpj", header: "CNPJ", group: "company", hint: "00.000.000/0000-00" },
  { field: "website", header: "Site", group: "company" },
  { field: "company_email", header: "E-mail da empresa", group: "company" },
  { field: "company_phone", header: "Telefone da empresa", group: "company" },
  { field: "segment", header: "Segmento", group: "company", options: companySegments.options },
  { field: "size", header: "Porte", group: "company", options: companySizes.options },
  { field: "street", header: "Rua", group: "company" },
  { field: "number", header: "Número", group: "company" },
  { field: "district", header: "Bairro", group: "company" },
  { field: "city", header: "Cidade", group: "company" },
  { field: "zip", header: "CEP", group: "company" },
  { field: "region", header: "Estado", group: "company", options: companyRegions.options, hint: "Sigla da UF ou EX (exterior)." },
  { field: "company_notes", header: "Obs. da empresa", group: "company", long: true },
] as const satisfies readonly ColumnSpec[];

export type ImportField = (typeof IMPORT_COLUMNS)[number]["field"];
export type ImportValues = Record<ImportField, string>;
export const IMPORT_FIELDS = IMPORT_COLUMNS.map((c) => c.field) as ImportField[];
export const columnOf = (field: ImportField): ColumnSpec => IMPORT_COLUMNS.find((c) => c.field === field)!;

/** Limites da importação. */
export const IMPORT_LIMITS = {
  rows: 500,
  fileBytes: 5 * 1024 * 1024,
  /** Linhas por chamada de gravação (cada uma é uma transação). */
  commitChunk: 25,
  analyzeBytes: 1_600_000,
  commitBytes: 200_000,
  cell: 2000,
} as const;

export interface ImportRow {
  /** Nº da linha na planilha (cabeçalho = 1). */
  line: number;
  values: ImportValues;
}

// ── Normalização ─────────────────────────────────────────────────────────────

/** Minúsculas, sem acento e sem pontuação: "Costa, Gomes & Ferrari" → "costa gomes ferrari". */
export const fold = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const digitsOf = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");
/** "https://www.Empresa.com.br/contato" → "empresa.com.br". */
export const domainOf = (site: string | null | undefined): string =>
  (site ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
/** Telefone válido para casar (DDD + número). */
export const phoneKey = (s: string | null | undefined): string => {
  const d = digitsOf(s).replace(/^55(?=\d{10,11}$)/, "");
  return d.length >= 10 && d.length <= 11 ? d : "";
};
export const emailKey = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

/** "[Responsável]", "<responsável>"… = célula não preenchida pelo gerador. */
export const isPlaceholder = (v: string): boolean => /^\s*[[<{(].*[\]>})]\s*$/.test(v);

// ── Cabeçalho → campos ───────────────────────────────────────────────────────

const ALIASES: Record<string, ImportField> = {
  lead: "title",
  "nome do lead": "title",
  titulo: "title",
  responsavel: "owner",
  "e mail": "lead_email",
  email: "lead_email",
  telefone: "lead_phone",
  whatsapp: "lead_phone",
  "observacoes do lead": "notes",
  contato: "contact_name",
  empresa: "trade_name",
  website: "website",
  uf: "region",
};

/** Liga cada coluna da planilha a um campo (pelo nome do cabeçalho, sem acento/maiúscula). */
export function mapHeaders(header: string[]): { fields: (ImportField | null)[]; unknown: string[]; missing: ImportField[] } {
  const byHeader = new Map<string, ImportField>(IMPORT_COLUMNS.map((c) => [fold(c.header), c.field]));
  const used = new Set<ImportField>();
  const fields = header.map((h) => {
    const key = fold(h);
    const field = byHeader.get(key) ?? ALIASES[key] ?? null;
    if (!field || used.has(field)) return null;
    used.add(field);
    return field;
  });
  return {
    fields,
    unknown: header.filter((h, i) => h.trim() && !fields[i]),
    missing: IMPORT_FIELDS.filter((f) => !used.has(f)),
  };
}

export const emptyValues = (): ImportValues => Object.fromEntries(IMPORT_FIELDS.map((f) => [f, ""])) as ImportValues;

/** Tabela lida da planilha → linhas (ignora linhas vazias). */
export function rowsFromTable(table: string[][]): { rows: ImportRow[]; unknown: string[]; missing: ImportField[] } {
  const [header = [], ...body] = table;
  const { fields, unknown, missing } = mapHeaders(header);
  const rows: ImportRow[] = [];
  body.forEach((cells, index) => {
    const values = emptyValues();
    fields.forEach((field, col) => {
      if (field) values[field] = (cells[col] ?? "").trim().slice(0, IMPORT_LIMITS.cell);
    });
    if (IMPORT_FIELDS.some((f) => values[f])) rows.push({ line: index + 2, values });
  });
  return { rows, unknown, missing };
}

// ── Valores da planilha → formulário ─────────────────────────────────────────

/** Rótulo ("Quente"), valor ("quente") ou rótulo sem complemento ("SP" de "SP · Brasil") → valor salvo. */
export function optionValue(options: readonly Option[], raw: string): string {
  if (!raw.trim()) return "";
  const key = fold(raw);
  const hit = options.find((o) => fold(o.value) === key || fold(o.label) === key || fold(o.label.split("·")[0]) === key);
  return hit ? hit.value : raw; // desconhecido: o validador acusa
}

/** "DD/MM/AAAA", "AAAA-MM-DD" ou número serial do Excel → "AAAA-MM-DD". */
export function toIsoDate(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (/^\d{4,6}(\.\d+)?$/.test(v)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86_400_000).toISOString().slice(0, 10);
  return v;
}

/** Valor em reais → texto que o validador lê como centavos. "12000" / 12000 / "R$ 12.000,00" = R$ 12 mil. */
export function toCurrencyInput(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^\d+(\.\d{1,2})?$/.test(v)) return String(Math.round(Number(v) * 100)); // número (Excel) em reais
  if (!v.includes(",")) return `${digitsOf(v)}00`; // "12.000" = reais
  const [int, dec = ""] = v.split(",");
  return `${digitsOf(int)}${dec.replace(/\D/g, "").padEnd(2, "0").slice(0, 2)}`;
}

export interface OwnerOption {
  uid: string;
  name: string;
  email?: string | null;
}

/** Responsável da linha: nome/e-mail/uid de um admin; vazio ou placeholder = padrão. null = não encontrado. */
export function resolveOwner(raw: string, admins: OwnerOption[], defaultUid: string): string | null {
  const v = raw.trim();
  if (!v || isPlaceholder(v)) return defaultUid || null;
  const key = fold(v);
  const hit = admins.find((a) => a.uid === v || (a.email && emailKey(a.email) === emailKey(v)) || fold(a.name) === key);
  return hit?.uid ?? null;
}

const hasAny = (values: ImportValues, group: ImportGroup) =>
  IMPORT_COLUMNS.some((c) => c.group === group && values[c.field as ImportField].trim());

export function toForms(values: ImportValues, ownerUid: string): { lead: LeadForm; contact: ContactForm | null; company: CompanyForm | null } {
  const v = values;
  return {
    lead: {
      title: v.title,
      email: v.lead_email,
      phone: v.lead_phone,
      owner_uid: ownerUid,
      stage: optionValue(leadStages.options, v.stage) || "novo",
      qualification: optionValue(leadQualifications.options, v.qualification) || "a_qualificar",
      status: optionValue(leadStatuses.options, v.status) || "novo",
      source: optionValue(leadSources.options, v.source),
      campaign: v.campaign,
      estimated_value: toCurrencyInput(v.estimated_value),
      expected_close_date: toIsoDate(v.expected_close_date),
      tags: v.tags.split(/[,;]/),
      notes: v.notes,
    },
    contact: hasAny(v, "contact")
      ? {
          name: v.contact_name,
          email: v.contact_email,
          phone: v.contact_phone,
          role: v.role,
          preferred_channel: optionValue(contactChannels.options, v.preferred_channel),
          comm_consent: optionValue(contactConsents.options, v.comm_consent) || "nao_informada",
          company_choice: CONTACT_COMPANY_FROM_LEAD,
          notes: v.contact_notes,
        }
      : null,
    company: hasAny(v, "company")
      ? {
          trade_name: v.trade_name,
          legal_name: v.legal_name,
          cnpj: v.cnpj,
          website: v.website,
          email: v.company_email,
          phone: v.company_phone,
          segment: optionValue(companySegments.options, v.segment),
          size: optionValue(companySizes.options, v.size),
          street: v.street,
          number: v.number,
          zip: v.zip,
          district: v.district,
          city: v.city,
          region: optionValue(companyRegions.options, v.region),
          notes: v.company_notes,
        }
      : null,
  };
}

// Chave do erro no formulário → coluna da planilha.
const LEAD_KEYS: Record<string, ImportField> = {
  title: "title",
  email: "lead_email",
  phone: "lead_phone",
  owner_uid: "owner",
  stage: "stage",
  qualification: "qualification",
  status: "status",
  source: "source",
  campaign: "campaign",
  estimated_value: "estimated_value",
  expected_close_date: "expected_close_date",
  tags: "tags",
  notes: "notes",
};
const CONTACT_KEYS: Record<string, ImportField> = {
  name: "contact_name",
  email: "contact_email",
  phone: "contact_phone",
  role: "role",
  preferred_channel: "preferred_channel",
  comm_consent: "comm_consent",
  notes: "contact_notes",
};
const COMPANY_KEYS: Record<string, ImportField> = {
  trade_name: "trade_name",
  legal_name: "legal_name",
  cnpj: "cnpj",
  website: "website",
  email: "company_email",
  phone: "company_phone",
  segment: "segment",
  size: "size",
  street: "street",
  number: "number",
  zip: "zip",
  district: "district",
  city: "city",
  region: "region",
  notes: "company_notes",
};

export type RowErrors = Partial<Record<ImportField, string>>;

export interface ParsedImportRow {
  lead: Omit<LeadData, "owner_name">;
  contact: (ContactData & { company_choice: string }) | null;
  company: CompanyData | null;
}

/** Sem nenhum e-mail, telefone ou site (de lead, contato ou empresa): não vale cadastrar. */
export function hasNoReach(values: ImportValues): boolean {
  const v = values;
  return ![v.lead_email, v.contact_email, v.company_email].some((e) => e.trim()) && ![v.lead_phone, v.contact_phone, v.company_phone].some((p) => digitsOf(p).length >= 10) && !v.website.trim();
}

/** Valida uma linha inteira. `ownerUid` já resolvido (null = responsável não encontrado). */
export function validateImportRow(
  values: ImportValues,
  ownerUid: string | null,
  ownerUids: string[],
): { ok: true; parsed: ParsedImportRow } | { ok: false; errors: RowErrors } {
  const errors: RowErrors = {};
  const forms = toForms(values, ownerUid ?? "");

  const lead = validateLeadForm(forms.lead, ownerUids);
  if (!lead.ok) for (const [k, msg] of Object.entries(lead.errors)) errors[LEAD_KEYS[k] ?? "title"] = msg;
  if (!ownerUid) errors.owner = values.owner.trim() ? `"${values.owner.trim()}" não é um usuário do painel.` : "Escolha o responsável.";

  const contact = forms.contact ? validateContactForm(forms.contact) : null;
  if (contact && !contact.ok) {
    for (const [k, msg] of Object.entries(contact.errors)) errors[CONTACT_KEYS[k] ?? "contact_name"] = k === "name" ? "Informe o nome do contato (ou apague os dados do contato)." : msg;
  }
  const company = forms.company ? validateCompanyForm(forms.company) : null;
  if (company && !company.ok) {
    for (const [k, msg] of Object.entries(company.errors)) errors[COMPANY_KEYS[k] ?? "trade_name"] = k === "trade_name" ? "Informe o nome fantasia (ou apague os dados da empresa)." : msg;
  }

  if (Object.keys(errors).length || !lead.ok || (contact && !contact.ok) || (company && !company.ok)) return { ok: false, errors };
  return {
    ok: true,
    parsed: {
      lead: lead.value,
      contact: contact?.ok ? contact.value : null,
      company: company?.ok ? company.value : null,
    },
  };
}

/** Modelo .csv (só cabeçalho + uma linha de exemplo). */
export function templateCsv(): string {
  const example: Partial<ImportValues> = {
    title: "Empresa Exemplo – Software sob medida",
    lead_phone: "(11) 99999-9999",
    stage: "Novo lead",
    qualification: "A qualificar",
    status: "Novo",
    source: "Prospecção ativa",
    contact_name: "Maria Silva",
    role: "Sócia",
    preferred_channel: "WhatsApp",
    trade_name: "Empresa Exemplo",
    website: "empresaexemplo.com.br",
    segment: "Serviços",
    city: "São Paulo",
    region: "SP",
  };
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [IMPORT_COLUMNS.map((c) => esc(c.header)).join(";"), IMPORT_FIELDS.map((f) => esc(example[f] ?? "")).join(";")].join("\r\n");
}
