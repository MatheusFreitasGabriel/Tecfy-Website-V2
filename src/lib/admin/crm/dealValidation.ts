/**
 * Validação de quadros, funis, negociações e tarefas (cliente e servidor — o servidor sempre revalida).
 * Módulo puro, sem Firebase.
 */
import { customFieldTypes, dealStatuses, stageColors, taskParents, taskRecurrences, taskReminders, taskTypes, type DealStatus } from "./options";
import { MAX_CUSTOM_FIELDS, MAX_STAGES, type CustomField, type Pipeline, type PipelineStage, type TaskRecurrence } from "./types";
import { parseCurrencyToCents, type FieldErrors, type Result } from "./validation";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const clean = (v: unknown): string =>
  str(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
export const isDocId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
/** Ids curtos de etapa/campo gerados no cliente. */
const isLocalId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{4,24}$/.test(v);

export const newLocalId = () => Math.random().toString(36).slice(2, 12).padEnd(8, "0");

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const DEAL_LIMITS = { title: 120, context: 4000, boardName: 60, pipelineName: 60, description: 300, stageName: 40, fieldLabel: 40, optionText: 40, maxOptions: 30, maxCents: 100_000_000_000 } as const;
export const DEAL_MAX_BYTES = 48 * 1024;

// ── Quadro ──

export interface BoardForm {
  name: string;
  description: string;
}

export function validateBoardForm(input: Partial<BoardForm>): Result<{ name: string; description: string | null }> {
  const errors: FieldErrors = {};
  const name = clean(input.name);
  if (!name) errors.name = "Dê um nome ao quadro.";
  else if (name.length > DEAL_LIMITS.boardName) errors.name = `Use até ${DEAL_LIMITS.boardName} caracteres.`;
  const description = clean(input.description);
  if (description.length > DEAL_LIMITS.description) errors.description = `Use até ${DEAL_LIMITS.description} caracteres.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, description: description || null } };
}

// ── Funil ──

export interface PipelineForm {
  board_id: string;
  name: string;
  description: string;
  stages: { id: string; name: string; color: string; probability: number | string }[];
  custom_fields: { id: string; label: string; type: string; options: string[]; required: boolean }[];
}

export type PipelineData = Pick<Pipeline, "board_id" | "name" | "description" | "stages" | "custom_fields">;

export function validatePipelineForm(input: Partial<PipelineForm>): Result<PipelineData> {
  const errors: FieldErrors = {};
  if (!isDocId(input.board_id)) errors.board_id = "Escolha o quadro.";
  const name = clean(input.name);
  if (!name) errors.name = "Dê um nome ao funil.";
  else if (name.length > DEAL_LIMITS.pipelineName) errors.name = `Use até ${DEAL_LIMITS.pipelineName} caracteres.`;
  const description = clean(input.description);
  if (description.length > DEAL_LIMITS.description) errors.description = `Use até ${DEAL_LIMITS.description} caracteres.`;

  const rawStages = Array.isArray(input.stages) ? input.stages : [];
  const stages: PipelineStage[] = [];
  if (rawStages.length < 1) errors.stages = "Crie pelo menos 1 etapa.";
  else if (rawStages.length > MAX_STAGES) errors.stages = `O funil pode ter no máximo ${MAX_STAGES} etapas.`;
  const seenStageIds = new Set<string>();
  rawStages.forEach((raw, i) => {
    const stageName = clean(raw?.name);
    const probability = Number(raw?.probability);
    if (!isLocalId(raw?.id) || seenStageIds.has(raw.id)) errors[`stage_${i}`] = "Etapa inválida.";
    else seenStageIds.add(raw.id);
    if (!stageName) errors[`stage_${i}`] = "Dê um nome à etapa.";
    else if (stageName.length > DEAL_LIMITS.stageName) errors[`stage_${i}`] = `Use até ${DEAL_LIMITS.stageName} caracteres.`;
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) errors[`stage_${i}_probability`] = "Use de 0 a 100%.";
    stages.push({ id: raw?.id ?? "", name: stageName, color: stageColors.is(raw?.color) ? raw.color : "slate", probability: Number.isFinite(probability) ? probability : 0 });
  });

  const rawFields = Array.isArray(input.custom_fields) ? input.custom_fields : [];
  const custom_fields: CustomField[] = [];
  if (rawFields.length > MAX_CUSTOM_FIELDS) errors.custom_fields = `Use até ${MAX_CUSTOM_FIELDS} campos.`;
  const seenFieldIds = new Set<string>();
  rawFields.forEach((raw, i) => {
    const label = clean(raw?.label);
    if (!isLocalId(raw?.id) || seenFieldIds.has(raw.id)) errors[`field_${i}`] = "Campo inválido.";
    else seenFieldIds.add(raw.id);
    if (!label) errors[`field_${i}`] = "Dê um nome ao campo.";
    else if (label.length > DEAL_LIMITS.fieldLabel) errors[`field_${i}`] = `Use até ${DEAL_LIMITS.fieldLabel} caracteres.`;
    const type = customFieldTypes.is(raw?.type) ? raw.type : null;
    if (!type) errors[`field_${i}`] = "Tipo inválido.";
    const options = Array.isArray(raw?.options) ? [...new Set(raw.options.map(clean).filter(Boolean))] : [];
    if (type === "select" && (options.length < 1 || options.length > DEAL_LIMITS.maxOptions)) {
      errors[`field_${i}`] = `A lista precisa de 1 a ${DEAL_LIMITS.maxOptions} opções.`;
    }
    if (options.some((o) => o.length > DEAL_LIMITS.optionText)) errors[`field_${i}`] = `Opções com até ${DEAL_LIMITS.optionText} caracteres.`;
    custom_fields.push({ id: raw?.id ?? "", label, type: type ?? "text", options: type === "select" ? options : [], required: raw?.required === true });
  });

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { board_id: input.board_id as string, name, description: description || null, stages, custom_fields } };
}

// ── Campos personalizados (valores) ──

export type CustomValues = Record<string, string | number | boolean | null>;

/** Valida e normaliza os valores dos campos personalizados contra a definição do funil. */
export function validateCustomValues(fields: CustomField[], raw: unknown): Result<CustomValues> {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const errors: FieldErrors = {};
  const out: CustomValues = {};
  for (const field of fields) {
    const value = input[field.id];
    if (value !== null && value !== undefined && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      errors[`custom_${field.id}`] = "Valor inválido.";
      out[field.id] = null;
      continue;
    }
    const empty = value === undefined || value === null || value === "";
    if (empty) {
      if (field.required) errors[`custom_${field.id}`] = "Campo obrigatório.";
      out[field.id] = null;
      continue;
    }
    switch (field.type) {
      case "text": {
        const text = clean(value);
        if (text.length > 500) errors[`custom_${field.id}`] = "Use até 500 caracteres.";
        out[field.id] = text || null;
        break;
      }
      case "number": {
        const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        if (!Number.isFinite(n) || Math.abs(n) > 1e12) errors[`custom_${field.id}`] = "Número inválido.";
        out[field.id] = Number.isFinite(n) ? n : null;
        break;
      }
      case "currency": {
        const cents = typeof value === "number" ? value : parseCurrencyToCents(String(value));
        if (cents === null || !Number.isInteger(cents) || cents < 0 || cents > DEAL_LIMITS.maxCents) errors[`custom_${field.id}`] = "Valor inválido.";
        out[field.id] = cents;
        break;
      }
      case "date": {
        if (!isValidDate(str(value))) errors[`custom_${field.id}`] = "Data inválida.";
        out[field.id] = str(value);
        break;
      }
      case "select": {
        if (!field.options.includes(str(value))) errors[`custom_${field.id}`] = "Opção inválida.";
        out[field.id] = str(value);
        break;
      }
      case "boolean":
        out[field.id] = value === true || value === "true";
        break;
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: out };
}

// ── Negociação ──

export interface DealForm {
  title: string;
  board_id: string;
  pipeline_id: string;
  stage_id: string;
  owner_uid: string;
  /** "R$ 12.000,00" */
  value: string;
  expected_close_date: string;
  /** "1".."5" */
  qualification: string;
  status: string;
  context: string;
  custom: Record<string, unknown>;
}

export interface DealCoreData {
  title: string;
  pipeline_id: string;
  stage_id: string;
  owner_uid: string;
  value_cents: number | null;
  expected_close_date: string | null;
  qualification: number;
  status: DealStatus;
  context: string | null;
}

export const emptyDealForm = (owner_uid = "", board_id = "", pipeline_id = "", stage_id = ""): DealForm => ({
  title: "",
  board_id,
  pipeline_id,
  stage_id,
  owner_uid,
  value: "",
  expected_close_date: "",
  qualification: "1",
  status: "em_andamento",
  context: "",
  custom: {},
});

/** Valida os campos comuns da negociação. `pipelines` = funis disponíveis (etapa precisa existir no funil). */
export function validateDealForm(input: Partial<DealForm>, ownerUids: string[], pipelines: Pick<Pipeline, "id" | "stages">[]): Result<DealCoreData> {
  const errors: FieldErrors = {};
  const title = clean(input.title);
  if (!title) errors.title = "Dê um nome à negociação.";
  else if (title.length > DEAL_LIMITS.title) errors.title = `Use até ${DEAL_LIMITS.title} caracteres.`;

  const pipeline = pipelines.find((p) => p.id === input.pipeline_id);
  if (!pipeline) errors.pipeline_id = "Escolha o funil.";
  else if (!pipeline.stages.some((s) => s.id === input.stage_id)) errors.stage_id = "Escolha a etapa.";

  const owner = str(input.owner_uid);
  if (!owner) errors.owner_uid = "Escolha o responsável.";
  else if (!ownerUids.includes(owner)) errors.owner_uid = "Responsável inválido.";

  const cents = parseCurrencyToCents(str(input.value));
  if (cents !== null && cents > DEAL_LIMITS.maxCents) errors.value = "Valor alto demais.";

  const date = str(input.expected_close_date);
  if (date && !isValidDate(date)) errors.expected_close_date = "Data inválida.";

  const qualification = Number(input.qualification);
  if (!Number.isInteger(qualification) || qualification < 1 || qualification > 5) errors.qualification = "Qualificação inválida.";

  if (!dealStatuses.is(input.status)) errors.status = "Status inválido.";

  const context = str(input.context).trim();
  if (context.length > DEAL_LIMITS.context) errors.context = `Use até ${DEAL_LIMITS.context} caracteres.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      pipeline_id: input.pipeline_id as string,
      stage_id: input.stage_id as string,
      owner_uid: owner,
      value_cents: cents,
      expected_close_date: date || null,
      qualification,
      status: input.status as DealStatus,
      context: context || null,
    },
  };
}

