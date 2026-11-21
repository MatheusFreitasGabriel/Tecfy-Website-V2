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
  TaskParentType,
  TaskRecurrenceFreq,
  CustomFieldType,
  DealOrigin,
  DealStatus,
  StageColor,
  TaskType,
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
  ProductBilling,
  ProductIcon,
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

/** Cadastro do produto (o que a tela Produtos grava). Valores em reais. */
export interface ProductData {
  name: string;
  description: string | null;
  billing: ProductBilling;
  /** Preço mensal (billing "mensal"). */
  monthly_price: number | null;
  /** Preço do pagamento único (billing "unico"). */
  one_time_price: number | null;
  /** Taxa de implantação cobrada uma vez junto da mensalidade (mensal / sob consulta). */
  setup_fee: number | null;
  /** Fidelidade mínima (recorrentes). */
  min_term_months: number | null;
  features: string[];
  color: StageColor;
  icon: ProductIcon;
  highlight: boolean;
  active: boolean;
}

export interface Product extends ProductData {
  id: string;
  /** Texto antigo ("SOB CONSULTA") dos produtos criados antes da tela. */
  price_label: string | null;
  sort: number;
}

export type ContractStatus = "active" | "cancelled";

export interface Contract {
  id: string;
  lead_id: string;
  product_id: string;
  /** Nome do produto no momento da venda. */
  product_name: string;
  /** Contratos antigos (sem o campo) = mensal. */
  billing: ProductBilling;
  /** Valor mensal acordado na venda (em reais). 0 no pagamento único. */
  monthly_value: number;
  /** Taxa de implantação cobrada na venda (reais). */
  setup_value: number;
  /** Valor do pagamento único (reais). */
  one_time_value: number;
  status: ContractStatus;
  /** Data em que o cliente assinou / a venda foi marcada. */
  signed_at: Date;
  cancelled_at: Date | null;
  min_term_months: number;
}

/** Números de um produto (ou do catálogo inteiro). */
export interface ProductStats {
  /** Contratos recorrentes ativos. */
  active_contracts: number;
  /** Faturamento mensal dos ativos (reais). */
  mrr: number;
  /** Receita no ano corrente: mensalidades cobradas + implantação/único assinados no ano (reais). */
  year_revenue: number;
  cancelled: number;
  /** Vendas de pagamento único. */
  one_time_sales: number;
  total_contracts: number;
}

export interface ProductRow extends Product {
  stats: ProductStats;
  created_at: string | null;
}

export interface ContractRow {
  id: string;
  company: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
  product_id: string;
  product_name: string;
  billing: ProductBilling;
  monthly_value: number;
  setup_value: number;
  one_time_value: number;
  status: ContractStatus;
  /** ISO. */
  signed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  min_term_months: number;
  /** Último mês da fidelidade ("AAAA-MM"); null = sem fidelidade. */
  term_end: string | null;
}

export interface ProductHistoryRow {
  id: string;
  title: string;
  description: string | null;
  author_name: string | null;
  created_at: string | null;
}

export interface ProductDetail extends ProductRow {
  contracts: ContractRow[];
  history: ProductHistoryRow[];
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
  billing: ProductBilling;
  monthly_value: number;
  /** Implantação + pagamento único (reais). */
  one_time_total: number;
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
  website: string | null;
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

// ── Negociações: quadros, funis, negociações, tarefas ────────────────────────

export const BOARDS_COLLECTION = "boards";
export const PIPELINES_COLLECTION = "pipelines";
export const TASKS_COLLECTION = "tasks";
export const DEAL_HISTORY_SUBCOLLECTION = "history";

/** Máximo de etapas por funil. */
export const MAX_STAGES = 6;
export const MAX_CUSTOM_FIELDS = 20;

export interface PipelineStage {
  id: string;
  name: string;
  color: StageColor;
  /** % de chance de fechar a partir desta etapa (0–100) → valor ponderado. */
  probability: number;
}

export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  /** Só para "select". */
  options: string[];
  required: boolean;
}

/** Quadro (ex.: Comercial). Contém funis. */
export interface Board {
  id: string;
  name: string;
  description: string | null;
  order: number;
  archived: boolean;
}

