/**
 * Modelo de dados do CRM no Firestore.
 *
 * products/{id}   — catálogo (preço mensal editável na tela Produtos).
 * contracts/{id}  — uma venda: criada quando um lead é marcado como vendido no CRM.
 *                   Guarda o valor do momento da venda (reajustes de preço não mudam contratos antigos).
 * leads/{id}      — oportunidade (schema_version 2). Pode apontar para um contato e uma empresa.
 * contacts/{id}   — pessoa de contato.
 * companies/{id}  — empresa (cliente ou prospect).
 */
import type {
  CompanyRegion,
  CompanySegment,
  CompanySize,
  ContactChannel,
  ContactConsent,
  LeadEntry,
  LeadQualification,
  LeadSource,
  LeadStage,
  LeadStatus,
} from "./options";

export const PRODUCTS_COLLECTION = "products";
export const CONTRACTS_COLLECTION = "contracts";
export const LEADS_COLLECTION = "leads";
export const CONTACTS_COLLECTION = "contacts";
export const COMPANIES_COLLECTION = "companies";
/**
 * deals/{id} — negociação criada ao converter um lead. Estrutura mínima até a tela Negociações:
 * lead_id, title, contact_id, company_id, owner_uid/owner_name, estimated_value_cents,
 * expected_close_date, status ("open"), created_by_*, timestamps.
 */
export const DEALS_COLLECTION = "deals";

/** Versão atual do documento de lead. Leads antigos do site (sem o campo) são convertidos pelo crm-setup. */
export const LEAD_SCHEMA_VERSION = 2;

/** Fidelidade mínima de todo plano. Depois disso o contrato segue ativo até ser cancelado. */
export const CONTRACT_MIN_TERM_MONTHS = 8;

export interface Product {
  id: string;
  name: string;
  /** Preço mensal em reais; null = "sob consulta" (o valor é definido na venda). */
  monthly_price: number | null;
  price_label: string | null;
  active: boolean;
  sort: number;
}

export type ContractStatus = "active" | "cancelled";

export interface Contract {
  id: string;
  lead_id: string;
  product_id: string;
  /** Nome do produto no momento da venda. */
  product_name: string;
  /** Valor mensal acordado na venda (em reais). */
  monthly_value: number;
  status: ContractStatus;
  /** Data em que o cliente assinou / a venda foi marcada. */
  signed_at: Date;
  cancelled_at: Date | null;
  min_term_months: number;
}

// ── Dados gravados (sem id, timestamps e autoria — esses o servidor adiciona) ──

export interface LeadData {
  title: string;
  /** Contato rápido direto no lead (minúsculo). */
  email: string | null;
  /** Contato rápido direto no lead (só dígitos, DDD + número). */
  phone: string | null;
  owner_uid: string | null;
  owner_name: string | null;
  stage: LeadStage;
  qualification: LeadQualification;
  status: LeadStatus;
  source: LeadSource | null;
  campaign: string | null;
  /** Valor estimado em centavos. */
  estimated_value_cents: number | null;
  /** "YYYY-MM-DD" (data de calendário, sem fuso). */
  expected_close_date: string | null;
  tags: string[];
  notes: string | null;
}

export interface ContactData {
  name: string;
  /** Minúsculo. */
  email: string | null;
  /** Só dígitos (DDD + número). */
  phone: string | null;
  role: string | null;
  preferred_channel: ContactChannel | null;
  notes: string | null;
  comm_consent: ContactConsent;
}

export interface CompanyAddress {
  street: string | null;
  number: string | null;
  /** CEP, só dígitos. */
  zip: string | null;
  district: string | null;
  city: string | null;
  /** UF ou "EX" (exterior). */
  region: CompanyRegion | null;
}

export interface CompanyData {
  trade_name: string;
  legal_name: string | null;
  /** Só dígitos. */
  cnpj: string | null;
  website: string | null;
  email: string | null;
  /** Só dígitos. */
  phone: string | null;
  segment: CompanySegment | null;
  size: CompanySize | null;
  address: CompanyAddress;
  notes: string | null;
}

// ── Leitura para as telas ──

