/**
 * Validação e normalização dos cadastros do CRM.
 * Módulo puro (sem Firebase): o modal usa para mostrar os erros e a rota da API usa de novo
 * no servidor — o cliente nunca é confiável, então tudo é revalidado lá.
 *
 * Os formulários trabalham com strings (como digitadas, com máscara); aqui viram dados limpos.
 */
import { validateEmail } from "@/shemas/validationSchema";
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
} from "./options";
import type { CompanyData, ContactData, LeadData } from "./types";

// ── Formulários (o que o cliente envia) ──────────────────────────────────────

export interface LeadForm {
  title: string;
  /** Contato rápido do próprio lead. */
  email: string;
  /** Como digitado: "(11) 99999-9999". */
  phone: string;
  owner_uid: string;
  stage: string;
  qualification: string;
  status: string;
  source: string;
  campaign: string;
  /** Como digitado: "R$ 12.000,00". */
  estimated_value: string;
  /** "YYYY-MM-DD" (input date) ou "". */
  expected_close_date: string;
  tags: string[];
  notes: string;
}

/** Empresa do contato: a mesma do lead, nenhuma, ou uma empresa existente (id). */
export const CONTACT_COMPANY_FROM_LEAD = "__lead__";
export const CONTACT_COMPANY_NONE = "__none__";

export interface ContactForm {
  name: string;
  email: string;
  phone: string;
  role: string;
  preferred_channel: string;
  company_choice: string;
  notes: string;
  comm_consent: string;
}

export interface CompanyForm {
  trade_name: string;
  legal_name: string;
  cnpj: string;
  website: string;
  email: string;
  phone: string;
  segment: string;
  size: string;
  street: string;
  number: string;
  zip: string;
  district: string;
  city: string;
  region: string;
  notes: string;
}

export type LinkInput<TForm> = { mode: "none" } | { mode: "existing"; id: string } | { mode: "new"; draft: TForm };

export interface CreateLeadPayload {
  lead: LeadForm;
  contact: LinkInput<ContactForm>;
  company: LinkInput<CompanyForm>;
}

export const emptyLeadForm = (owner_uid = ""): LeadForm => ({
  title: "",
  email: "",
  phone: "",
  owner_uid,
  stage: "novo",
  qualification: "a_qualificar",
  status: "novo",
  source: "",
  campaign: "",
  estimated_value: "",
  expected_close_date: "",
  tags: [],
  notes: "",
});

export const emptyContactForm = (): ContactForm => ({
  name: "",
  email: "",
  phone: "",
  role: "",
  preferred_channel: "",
  company_choice: CONTACT_COMPANY_FROM_LEAD,
  notes: "",
  comm_consent: "nao_informada",
});

export const emptyCompanyForm = (): CompanyForm => ({
  trade_name: "",
  legal_name: "",
  cnpj: "",
  website: "",
  email: "",
  phone: "",
  segment: "",
  size: "",
  street: "",
  number: "",
  zip: "",
  district: "",
  city: "",
  region: "",
  notes: "",
});

// ── Limites ──────────────────────────────────────────────────────────────────

export const LIMITS = {
  title: 120,
  name: 120,
  short: 120,
  campaign: 80,
  notes: 2000,
  tags: 10,
  tag: 30,
  /** R$ 1 bilhão em centavos. */
  maxCents: 100_000_000_000,
} as const;

/** Tamanho máximo do JSON aceito pela rota (com folga para os três formulários). */
export const CREATE_LEAD_MAX_BYTES = 24 * 1024;

export type FieldErrors = Record<string, string>;

/** Cópia de `errors` sem o campo `key` (limpa o erro quando o campo é editado). */
export function withoutKey(errors: FieldErrors, key: string): FieldErrors {
  const next = { ...errors };
  delete next[key];
  return next;
}
export type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