/** Contato/empresa vinculados: ids existentes (criar novos usa os cadastros de Contatos/Empresas). */
function parseLinks(body: Record<string, unknown>): { contact_id: string | null; company_id: string | null } | null {
  const contact_id = body.contact_id ? (isDocId(body.contact_id) ? body.contact_id : undefined) : null;
  const company_id = body.company_id ? (isDocId(body.company_id) ? body.company_id : undefined) : null;
  if (contact_id === undefined || company_id === undefined || (!contact_id && !company_id)) return null;
  return { contact_id, company_id };
}

export interface CreateDealPayload {
  /** UUID gerado pelo modal a cada envio (idempotência: clique duplo não duplica). */
  request_id: string;
  deal: DealForm;
  contact_id: string;
  company_id: string;
}

export interface ParsedCreateDeal {
  request_id: string;
  deal: DealCoreData;
  custom: unknown;
  contact_id: string | null;
  company_id: string | null;
}

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

/** Negociação manual: exige contato OU empresa. */
export function parseCreateDealPayload(body: Record<string, unknown>, ownerUids: string[], pipelines: Pick<Pipeline, 'id' | 'stages'>[]): ParsedCreateDeal | null {
  if (!isUuid(body.request_id)) return null;
  const deal = body.deal && typeof body.deal === 'object' ? validateDealForm(body.deal as Partial<DealForm>, ownerUids, pipelines) : null;
  if (!deal?.ok) return null;
  const links = parseLinks(body);
  if (!links) return null;
  return { request_id: body.request_id.toLowerCase(), deal: deal.value, custom: (body.deal as Record<string, unknown>).custom, ...links };
}