/** Lead pronto para a lista e o painel de detalhes (tudo serializável para o cliente). */
export interface LeadRow {
  id: string;
  title: string;
  /** E-mail/telefone do próprio lead (contato rápido). */
  email: string | null;
  phone: string | null;
  entry: LeadEntry;
  stage: LeadStage;
  qualification: LeadQualification;
  status: LeadStatus;
  source: LeadSource | null;
  campaign: string | null;
  /** Quem cadastrou o lead ("Website" para os do formulário). */
  created_by_name: string | null;
  owner_uid: string | null;
  owner_name: string | null;
  estimated_value_cents: number | null;
  expected_close_date: string | null;
  tags: string[];
  notes: string | null;
  interest_plan: string | null;
  /** Negociação criada a partir deste lead (null = ainda não convertido). */
  deal_id: string | null;
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
  company: { id: string; name: string } | null;
  /** ISO string. */
  created_at: string | null;
  /** Último e-mail enviado pelo CRM (ISO). */
  last_contact_at: string | null;
}

export const TEMPLATES_COLLECTION = "message_templates";
/** Subcoleção leads/{id}/emails — histórico de e-mails enviados pelo CRM. */
export const LEAD_EMAILS_SUBCOLLECTION = "emails";

export type TemplateChannel = "whatsapp" | "email";

/** Modelo de mensagem (WhatsApp ou e-mail). Os padrões vêm do código (`builtin: true`). */
export interface MessageTemplate {
  id: string;
  channel: TemplateChannel;
  name: string;
  /** Só e-mail. */
  subject: string | null;
  body: string;
  builtin: boolean;
}

/** Subcoleção leads/{id}/notes — timeline de observações (não editáveis). */
export const LEAD_NOTES_SUBCOLLECTION = "notes";

/** Observação da timeline do lead. `system` = registro automático (atribuição, vínculo, retorno pelo site). */
export interface LeadNoteRow {
  id: string;
  kind: "note" | "system";
  text: string;
  author_name: string | null;
  /** ISO. */
  created_at: string | null;
}

/** Item do histórico de e-mails do lead. */
export interface LeadEmailRow {
  id: string;
  to: string;
  subject: string;
  status: "sent" | "failed";
  sent_by_name: string | null;
  /** ISO. */
  created_at: string | null;
}

/** Item das buscas "contato/empresa existente" no modal. */
export interface PickerOption {
  id: string;
  label: string;
  /** Linha de apoio (e-mail do contato, CNPJ/cidade da empresa). */
  hint: string | null;
}

export interface AdminUserOption {
  uid: string;
  name: string;
}

// ── Contatos e empresas (telas próprias) ─────────────────────────────────────

export const COMPANY_NOTES_SUBCOLLECTION = "notes";
export const CONTACT_NOTES_SUBCOLLECTION = "notes";

/** Resumo de lead mostrado nas páginas de contato/empresa. */
export interface LeadSummary {
  id: string;
  title: string;
  stage: LeadStage;
  qualification: LeadQualification;
  status: LeadStatus;
  owner_name: string | null;
  /** ISO. */
  created_at: string | null;
}

/** Negociação (deal) resumida. */
export interface DealSummary {
  id: string;
  title: string;
  status: string;
  owner_name: string | null;
  estimated_value_cents: number | null;
  created_at: string | null;
}

/** Produto/contrato da empresa (vem da futura tela de Produtos). */
export interface ContractSummary {
  id: string;
  product_name: string;
  monthly_value: number;
  status: "active" | "cancelled";
  signed_at: string | null;
}

/** Linha da lista de contatos. */
export interface ContactRow {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  status: "ativo" | "inativo";
  company: { id: string; name: string } | null;
  created_at: string | null;
}

/** Página do contato. */
export interface ContactDetail extends ContactRow {
  preferred_channel: ContactChannel | null;
  comm_consent: ContactConsent;
  notes: string | null;
  created_by_name: string | null;
  leads: LeadSummary[];
}

/** Linha da lista de empresas. */
export interface CompanyRow {
  id: string;
  trade_name: string;
  legal_name: string | null;
  cnpj: string | null;
  segment: CompanySegment | null;
  size: CompanySize | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  region: CompanyRegion | null;
  status: "ativo" | "inativo";
  /** Tem produto/contrato ativo → Cliente. Senão, Prospect. */
  is_client: boolean;
  created_at: string | null;
}

/** Página da empresa. */
export interface CompanyDetail extends CompanyRow {
  website: string | null;
  address: CompanyAddress;
  notes: string | null;
  created_by_name: string | null;
  employees: ContactRow[];
  leads: LeadSummary[];
  deals: DealSummary[];
  contracts: ContractSummary[];
}