// ── Helpers de parsing ───────────────────────────────────────────────────────

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const digits = (value: string): string => value.replace(/\D/g, "");
/** Texto limpo: sem espaços nas pontas, espaços repetidos e caracteres de controle. */
const clean = (value: unknown): string =>
  str(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
const optional = (value: string): string | null => (value ? value : null);

/** "R$ 12.000,00" → 1200000 (centavos). "" → null. */
export function parseCurrencyToCents(value: string): number | null {
  const d = digits(value);
  if (!d) return null;
  return Number(d.replace(/^0+(?=\d)/, ""));
}

export function isValidCnpj(value: string): boolean {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(base[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Telefone BR: DDD + 8 (fixo) ou 9 (celular) dígitos. */
function isValidBrPhone(value: string): boolean {
  return /^\d{10,11}$/.test(value);
}

function isValidWebsite(value: string): boolean {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return (url.protocol === "http:" || url.protocol === "https:") && /^[^.\s]+(\.[^.\s]+)+$/.test(url.hostname);
  } catch {
    return false;
  }
}

/** Tags únicas (sem diferenciar maiúsculas), sem vazias. */
export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = clean(raw);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

const isId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

// ── Validação de cada formulário ─────────────────────────────────────────────

/** Valida o lead. `ownerUids` = responsáveis válidos (no servidor, os admins; no cliente, os da lista). */
export function validateLeadForm(input: Partial<LeadForm>, ownerUids: string[]): Result<Omit<LeadData, "owner_name">> {
  const errors: FieldErrors = {};

  const title = clean(input.title);
  if (!title) errors.title = "Informe o nome do lead.";
  else if (title.length > LIMITS.title) errors.title = `Use até ${LIMITS.title} caracteres.`;

  const email = clean(input.email).toLowerCase();
  if (email && (!validateEmail(email) || email.length > 254)) errors.email = "E-mail inválido.";

  const phone = digits(str(input.phone));
  if (phone && !isValidBrPhone(phone)) errors.phone = "Telefone inválido. Use DDD + número.";

  const owner = str(input.owner_uid);
  if (!owner) errors.owner_uid = "Escolha o responsável.";
  else if (!ownerUids.includes(owner)) errors.owner_uid = "Responsável inválido.";

  if (!leadStages.is(input.stage)) errors.stage = "Etapa inválida.";
  if (!leadQualifications.is(input.qualification)) errors.qualification = "Qualificação inválida.";
  if (!leadStatuses.is(input.status)) errors.status = "Status inválido.";

  const source = str(input.source);
  if (source && !leadSources.is(source)) errors.source = "Origem inválida.";

  const campaign = clean(input.campaign);
  if (campaign.length > LIMITS.campaign) errors.campaign = `Use até ${LIMITS.campaign} caracteres.`;

  const cents = parseCurrencyToCents(str(input.estimated_value));
  if (cents !== null && cents > LIMITS.maxCents) errors.estimated_value = "Valor alto demais.";

  const date = str(input.expected_close_date);
  if (date && !isValidDate(date)) errors.expected_close_date = "Data inválida.";

  const tags = normalizeTags(input.tags);
  if (tags.length > LIMITS.tags) errors.tags = `Use até ${LIMITS.tags} tags.`;
  else if (tags.some((t) => t.length > LIMITS.tag)) errors.tags = `Cada tag pode ter até ${LIMITS.tag} caracteres.`;

  const notes = str(input.notes).trim();
  if (notes.length > LIMITS.notes) errors.notes = `Use até ${LIMITS.notes} caracteres.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      email: optional(email),
      phone: optional(phone),
      owner_uid: owner,
      stage: input.stage as LeadData["stage"],
      qualification: input.qualification as LeadData["qualification"],
      status: input.status as LeadData["status"],
      source: source ? (source as LeadData["source"]) : null,
      campaign: optional(campaign),
      estimated_value_cents: cents,
      expected_close_date: optional(date),
      tags,
      notes: optional(notes),
    },
  };
}

export function validateContactForm(input: Partial<ContactForm>): Result<ContactData & { company_choice: string }> {
  const errors: FieldErrors = {};

  const name = clean(input.name);
  if (!name) errors.name = "Informe o nome completo.";
  else if (name.length > LIMITS.name) errors.name = `Use até ${LIMITS.name} caracteres.`;

  const email = clean(input.email).toLowerCase();
  if (email && (!validateEmail(email) || email.length > 254)) errors.email = "E-mail inválido.";

  const phone = digits(str(input.phone));
  if (phone && !isValidBrPhone(phone)) errors.phone = "Telefone inválido. Use DDD + número.";

  const role = clean(input.role);
  if (role.length > LIMITS.short) errors.role = `Use até ${LIMITS.short} caracteres.`;

  const channel = str(input.preferred_channel);
  if (channel && !contactChannels.is(channel)) errors.preferred_channel = "Canal inválido.";

  const consent = str(input.comm_consent) || "nao_informada";
  if (!contactConsents.is(consent)) errors.comm_consent = "Opção inválida.";

  const companyChoice = str(input.company_choice) || CONTACT_COMPANY_FROM_LEAD;
  if (companyChoice !== CONTACT_COMPANY_FROM_LEAD && companyChoice !== CONTACT_COMPANY_NONE && !isId(companyChoice)) {
    errors.company_choice = "Empresa inválida.";
  }

  const notes = str(input.notes).trim();
  if (notes.length > LIMITS.notes) errors.notes = `Use até ${LIMITS.notes} caracteres.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      email: optional(email),
      phone: optional(phone),
      role: optional(role),
      preferred_channel: channel ? (channel as ContactData["preferred_channel"]) : null,
      notes: optional(notes),
      comm_consent: consent as ContactData["comm_consent"],
      company_choice: companyChoice,
    },
  };
}

export function validateCompanyForm(input: Partial<CompanyForm>): Result<CompanyData> {
  const errors: FieldErrors = {};
  const tooLong = (field: keyof CompanyForm, value: string) => {
    if (value.length > LIMITS.short) errors[field] = `Use até ${LIMITS.short} caracteres.`;
  };

  const tradeName = clean(input.trade_name);
  if (!tradeName) errors.trade_name = "Informe o nome fantasia.";
  tooLong("trade_name", tradeName);

  const legalName = clean(input.legal_name);
  tooLong("legal_name", legalName);

  const cnpj = digits(str(input.cnpj));
  if (cnpj && !isValidCnpj(cnpj)) errors.cnpj = "CNPJ inválido.";

  const website = clean(input.website).toLowerCase();
  if (website && (website.length > 200 || !isValidWebsite(website))) errors.website = "Site inválido.";

  const email = clean(input.email).toLowerCase();
  if (email && (!validateEmail(email) || email.length > 254)) errors.email = "E-mail inválido.";

  const phone = digits(str(input.phone));
  if (phone && !isValidBrPhone(phone)) errors.phone = "Telefone inválido. Use DDD + número.";

  const segment = str(input.segment);
  if (segment && !companySegments.is(segment)) errors.segment = "Segmento inválido.";
  const size = str(input.size);
  if (size && !companySizes.is(size)) errors.size = "Porte inválido.";
  const region = str(input.region);
  if (region && !companyRegions.is(region)) errors.region = "Estado inválido.";

  const street = clean(input.street);
  tooLong("street", street);
  const number = clean(input.number);
  tooLong("number", number);
  const district = clean(input.district);
  tooLong("district", district);
  const city = clean(input.city);
  tooLong("city", city);

  const zip = digits(str(input.zip));
  if (zip && zip.length !== 8) errors.zip = "CEP inválido.";

  const notes = str(input.notes).trim();
  if (notes.length > LIMITS.notes) errors.notes = `Use até ${LIMITS.notes} caracteres.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      trade_name: tradeName,
      legal_name: optional(legalName),
      cnpj: optional(cnpj),
      website: optional(website),
      email: optional(email),
      phone: optional(phone),
      segment: segment ? (segment as CompanyData["segment"]) : null,
      size: size ? (size as CompanyData["size"]) : null,
      address: {
        street: optional(street),
        number: optional(number),
        zip: optional(zip),
        district: optional(district),
        city: optional(city),
        region: region ? (region as CompanyData["address"]["region"]) : null,
      },
      notes: optional(notes),
    },
  };
}

// ── Payload completo (servidor) ──────────────────────────────────────────────

export type ParsedLink<T> = { mode: "none" } | { mode: "existing"; id: string } | { mode: "new"; data: T };

export interface ParsedCreateLead {
  lead: Omit<LeadData, "owner_name">;
  contact: ParsedLink<ContactData & { company_choice: string }>;
  company: ParsedLink<CompanyData>;
}

function parseLink<T>(raw: unknown, validate: (draft: never) => Result<T>): ParsedLink<T> | null {
  if (!raw || typeof raw !== "object") return null;
  const link = raw as Record<string, unknown>;
  if (link.mode === "none") return { mode: "none" };
  if (link.mode === "existing") return isId(link.id) ? { mode: "existing", id: link.id } : null;
  if (link.mode === "new" && link.draft && typeof link.draft === "object") {
    const result = validate(link.draft as never);
    return result.ok ? { mode: "new", data: result.value } : null;
  }
  return null;
}

/** Valida o corpo inteiro do POST. Qualquer erro → null (a rota responde `invalid_input`). */
export function parseCreateLeadPayload(body: Record<string, unknown>, ownerUids: string[]): ParsedCreateLead | null {
  const lead = body.lead && typeof body.lead === "object" ? validateLeadForm(body.lead as Partial<LeadForm>, ownerUids) : null;
  if (!lead?.ok) return null;
  const contact = parseLink(body.contact, validateContactForm);
  const company = parseLink(body.company, validateCompanyForm);
  if (!contact || !company) return null;
  return { lead: lead.value, contact, company };
}

/** Vincular contato e/ou empresa a um lead que ainda não tem (painel de detalhes). */
export interface ParsedLinkLead {
  contact: ParsedLink<ContactData & { company_choice: string }>;
  company: ParsedLink<CompanyData>;
}

/** `{ contact, company }` (cada um none/existing/new). Pelo menos um precisa ser diferente de "none". */
export function parseLinkLeadPayload(body: Record<string, unknown>): ParsedLinkLead | null {
  const contact = parseLink(body.contact ?? { mode: "none" }, validateContactForm);
  const company = parseLink(body.company ?? { mode: "none" }, validateCompanyForm);
  if (!contact || !company || (contact.mode === "none" && company.mode === "none")) return null;
  return { contact, company };
}

// ── Ações em massa na lista de leads ─────────────────────────────────────────

/** Máximo de leads por chamada (cabe com folga num batch do Firestore). */
export const BULK_MAX_IDS = 200;
export const BULK_MAX_BYTES = 16 * 1024;

export type BulkLeadAction =
  | { action: "set_qualification"; ids: string[]; value: LeadData["qualification"] }
  | { action: "set_stage"; ids: string[]; value: LeadData["stage"] }
  | { action: "set_status"; ids: string[]; value: LeadData["status"] }
  | { action: "set_owner"; ids: string[]; value: string }
  | { action: "convert"; ids: string[] }
  | { action: "delete"; ids: string[] };

/** Valida `{ ids, action, value? }`. Qualquer problema → null (a rota responde `invalid_input`). */
export function parseBulkLeadAction(body: Record<string, unknown>): BulkLeadAction | null {
  const { ids: rawIds, action, value } = body;
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > BULK_MAX_IDS || !rawIds.every(isId)) return null;
  const ids = [...new Set(rawIds as string[])];

  switch (action) {
    case "set_qualification":
      return leadQualifications.is(value) ? { action, ids, value } : null;
    case "set_stage":
      return leadStages.is(value) ? { action, ids, value } : null;
    case "set_status":
      return leadStatuses.is(value) ? { action, ids, value } : null;
    case "set_owner":
      // uid do responsável; a rota confere se é um usuário do painel.
      return isId(value) ? { action, ids, value } : null;
    case "convert":
    case "delete":
      return { action, ids };
    default:
      return null;
  }
}

// ── Modelos de mensagem ──────────────────────────────────────────────────────

export const TEMPLATE_LIMITS = { name: 60, subject: 200, body: 5000 } as const;
export const TEMPLATES_MAX_BYTES = 24 * 1024;

export interface TemplateForm {
  channel: "whatsapp" | "email";
  name: string;
  subject: string;
  body: string;
}

export interface TemplateData {
  channel: "whatsapp" | "email";
  name: string;
  subject: string | null;
  body: string;
}

export type TemplateAction =
  | { action: "create"; data: TemplateData }
  | { action: "update"; id: string; data: TemplateData }
  | { action: "delete"; id: string };

/** Valida o formulário do modelo (cliente e servidor). */
export function validateTemplateForm(input: Partial<TemplateForm>): Result<TemplateData> {
  const errors: FieldErrors = {};
  const channel = input.channel;
  if (channel !== "whatsapp" && channel !== "email") errors.channel = "Canal inválido.";

  const name = clean(input.name);
  if (!name) errors.name = "Dê um nome ao modelo.";
  else if (name.length > TEMPLATE_LIMITS.name) errors.name = `Use até ${TEMPLATE_LIMITS.name} caracteres.`;

  const subject = clean(input.subject);
  if (channel === "email") {
    if (!subject) errors.subject = "Informe o assunto.";
    else if (subject.length > TEMPLATE_LIMITS.subject) errors.subject = `Use até ${TEMPLATE_LIMITS.subject} caracteres.`;
  }

  const body = str(input.body).trim();
  if (!body) errors.body = "Escreva a mensagem.";
  else if (body.length > TEMPLATE_LIMITS.body) errors.body = `Use até ${TEMPLATE_LIMITS.body} caracteres.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { channel: channel!, name, subject: channel === "email" ? subject : null, body } };
}