export interface ConvertLeadPayload {
  lead_id: string;
  deal: DealForm;
  /** Contato/empresa vinculados (id existente ou vazio). Começam com os do lead. */
  contact_id: string;
  company_id: string;
}

export interface ParsedConvertLead {
  lead_id: string;
  deal: DealCoreData;
  custom: unknown;
  contact_id: string | null;
  company_id: string | null;
}

export function parseConvertLeadPayload(body: Record<string, unknown>, ownerUids: string[], pipelines: Pick<Pipeline, "id" | "stages">[]): ParsedConvertLead | null {
  if (!isDocId(body.lead_id)) return null;
  const deal = body.deal && typeof body.deal === "object" ? validateDealForm(body.deal as Partial<DealForm>, ownerUids, pipelines) : null;
  if (!deal?.ok) return null;
  const links = parseLinks(body);
  if (!links) return null;
  return { lead_id: body.lead_id, deal: deal.value, custom: (body.deal as Record<string, unknown>).custom, ...links };
}

// ── Mover / ações em massa ──

export interface MoveDealInput {
  deal_id: string;
  stage_id: string;
  position: number;
  /** Versão que a tela conhecia (concorrência otimista). */
  version: number;
}

export function parseMoveDeal(body: Record<string, unknown>): MoveDealInput | null {
  const position = Number(body.position);
  const version = Number(body.version);
  if (!isDocId(body.deal_id) || !isLocalId(body.stage_id) || !Number.isFinite(position) || Math.abs(position) > 1e15 || !Number.isInteger(version) || version < 0) {
    return null;
  }
  return { deal_id: body.deal_id, stage_id: body.stage_id, position, version };
}