/** Funil (ex.: Pré-venda) dentro de um quadro, com até 6 etapas. */
export interface Pipeline {
  id: string;
  board_id: string;
  name: string;
  description: string | null;
  order: number;
  archived: boolean;
  stages: PipelineStage[];
  custom_fields: CustomField[];
}

/** Negociação na lista/Kanban (serializável para o cliente). */
export interface DealRow {
  id: string;
  title: string;
  board_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  /** Ordem dentro da etapa (fracionário). */
  position: number;
  status: DealStatus;
  /** 1–5 estrelas. */
  qualification: number;
  value_cents: number | null;
  expected_close_date: string | null;
  owner_uid: string | null;
  owner_name: string | null;
  created_by_uid: string | null;
  created_by_name: string | null;
  origin: DealOrigin;
  lead_id: string | null;
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
  company: { id: string; name: string; cnpj: string | null } | null;
  /** Vencimento (ISO) de cada tarefa aberta, do mais próximo ao mais distante. A tela calcula hoje/atrasadas. */
  task_due: string[];
  source: LeadSource | null;
  context: string | null;
  custom: Record<string, string | number | boolean | null>;
  lost_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  stage_entered_at: string | null;
  /** Pausada até (AAAA-MM-DD), quando informado. */
  paused_until: string | null;
  /** Tempo acumulado (ms) nas etapas já deixadas: etapa → ms. */
  stage_time: Record<string, number>;
  last_activity_at: string | null;
  version: number;
}

/** Tarefa (lista/calendário). */
export interface TaskRecurrence {
  freq: TaskRecurrenceFreq;
  /** "A cada N dias" (nos outros, 1). */
  interval: number;
}

/** Vínculo da tarefa (nome guardado na própria tarefa: a lista não busca cada vínculo). */
export interface TaskParent {
  type: TaskParentType;
  id: string;
  label: string;
}

export interface TaskRow {
  id: string;
  /** Negociação da tarefa (compatibilidade: = parent.id quando o vínculo é negociação). */
  deal_id: string | null;
  parent: TaskParent | null;
  recurrence: TaskRecurrence | null;
  /** Lembrete: minutos antes do horário (null = sem lembrete). */
  remind_minutes: number | null;
  /** Próxima ocorrência criada ao concluir (recorrente). */
  next_task_id: string | null;
  created_by_name: string | null;
  title: string;
  type: TaskType;
  /** ISO (data e hora). */
  due_at: string;
  done_at: string | null;
  assignee_uid: string | null;
  assignee_name: string | null;
  notes: string | null;
  created_at: string | null;
}

/** Lead disponível para converter (lista do "Converter lead"). */
export interface ConvertibleLead {
  id: string;
  title: string;
  qualification: LeadQualification;
  source: LeadSource | null;
  entry: LeadEntry;
  owner_uid: string | null;
  estimated_value_cents: number | null;
  expected_close_date: string | null;
  interest_plan: string | null;
  notes: string | null;
  contact: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
  created_at: string | null;
}

// ── Página da negociação ─────────────────────────────────────────────────────

export const DEAL_FILES_COLLECTION = "deal_files";

/** Negociação completa (página de detalhes). */
export interface DealDetail extends DealRow {
  interest_plan: string | null;
  /** Quando o lead chegou (negociações convertidas). */
  lead_created_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_detail: string | null;
  paused_reason: string | null;
  contract: ContractSummary | null;
  contact_info: { id: string; name: string; email: string | null; phone: string | null; role: string | null } | null;
  company_info: {
    id: string;
    name: string;
    legal_name: string | null;
    cnpj: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
  } | null;
}

/** Registro do histórico da negociação. */
export interface DealHistoryRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  author_name: string | null;
  created_at: string | null;
}

/** Arquivo/proposta anexado. */
export interface DealFileRow {
  id: string;
  name: string;
  kind: "proposta" | "arquivo";
  mime: string;
  size: number;
  uploaded_by_name: string | null;
  created_at: string | null;
}

/** Produto ativo para "Marcar como vendida". */
export interface ProductOption {
  id: string;
  name: string;
  billing: ProductBilling;
  /** Reais; null = sob consulta. */
  monthly_price: number | null;
  one_time_price: number | null;
  setup_fee: number | null;
  price_label: string | null;
}