export function parseTemplateAction(body: Record<string, unknown>): TemplateAction | null {
  if (body.action === "delete") return isId(body.id) ? { action: "delete", id: body.id } : null;
  if (body.action !== "create" && body.action !== "update") return null;
  const result = validateTemplateForm((body.data ?? {}) as Partial<TemplateForm>);
  if (!result.ok) return null;
  if (body.action === "create") return { action: "create", data: result.value };
  return isId(body.id) ? { action: "update", id: body.id, data: result.value } : null;
}

// ── Observações (timeline do lead) ───────────────────────────────────────────

export const NOTE_MAX_LENGTH = 2000;
export const NOTE_MAX_BYTES = 12 * 1024;

/** Texto da observação: sem caracteres de controle (mantém quebras de linha), não vazio, ≤2000. */
export function validateNoteText(value: unknown): Result<string> {
  const text = str(value)
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (!text) return { ok: false, errors: { text: "Escreva a observação." } };
  if (text.length > NOTE_MAX_LENGTH) return { ok: false, errors: { text: `Use até ${NOTE_MAX_LENGTH} caracteres.` } };
  return { ok: true, value: text };
}

// ── E-mail para o lead ───────────────────────────────────────────────────────

export const EMAIL_LIMITS = { subject: 200, body: 20_000 } as const;
export const EMAIL_MAX_BYTES = 32 * 1024;

export interface SendEmailForm {
  to: string;
  subject: string;
  body: string;
}

/** Valida o e-mail a enviar (cliente e servidor). Assunto sem quebras de linha. */
export function validateSendEmail(input: Partial<SendEmailForm>): Result<SendEmailForm> {
  const errors: FieldErrors = {};
  const to = clean(input.to).toLowerCase();
  if (!to || !validateEmail(to) || to.length > 254) errors.to = "Destinatário inválido.";

  const subject = clean(str(input.subject).replace(/[\r\n]+/g, " "));
  if (!subject) errors.subject = "Informe o assunto.";
  else if (subject.length > EMAIL_LIMITS.subject) errors.subject = `Use até ${EMAIL_LIMITS.subject} caracteres.`;

  const body = str(input.body).replace(/\r\n/g, "\n").trim();
  if (!body) errors.body = "Escreva a mensagem.";
  else if (body.length > EMAIL_LIMITS.body) errors.body = `Use até ${EMAIL_LIMITS.body} caracteres.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { to, subject, body } };
}