export type BulkDealAction =
  | { action: "set_status"; ids: string[]; value: DealStatus }
  | { action: "set_owner"; ids: string[]; value: string }
  | { action: "set_qualification"; ids: string[]; value: number }
  | { action: "set_stage"; ids: string[]; value: string }
  /** value = "<funil>:<etapa>" — leva para outro funil. */
  | { action: "set_pipeline"; ids: string[]; value: string; pipeline_id: string; stage_id: string };

export const BULK_DEALS_MAX = 200;

export function parseBulkDeals(body: Record<string, unknown>): BulkDealAction | null {
  const { ids: raw, action, value } = body;
  if (!Array.isArray(raw) || !raw.length || raw.length > BULK_DEALS_MAX || !raw.every(isDocId)) return null;
  const ids = [...new Set(raw as string[])];
  switch (action) {
    case "set_status":
      // Vendida/perdida têm fluxo próprio (contrato / motivo) — não em massa.
      return value === "em_andamento" || value === "pausada" ? { action, ids, value } : null;
    case "set_owner":
      return isDocId(value) ? { action, ids, value } : null;
    case "set_qualification": {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= 5 ? { action, ids, value: n } : null;
    }
    case "set_stage":
      return isLocalId(value) ? { action, ids, value } : null;
    case "set_pipeline": {
      const [pipelineId, stageId] = typeof value === "string" ? value.split(":") : [];
      return isDocId(pipelineId) && isLocalId(stageId) ? { action, ids, value: value as string, pipeline_id: pipelineId, stage_id: stageId } : null;
    }
    default:
      return null;
  }
}

// ── Tarefas ──

export interface TaskForm {
  /** Atalho antigo: tarefa da negociação (= parent_type "deal"). */
  deal_id: string;
  /** "" = avulsa; deal | lead | contact | company. */
  parent_type?: string;
  parent_id?: string;
  /** "" = não repete. */
  recurrence?: string;
  /** Para "a cada N dias". */
  recurrence_interval?: string;
  /** "" = sem lembrete; minutos antes. */
  remind_minutes?: string;
  title: string;
  type: string;
  /** "YYYY-MM-DD" */
  due_date: string;
  /** "HH:mm" */
  due_time: string;
  assignee_uid: string;
  notes: string;
}

export interface TaskData {
  deal_id: string | null;
  /** Vínculo (negociação/lead/contato/empresa) — null = avulsa. */
  parent?: { type: "deal" | "lead" | "contact" | "company"; id: string } | null;
  recurrence?: TaskRecurrence | null;
  remind_minutes?: number | null;
  title: string;
  type: string;
  /** Instante (horário de Brasília → UTC). */
  due_at: Date;
  assignee_uid: string;
  notes: string | null;
}

/** "2026-11-20" + "14:30" (Brasília, UTC−3) → Date. */
export function brazilDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-03:00`);
}

export function validateTaskForm(input: Partial<TaskForm>, ownerUids: string[]): Result<TaskData> {
  const errors: FieldErrors = {};
  const title = clean(input.title);
  if (!title) errors.title = "Descreva a tarefa.";
  else if (title.length > 120) errors.title = "Use até 120 caracteres.";
  if (!taskTypes.is(input.type)) errors.type = "Tipo inválido.";
  const date = str(input.due_date);
  const time = str(input.due_time) || "09:00";
  if (!isValidDate(date)) errors.due_date = "Escolha a data.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.due_time = "Hora inválida.";
  const assignee = str(input.assignee_uid);
  if (!ownerUids.includes(assignee)) errors.assignee_uid = "Escolha o responsável.";
  const notes = str(input.notes).trim();
  if (notes.length > 2000) errors.notes = "Use até 2.000 caracteres.";
  const dealId = input.deal_id ? (isDocId(input.deal_id) ? input.deal_id : undefined) : null;
  if (dealId === undefined) errors.deal_id = "Negociação inválida.";
  // Vínculo: explícito (parent_type/parent_id) ou o atalho deal_id.
  let parent: TaskData["parent"] = null;
  if (input.parent_type) {
    if (!taskParents.is(input.parent_type) || !isDocId(input.parent_id)) errors.parent_id = "Escolha o vínculo.";
    else parent = { type: input.parent_type, id: input.parent_id };
  } else if (dealId) parent = { type: "deal", id: dealId };
  let recurrence: TaskRecurrence | null = null;
  if (input.recurrence) {
    const interval = input.recurrence === "every_n_days" ? Number(input.recurrence_interval) : 1;
    if (!taskRecurrences.is(input.recurrence)) errors.recurrence = "Repetição inválida.";
    else if (!Number.isInteger(interval) || interval < 1 || interval > 365) errors.recurrence_interval = "Use de 1 a 365 dias.";
    else recurrence = { freq: input.recurrence, interval };
  }
  let remind: number | null = null;
  if (input.remind_minutes !== undefined && input.remind_minutes !== "") {
    if (!taskReminders.is(String(input.remind_minutes))) errors.remind_minutes = "Lembrete inválido.";
    else remind = Number(input.remind_minutes);
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      deal_id: parent?.type === "deal" ? parent.id : null,
      parent,
      recurrence,
      remind_minutes: remind,
      title,
      type: input.type as string,
      due_at: brazilDateTime(date, time),
      assignee_uid: assignee,
      notes: notes || null,
    },
  };
}

// ── Página da negociação: edição, venda, perda, registros, arquivos ──

export interface DealChanges {
  title?: string;
  value_cents?: number | null;
  expected_close_date?: string | null;
  qualification?: number;
  status?: "em_andamento" | "pausada";
  context?: string | null;
  owner_uid?: string;
  stage_id?: string;
  custom?: Record<string, unknown>;
  /** Só vincula quando a negociação ainda não tem (nunca troca um vínculo existente). */
  contact_id?: string;
  company_id?: string;
}

/** PATCH da negociação: `{ version, changes }` — só os campos enviados mudam. */
export function parseDealUpdate(body: Record<string, unknown>): { version: number; changes: DealChanges } | { errors: FieldErrors } | null {
  const version = Number(body.version);
  const raw = body.changes && typeof body.changes === "object" && !Array.isArray(body.changes) ? (body.changes as Record<string, unknown>) : null;
  if (!Number.isInteger(version) || version < 0 || !raw) return null;
  const errors: FieldErrors = {};
  const changes: DealChanges = {};
  if ("title" in raw) {
    const title = clean(raw.title);
    if (!title || title.length > DEAL_LIMITS.title) errors.title = "Nome obrigatório (até 120 caracteres).";
    else changes.title = title;
  }
  if ("value" in raw) {
    const cents = parseCurrencyToCents(str(raw.value));
    if (cents !== null && cents > DEAL_LIMITS.maxCents) errors.value = "Valor alto demais.";
    else changes.value_cents = cents;
  }
  if ("expected_close_date" in raw) {
    const date = str(raw.expected_close_date);
    if (date && !isValidDate(date)) errors.expected_close_date = "Data inválida.";
    else changes.expected_close_date = date || null;
  }
  if ("qualification" in raw) {
    const n = Number(raw.qualification);
    if (!Number.isInteger(n) || n < 1 || n > 5) errors.qualification = "Qualificação inválida.";
    else changes.qualification = n;
  }
  if ("status" in raw) {
    if (raw.status !== "em_andamento" && raw.status !== "pausada") errors.status = "Status inválido.";
    else changes.status = raw.status;
  }
  if ("context" in raw) {
    const context = str(raw.context).trim();
    if (context.length > DEAL_LIMITS.context) errors.context = `Use até ${DEAL_LIMITS.context} caracteres.`;
    else changes.context = context || null;
  }
  if ("owner_uid" in raw) {
    if (!isDocId(raw.owner_uid)) errors.owner_uid = "Responsável inválido.";
    else changes.owner_uid = raw.owner_uid;
  }
  if ("stage_id" in raw) {
    if (!isLocalId(raw.stage_id)) errors.stage_id = "Etapa inválida.";
    else changes.stage_id = raw.stage_id;
  }
  for (const key of ["contact_id", "company_id"] as const) {
    if (key in raw) {
      if (!isDocId(raw[key])) errors[key] = "Cadastro inválido.";
      else changes[key] = raw[key] as string;
    }
  }
  if ("custom" in raw) {
    if (!raw.custom || typeof raw.custom !== "object" || Array.isArray(raw.custom)) errors.custom = "Campos inválidos.";
    else changes.custom = raw.custom as Record<string, unknown>;
  }
  if (Object.keys(errors).length) return { errors };
  if (!Object.keys(changes).length) return null;
  return { version, changes };
}

export interface WonInput {
  /** Produto cadastrado (ou null quando foi descrito à mão). */
  product_id: string | null;
  /** Descrição livre do que foi vendido (quando não há produto cadastrado que sirva). */
  product_name: string | null;
  /** Centavos (mensal). */
  monthly_cents: number;
  signed_date: string;
}

export function parseWon(body: Record<string, unknown>): WonInput | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const productId = isDocId(body.product_id) ? body.product_id : null;
  const productName = clean(body.product_name).slice(0, 81);
  if (!productId && !productName) errors.product_id = "Escolha o produto ou descreva o que foi vendido.";
  if (!productId && productName.length > 80) errors.product_name = "Use até 80 caracteres.";
  const cents = parseCurrencyToCents(str(body.monthly_value));
  if (!cents || cents <= 0 || cents > DEAL_LIMITS.maxCents) errors.monthly_value = "Informe o valor mensal fechado.";
  const date = str(body.signed_date);
  if (!isValidDate(date)) errors.signed_date = "Informe a data da venda.";
  if (Object.keys(errors).length) return { errors };
  return { product_id: productId, product_name: productId ? null : productName, monthly_cents: cents!, signed_date: date };
}

export function parseLost(body: Record<string, unknown>, reasons: readonly string[]): { reason: string; detail: string | null } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!reasons.includes(str(body.reason))) errors.reason = "Escolha o motivo.";
  const detail = str(body.detail).trim();
  if (detail.length > 1000) errors.detail = "Use até 1.000 caracteres.";
  if (body.reason === "outro" && !detail) errors.detail = "Conte o motivo.";
  if (Object.keys(errors).length) return { errors };
  return { reason: str(body.reason), detail: detail || null };
}

export type ActivityKind = "whatsapp" | "note" | "call";

/** Registro manual no histórico (observação, ligação) ou automático (abriu o WhatsApp). */
export function parseActivity(body: Record<string, unknown>): { kind: ActivityKind; text: string } | null {
  const kind = body.kind;
  if (kind !== "whatsapp" && kind !== "note" && kind !== "call") return null;
  const text = str(body.text).trim();
  if ((kind !== "whatsapp" && !text) || text.length > 2000) return null;
  return { kind, text };
}

export interface UploadRequest {
  name: string;
  size: number;
  mime: string;
  kind: "proposta" | "arquivo";
}

/** Pedido de upload: nome limpo, tipo permitido, tamanho dentro do limite. */
export function parseUploadRequest(body: Record<string, unknown>, allowed: Record<string, { ext: string }>, maxBytes: number): UploadRequest | null {
  const mime = str(body.mime);
  const size = Number(body.size);
  const kind = body.kind === "proposta" ? "proposta" : body.kind === "arquivo" ? "arquivo" : null;
  const type = allowed[mime];
  if (!type || !kind || !Number.isInteger(size) || size <= 0 || size > maxBytes) return null;
  // Nome: sem caminho nem caracteres perigosos; a extensão é SEMPRE a do tipo verificado.
  let name = str(body.name).split(/[\\/]/).pop() ?? "";
  name = name.replace(/[\u0000-\u001F\u007F"<>|:*?]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, "").trim() || "arquivo";
  return { name: `${base}.${type.ext}`, size, mime, kind };
}

// ── Pausar / excluir / tarefas (faxina) ──

const brazilToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Pausar: `{ reason?, resume_date? }` — a data (hoje ou depois) vira uma tarefa "Retomar negociação". */
export function parsePause(body: Record<string, unknown>): { reason: string | null; resume_date: string | null } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const reason = str(body.reason).trim();
  if (reason.length > 500) errors.reason = "Use até 500 caracteres.";
  const date = str(body.resume_date);
  if (date && !isValidDate(date)) errors.resume_date = "Data inválida.";
  else if (date && date < brazilToday()) errors.resume_date = "Escolha hoje ou uma data futura.";
  if (Object.keys(errors).length) return { errors };
  return { reason: reason || null, resume_date: date || null };
}

/** Editar/reagendar tarefa: mesmos campos do cadastro (a negociação não muda). */
export function validateTaskEdit(input: Partial<TaskForm>, ownerUids: string[]): Result<Omit<TaskData, "deal_id">> {
  const result = validateTaskForm({ ...input, deal_id: "" }, ownerUids);
  if (!result.ok) return result;
  const { deal_id: _ignored, ...value } = result.value;
  void _ignored;
  return { ok: true, value };
}
