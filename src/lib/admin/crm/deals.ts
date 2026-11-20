import "server-only";
import { FieldPath, FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { dealOrigins, dealStatuses, leadSources, STARS_FROM_LEAD_QUALIFICATION, leadQualifications, taskTypes, type DealStatus } from "./options";
import {
  BOARDS_COLLECTION,
  COMPANIES_COLLECTION,
  CONTACTS_COLLECTION,
  DEAL_HISTORY_SUBCOLLECTION,
  DEALS_COLLECTION,
  LEAD_NOTES_SUBCOLLECTION,
  LEADS_COLLECTION,
  PIPELINES_COLLECTION,
  TASKS_COLLECTION,
  type Board,
  type CustomField,
  type DealRow,
  type Pipeline,
  type PipelineStage,
  type TaskRow,
} from "./types";
import { validateCustomValues, type BulkDealAction, type CustomValues, type DealCoreData, type MoveDealInput, type PipelineData, type TaskData } from "./dealValidation";
import { systemNoteData } from "./notes";
import type { Actor } from "./leads";

/**
 * Negociações: quadros → funis (até 6 etapas) → negociações, com histórico só-acrescenta e tarefas.
 * Regras de integridade (as mesmas dos leads, validadas no teste de stress):
 *  - transações só com leitura direta de documentos (nunca consultas);
 *  - criação idempotente (id derivado do request_id / do lead);
 *  - posição fracionária: arrastar grava UM documento, nunca a coluna inteira.
 */

export const DEALS_LIST_LIMIT = 3000;
export const DEALS_PAGE_SIZE = 1000;
const MAX_ATTEMPTS = 15;

/** Quadro/funil criados na primeira abertura (ids fixos → criar duas vezes ao mesmo tempo não duplica). */
export const DEFAULT_BOARD_ID = "comercial";
export const DEFAULT_PIPELINE_ID = "vendas";
const DEFAULT_STAGES: PipelineStage[] = [
  { id: "qualific", name: "Qualificação", color: "slate", probability: 10 },
  { id: "diagnost", name: "Diagnóstico", color: "blue", probability: 25 },
  { id: "proposta", name: "Proposta enviada", color: "violet", probability: 50 },
  { id: "negociac", name: "Negociação", color: "amber", probability: 75 },
  { id: "fechamen", name: "Fechamento", color: "green", probability: 90 },
];

export class DealNotFoundError extends Error {
  constructor() {
    super("deal_not_found");
  }
}
export class PipelineNotFoundError extends Error {
  constructor() {
    super("pipeline_changed");
  }
}
export class MissingLinkError extends Error {
  constructor() {
    super("missing_link");
  }
}
export class InvalidCustomValuesError extends Error {
  constructor(public errors: Record<string, string>) {
    super("invalid_custom");
  }
}
export class LeadAlreadyConvertedError extends Error {
  constructor(public dealId: string) {
    super("already_converted");
  }
}
export class LeadNotFoundForDealError extends Error {}
export class StaleDealError extends Error {}
/** Negociação vendida/perdida: só muda depois de reabrir. */
export class DealClosedError extends Error {
  constructor() {
    super("deal_closed");
  }
}
const isClosed = (status: unknown) => status === "vendida" || status === "perdida";

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const iso = (value: unknown): string | null =>
  value && typeof (value as Timestamp).toDate === "function" ? (value as Timestamp).toDate().toISOString() : null;

async function getAllByIds(db: Firestore, collection: string, ids: Set<string>) {
  const list = [...ids];
  const snaps: DocumentSnapshot[] = [];
  for (let i = 0; i < list.length; i += 300) {
    snaps.push(...(await db.getAll(...list.slice(i, i + 300).map((id) => db.collection(collection).doc(id)))));
  }
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s]));
}

/**
 * Ao SAIR de uma etapa: soma o tempo que a negociação ficou nela em `stage_time.<etapa>` (ms).
 * Vai na mesma gravação que muda a etapa (dias por etapa na página e nas análises).
 */
export function stageExitPatch(snap: DocumentSnapshot, fromStage: string | null | undefined): Record<string, unknown> {
  if (!fromStage || !/^[a-z0-9]{4,24}$/.test(fromStage)) return {};
  const entered = (snap.get("stage_entered_at") ?? snap.get("created_at")) as Timestamp | undefined;
  const ms = entered && typeof entered.toMillis === "function" ? Math.max(0, Date.now() - entered.toMillis()) : 0;
  return ms ? { [`stage_time.${fromStage}`]: FieldValue.increment(ms) } : {};
}

/** Registro do histórico da negociação (só acrescenta). */
export function historyData(type: string, title: string, description: string | null, actor: { uid: string | null; name: string }, meta: Record<string, unknown> = {}) {
  return { type, title, description, meta, author_uid: actor.uid, author_name: actor.name, created_at: FieldValue.serverTimestamp() };
}
const historyRef = (deal: DocumentReference) => deal.collection(DEAL_HISTORY_SUBCOLLECTION).doc();

// ── Quadros e funis ──────────────────────────────────────────────────────────

function toBoard(doc: DocumentSnapshot): Board {
  const d = doc.data() ?? {};
  return { id: doc.id, name: str(d.name) ?? "Sem nome", description: str(d.description), order: typeof d.order === "number" ? d.order : 0, archived: d.archived === true };
}

export function toPipeline(doc: DocumentSnapshot): Pipeline {
  const d = doc.data() ?? {};
  const stages: PipelineStage[] = Array.isArray(d.stages)
    ? d.stages.filter((s: unknown) => s && typeof s === "object").map((s: Record<string, unknown>) => ({
        id: String(s.id),
        name: str(s.name) ?? "Etapa",
        color: (str(s.color) ?? "slate") as PipelineStage["color"],
        probability: typeof s.probability === "number" ? s.probability : 0,
      }))
    : [];
  const custom_fields: CustomField[] = Array.isArray(d.custom_fields) ? (d.custom_fields as CustomField[]) : [];
  return {
    id: doc.id,
    board_id: str(d.board_id) ?? DEFAULT_BOARD_ID,
    name: str(d.name) ?? "Sem nome",
    description: str(d.description),
    order: typeof d.order === "number" ? d.order : 0,
    archived: d.archived === true,
    stages,
    custom_fields,
  };
}

/** Cria o quadro "Comercial" + funil "Vendas" se ainda não há nenhum quadro. Idempotente. */
async function ensureDefaultSetup(db: Firestore, actor: { uid: string | null; name: string }): Promise<void> {
  const boardRef = db.collection(BOARDS_COLLECTION).doc(DEFAULT_BOARD_ID);
  const pipelineRef = db.collection(PIPELINES_COLLECTION).doc(DEFAULT_PIPELINE_ID);
  await db.runTransaction(async (tx) => {
    const [board, pipeline] = await tx.getAll(boardRef, pipelineRef);
    const now = FieldValue.serverTimestamp();
    const authorship = { created_by_uid: actor.uid, created_by_name: actor.name, created_at: now, updated_at: now };
    if (!board.exists) tx.create(boardRef, { name: "Comercial", description: "Funis de venda da Tecfy.", order: 0, archived: false, ...authorship });
    if (!pipeline.exists) {
      tx.create(pipelineRef, { board_id: DEFAULT_BOARD_ID, name: "Vendas", description: "Do primeiro contato ao fechamento.", order: 0, archived: false, stages: DEFAULT_STAGES, custom_fields: [], ...authorship });
    }
  });
}

/** Todos os quadros e funis (inclusive arquivados — a tela de gerenciar mostra). */
export async function listPipelineSetup(): Promise<{ boards: Board[]; pipelines: Pipeline[] }> {
  const db = getAdminDb();
  let [boards, pipelines] = await Promise.all([db.collection(BOARDS_COLLECTION).get(), db.collection(PIPELINES_COLLECTION).get()]);
  if (boards.empty) {
    await ensureDefaultSetup(db, { uid: null, name: "Sistema" });
    [boards, pipelines] = await Promise.all([db.collection(BOARDS_COLLECTION).get(), db.collection(PIPELINES_COLLECTION).get()]);
  }
  const byOrder = <T extends { order: number; name: string }>(a: T, b: T) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR");
  return { boards: boards.docs.map(toBoard).sort(byOrder), pipelines: pipelines.docs.map(toPipeline).sort(byOrder) };
}

export async function createBoard(data: { name: string; description: string | null }, actor: Actor): Promise<Board> {
  const ref = getAdminDb().collection(BOARDS_COLLECTION).doc();
  const now = FieldValue.serverTimestamp();
  const order = Date.now();
  await ref.create({ ...data, order, archived: false, created_by_uid: actor.uid, created_by_name: actor.name, created_at: now, updated_at: now });
  return { id: ref.id, ...data, order, archived: false };
}

/** Atualiza nome/descrição/arquivado do quadro. Retorna false se não existe. */
export async function updateBoard(id: string, patch: Partial<{ name: string; description: string | null; archived: boolean }>): Promise<boolean> {
  try {
    await getAdminDb().collection(BOARDS_COLLECTION).doc(id).update({ ...patch, updated_at: FieldValue.serverTimestamp() });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 5) return false; // NOT_FOUND
    throw error;
  }
}

export async function createPipeline(data: PipelineData, actor: Actor): Promise<Pipeline> {
  const db = getAdminDb();
  const ref = db.collection(PIPELINES_COLLECTION).doc();
  const order = Date.now();
  await db.runTransaction(async (tx) => {
    const board = await tx.get(db.collection(BOARDS_COLLECTION).doc(data.board_id));
    if (!board.exists) throw new PipelineNotFoundError();
    const now = FieldValue.serverTimestamp();
    tx.create(ref, { ...data, order, archived: false, created_by_uid: actor.uid, created_by_name: actor.name, created_at: now, updated_at: now });
  });
  return { id: ref.id, ...data, order, archived: false };
}

/**
 * Salva o funil. Etapas removidas que tinham negociações: elas vão para `stageMoves[removida]`
 * (ou a primeira etapa). Enquanto isso, ninguém consegue mover negociação para uma etapa removida
 * (mover relê o funil na transação).
 */
export async function updatePipeline(id: string, data: PipelineData, stageMoves: Record<string, string>, actor: Actor): Promise<{ pipeline: Pipeline; moved: number }> {
  const db = getAdminDb();
  const ref = db.collection(PIPELINES_COLLECTION).doc(id);
  const removed = await db.runTransaction(async (tx) => {
    const [snap, board] = await tx.getAll(ref, db.collection(BOARDS_COLLECTION).doc(data.board_id));
    if (!snap.exists || !board.exists) throw new PipelineNotFoundError();
    const before = toPipeline(snap);
    tx.update(ref, { ...data, updated_at: FieldValue.serverTimestamp(), updated_by_name: actor.name });
    const keep = new Set(data.stages.map((s) => s.id));
    return before.stages.filter((s) => !keep.has(s.id)).map((s) => s.id);
  });

  let moved = 0;
  if (removed.length) {
    const fallback = data.stages[0].id;
    const valid = new Set(data.stages.map((s) => s.id));
    const snap = await db.collection(DEALS_COLLECTION).where("pipeline_id", "==", id).where("stage_id", "in", removed.slice(0, 30)).get();
    const nameOf = new Map(data.stages.map((s) => [s.id, s.name]));
    // Uma gravação por negociação (BulkWriter): se alguma for excluída no meio, só ela falha.
    // (Quem falhar continua aparecendo na 1ª etapa: a leitura reposiciona etapas que não existem mais.)
    const writer = db.bulkWriter();
    writer.onWriteError(() => false);
    for (const doc of snap.docs) {
      const target = valid.has(stageMoves[doc.get("stage_id")]) ? stageMoves[doc.get("stage_id")] : fallback;
      writer
        .update(doc.ref, { ...stageExitPatch(doc, doc.get("stage_id")), stage_id: target, stage_entered_at: FieldValue.serverTimestamp(), version: FieldValue.increment(1), updated_at: FieldValue.serverTimestamp() })
        .then(() => {
          moved++;
          return writer.create(historyRef(doc.ref), historyData("stage", "Etapa alterada", `A etapa anterior foi removida do funil. Agora em “${nameOf.get(target)}”.`, actor));
        })
        .catch(() => undefined);
    }
    await writer.close();
  }
  const fresh = await ref.get();
  return { pipeline: toPipeline(fresh), moved };
}

export async function setPipelineArchived(id: string, archived: boolean): Promise<boolean> {
  try {
    await getAdminDb().collection(PIPELINES_COLLECTION).doc(id).update({ archived, updated_at: FieldValue.serverTimestamp() });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 5) return false;
    throw error;
  }
}

// ── Leitura das negociações ──────────────────────────────────────────────────

const LEGACY_STATUS: Record<string, DealStatus> = { open: "em_andamento", won: "vendida", lost: "perdida", paused: "pausada" };

export function toDealRow(doc: DocumentSnapshot, contacts: Map<string, DocumentSnapshot>, companies: Map<string, DocumentSnapshot>): DealRow {
  const d = doc.data() ?? {};
  const contactSnap = str(d.contact_id) ? contacts.get(d.contact_id) : undefined;
  const companySnap = str(d.company_id) ? companies.get(d.company_id) : undefined;
  const status = dealStatuses.is(d.status) ? d.status : (LEGACY_STATUS[String(d.status)] ?? "em_andamento");
  const value = typeof d.value_cents === "number" ? d.value_cents : typeof d.estimated_value_cents === "number" ? d.estimated_value_cents : null;
  return {
    id: doc.id,
    title: str(d.title) ?? "Sem nome",
    board_id: str(d.board_id),
    pipeline_id: str(d.pipeline_id),
    stage_id: str(d.stage_id),
    position: typeof d.position === "number" ? d.position : -(d.created_at?.toMillis?.() ?? 0),
    status,
    qualification: Number.isInteger(d.qualification) && d.qualification >= 1 && d.qualification <= 5 ? d.qualification : 1,
    value_cents: value,
    expected_close_date: str(d.expected_close_date),
    owner_uid: str(d.owner_uid),
    owner_name: str(d.owner_name),
    created_by_uid: str(d.created_by_uid),
    created_by_name: str(d.created_by_name),
    origin: dealOrigins.is(d.origin) ? d.origin : d.lead_id ? "lead_manual" : "manual",
    lead_id: str(d.lead_id),
    contact: contactSnap
      ? { id: contactSnap.id, name: str(contactSnap.get("name")) ?? "Sem nome", email: str(contactSnap.get("email")), phone: str(contactSnap.get("phone")) }
      : null,
    company: companySnap ? { id: companySnap.id, name: str(companySnap.get("trade_name")) ?? "Sem nome", cnpj: str(companySnap.get("cnpj")) } : null,
    task_due: [],
    source: leadSources.is(d.source) ? d.source : null,
    context: str(d.context),
    custom: d.custom && typeof d.custom === "object" ? (d.custom as DealRow["custom"]) : {},
    lost_reason: str(d.lost_reason),
    created_at: iso(d.created_at),
    updated_at: iso(d.updated_at) ?? iso(d.created_at),
    stage_entered_at: iso(d.stage_entered_at) ?? iso(d.created_at),
    paused_until: str(d.paused_until),
    stage_time: d.stage_time && typeof d.stage_time === "object" ? Object.fromEntries(Object.entries(d.stage_time as Record<string, unknown>).filter(([, v]) => typeof v === "number")) as Record<string, number> : {},
    last_activity_at: iso(d.last_activity_at) ?? iso(d.updated_at) ?? iso(d.created_at),
    version: typeof d.version === "number" ? d.version : 0,
  };
}

async function rowsFromSnaps(db: Firestore, docs: DocumentSnapshot[]): Promise<DealRow[]> {
  const contactIds = new Set<string>();
  const companyIds = new Set<string>();
  for (const doc of docs) {
    const c = str(doc.get("contact_id"));
    const e = str(doc.get("company_id"));
    if (c) contactIds.add(c);
    if (e) companyIds.add(e);
  }
  const [contacts, companies] = await Promise.all([getAllByIds(db, CONTACTS_COLLECTION, contactIds), getAllByIds(db, COMPANIES_COLLECTION, companyIds)]);
  return docs.map((doc) => toDealRow(doc, contacts, companies));
}

/** Cursor exato da última negociação da página: timestamp com nanossegundos + id. */
export interface DealsCursor {
  s: number;
  n: number;
  id: string;
}

/** Uma página de negociações (mais recentes primeiro), com desempate pelo id (sem pular/repetir). */
export async function listDealsPage(after: DealsCursor | null, size = DEALS_PAGE_SIZE): Promise<{ rows: DealRow[]; next: DealsCursor | null }> {
  const db = getAdminDb();
  let query = db.collection(DEALS_COLLECTION).orderBy("created_at", "desc").orderBy(FieldPath.documentId(), "desc");
  if (after) query = query.startAfter(new Timestamp(after.s, after.n), after.id);
  const snap = await query.limit(size).get();
  const rows = await rowsFromSnaps(db, snap.docs);
  const last = snap.docs[snap.docs.length - 1];
  const ts = last?.get("created_at") as Timestamp | undefined;
  const next = snap.size === size && ts && typeof ts.seconds === "number" ? { s: ts.seconds, n: ts.nanoseconds, id: last.id } : null;
  return { rows, next };
}

export async function getDealRows(ids: string[]): Promise<DealRow[]> {
  const db = getAdminDb();
  const found = await getAllByIds(db, DEALS_COLLECTION, new Set(ids));
  return rowsFromSnaps(db, [...found.values()]);
}

/** Vencimentos das tarefas abertas, por negociação (para os indicadores e alertas da tela). */
export async function listOpenTaskDue(limit = 5000): Promise<{ deal_id: string; due_at: string }[]> {
  const snap = await getAdminDb().collection(TASKS_COLLECTION).where("done", "==", false).select("deal_id", "due_at").limit(limit).get();
  const out: { deal_id: string; due_at: string }[] = [];
  for (const doc of snap.docs) {
    const dealId = str(doc.get("deal_id"));
    const due = iso(doc.get("due_at"));
    if (dealId && due) out.push({ deal_id: dealId, due_at: due });
  }
  return out;
}

/**
 * Coloca cada negociação num funil/etapa que existe: as antigas (antes dos funis) ou com etapa
 * removida caem na primeira etapa do funil padrão / do próprio funil. Só na leitura, sem gravar.
 */
export function placeDeals(rows: DealRow[], pipelines: Pipeline[], tasks: { deal_id: string; due_at: string }[]): DealRow[] {
  const byId = new Map(pipelines.map((p) => [p.id, p]));
  const fallback = byId.get(DEFAULT_PIPELINE_ID) ?? pipelines.find((p) => !p.archived && p.stages.length);
  const due = new Map<string, string[]>();
  for (const t of tasks) due.set(t.deal_id, [...(due.get(t.deal_id) ?? []), t.due_at]);
  return rows.map((row) => {
    const pipeline = (row.pipeline_id && byId.get(row.pipeline_id)) || fallback;
    if (!pipeline || !pipeline.stages.length) return { ...row, task_due: (due.get(row.id) ?? []).sort() };
    const stage = pipeline.stages.some((s) => s.id === row.stage_id) ? row.stage_id : pipeline.stages[0].id;
    return { ...row, pipeline_id: pipeline.id, board_id: pipeline.board_id, stage_id: stage, task_due: (due.get(row.id) ?? []).sort() };
  });
}

// ── Gravação ─────────────────────────────────────────────────────────────────

/** Lê o funil na transação e garante que a etapa existe e o funil está ativo. */
async function readPipelineForWrite(tx: Transaction, db: Firestore, pipelineId: string, stageId: string): Promise<Pipeline> {
  const snap = await tx.get(db.collection(PIPELINES_COLLECTION).doc(pipelineId));
  if (!snap.exists) throw new PipelineNotFoundError();
  const pipeline = toPipeline(snap);
  if (pipeline.archived || !pipeline.stages.some((s) => s.id === stageId)) throw new PipelineNotFoundError();
  return pipeline;
}

function checkCustom(pipeline: Pipeline, raw: unknown): CustomValues {
  const result = validateCustomValues(pipeline.custom_fields, raw);
  if (!result.ok) throw new InvalidCustomValuesError(result.errors);
  return result.value;
}

/** Novas negociações vão para o TOPO da etapa (posição menor = mais acima). */
const topPosition = () => -Date.now();

function dealDocument(core: DealCoreData, pipeline: Pipeline, custom: CustomValues, owner: Actor, actor: Actor) {
  const now = FieldValue.serverTimestamp();
  return {
    title: core.title,
    board_id: pipeline.board_id,
    pipeline_id: pipeline.id,
    stage_id: core.stage_id,
    position: topPosition(),
    status: core.status,
    qualification: core.qualification,
    value_cents: core.value_cents,
    expected_close_date: core.expected_close_date,
    context: core.context,
    custom,
    owner_uid: owner.uid,
    owner_name: owner.name,
    created_by_uid: actor.uid,
    created_by_name: actor.name,
    created_at: now,
    updated_at: now,
    stage_entered_at: now,
    last_activity_at: now,
    version: 1,
  };
}

async function assertLinksExist(tx: Transaction, db: Firestore, contactId: string | null, companyId: string | null) {
  const refs: DocumentReference[] = [];
  if (contactId) refs.push(db.collection(CONTACTS_COLLECTION).doc(contactId));
  if (companyId) refs.push(db.collection(COMPANIES_COLLECTION).doc(companyId));
  if (!refs.length) throw new MissingLinkError();
  const snaps = await tx.getAll(...refs);
  if (snaps.some((s) => !s.exists)) throw new MissingLinkError();
}

/** Negociação manual (exige contato ou empresa). Idempotente pelo request_id. */
export async function createDeal(
  input: { request_id: string; deal: DealCoreData; custom: unknown; contact_id: string | null; company_id: string | null },
  owner: Actor,
  actor: Actor,
): Promise<{ id: string; created: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(`d_${input.request_id}`);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const pipeline = await readPipelineForWrite(tx, db, input.deal.pipeline_id, input.deal.stage_id);
    await assertLinksExist(tx, db, input.contact_id, input.company_id);
    if (existing.exists) return { id: ref.id, created: false };
    const custom = checkCustom(pipeline, input.custom);
    const stage = pipeline.stages.find((s) => s.id === input.deal.stage_id)!;
    tx.create(ref, { ...dealDocument(input.deal, pipeline, custom, owner, actor), origin: "manual", source: null, lead_id: null, contact_id: input.contact_id, company_id: input.company_id });
    tx.create(historyRef(ref), historyData("created", "Negociação criada", `Criada manualmente em “${pipeline.name}” › “${stage.name}”.`, actor));
    return { id: ref.id, created: true };
  }, { maxAttempts: MAX_ATTEMPTS });
}

/**
 * Converte um lead em negociação. Uma negociação por lead: o id é `l_<leadId>` e o lead guarda
 * `deal_id` — duas conversões simultâneas do mesmo lead geram UMA negociação.
 */
export async function convertLeadToDeal(
  input: { lead_id: string; deal: DealCoreData; custom: unknown; contact_id: string | null; company_id: string | null },
  owner: Actor,
  actor: Actor,
): Promise<{ id: string }> {
  const db = getAdminDb();
  const leadRef = db.collection(LEADS_COLLECTION).doc(input.lead_id);
  // Id único por conversão: se uma negociação convertida for excluída e o lead convertido de novo,
  // a limpeza da antiga nunca alcança a nova.
  const ref = db.collection(DEALS_COLLECTION).doc(`l_${input.lead_id}_${Date.now().toString(36)}`);
  return db.runTransaction(async (tx) => {
    const lead = await tx.get(leadRef);
    if (!lead.exists) throw new LeadNotFoundForDealError();
    const existingDeal = str(lead.get("deal_id"));
    if (existingDeal) throw new LeadAlreadyConvertedError(existingDeal);
    const pipeline = await readPipelineForWrite(tx, db, input.deal.pipeline_id, input.deal.stage_id);
    await assertLinksExist(tx, db, input.contact_id, input.company_id);
    const custom = checkCustom(pipeline, input.custom);
    const d = lead.data() ?? {};
    const stage = pipeline.stages.find((s) => s.id === input.deal.stage_id)!;
    const now = FieldValue.serverTimestamp();
    tx.create(ref, {
      ...dealDocument(input.deal, pipeline, custom, owner, actor),
      origin: d.entry === "website" || d.origin === "website" ? "lead_website" : "lead_manual",
      source: leadSources.is(d.source) ? d.source : d.origin === "website" ? "website" : null,
      lead_id: lead.id,
      lead_created_at: d.created_at ?? null,
      interest_plan: str(d.interest_plan),
      contact_id: input.contact_id,
      company_id: input.company_id,
    });
    tx.create(historyRef(ref), historyData("created", "Lead convertido em negociação", `Lead “${str(d.title) ?? str(d.lead_name) ?? "Sem nome"}” entrou em “${pipeline.name}” › “${stage.name}”.`, actor));
    tx.update(leadRef, { deal_id: ref.id, converted_at: now, stage: "em_negociacao", status: "convertido", updated_at: now });
    tx.create(leadRef.collection(LEAD_NOTES_SUBCOLLECTION).doc(), systemNoteData(`Convertido em negociação: “${input.deal.title}” (${pipeline.name} › ${stage.name}).`, actor));
    return { id: ref.id };
  }, { maxAttempts: MAX_ATTEMPTS });
}

export interface MoveResult {
  stage_id: string;
  position: number;
  version: number;
  updated_at: string;
  stage_entered_at: string | null;
}

/**
 * Arrastar no Kanban: grava só esta negociação (etapa + posição fracionária). A etapa precisa existir
 * no funil (relido na transação). Mudança de etapa vai para o histórico.
 */
export async function moveDeal(input: MoveDealInput, actor: Actor): Promise<MoveResult> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(input.deal_id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DealNotFoundError();
    const row = placeDeals([toDealRow(snap, new Map(), new Map())], [], [])[0];
    if (isClosed(row.status)) throw new DealClosedError();
    const pipelineId = row.pipeline_id ?? DEFAULT_PIPELINE_ID;
    const pipeline = await readPipelineForWrite(tx, db, pipelineId, input.stage_id);
    const now = new Date();
    const changedStage = row.stage_id !== input.stage_id;
    const version = row.version + 1;
    tx.update(ref, {
      pipeline_id: pipeline.id,
      board_id: pipeline.board_id,
      stage_id: input.stage_id,
      position: input.position,
      version,
      updated_at: FieldValue.serverTimestamp(),
      ...(changedStage ? { ...stageExitPatch(snap, row.stage_id), stage_entered_at: FieldValue.serverTimestamp(), last_activity_at: FieldValue.serverTimestamp() } : {}),
    });
    if (changedStage) {
      const from = pipeline.stages.find((s) => s.id === row.stage_id)?.name ?? "—";
      const to = pipeline.stages.find((s) => s.id === input.stage_id)!.name;
      tx.create(historyRef(ref), historyData("stage", "Etapa alterada", `${from} → ${to}`, actor, { from: row.stage_id, to: input.stage_id }));
    }
    return {
      stage_id: input.stage_id,
      position: input.position,
      version,
      updated_at: now.toISOString(),
      stage_entered_at: changedStage ? now.toISOString() : row.stage_entered_at,
    };
  }, { maxAttempts: MAX_ATTEMPTS });
}

const QUALIFICATION_LABEL = (n: number) => `${n} ${n === 1 ? "estrela" : "estrelas"}`;

/** Ações em massa (lista). Relê as negociações, ignora as que sumiram, grava tudo ou nada. */
export async function bulkUpdateDeals(action: BulkDealAction, owner: Actor | null, actor: Actor): Promise<string[]> {
  const db = getAdminDb();
  const refs = action.ids.map((id) => db.collection(DEALS_COLLECTION).doc(id));
  return db.runTransaction(async (tx) => {
    const snaps = (await tx.getAll(...refs)).filter((s) => s.exists);
    let pipelines = new Map<string, Pipeline>();
    if (action.action === "set_stage" || action.action === "set_pipeline") {
      const ids = [...new Set([...snaps.map((s) => str(s.get("pipeline_id")) ?? DEFAULT_PIPELINE_ID), ...(action.action === "set_pipeline" ? [action.pipeline_id] : [])])];
      const pSnaps = await tx.getAll(...ids.map((id) => db.collection(PIPELINES_COLLECTION).doc(id)));
      pipelines = new Map(pSnaps.filter((s) => s.exists).map((s) => [s.id, toPipeline(s)]));
    }
    const updated: string[] = [];
    for (const snap of snaps) {
      const row = toDealRow(snap, new Map(), new Map());
      const base = { version: row.version + 1, updated_at: FieldValue.serverTimestamp(), last_activity_at: FieldValue.serverTimestamp() };
      switch (action.action) {
        case "set_status": {
          if (row.status === action.value || isClosed(row.status)) continue; // reabrir/desfazer venda só pela página
          tx.update(snap.ref, { ...base, status: action.value });
          tx.create(historyRef(snap.ref), historyData("status", "Status alterado", `${dealStatuses.label(row.status)} → ${dealStatuses.label(action.value)}`, actor));
          break;
        }
        case "set_owner": {
          if (!owner || row.owner_uid === owner.uid) continue;
          tx.update(snap.ref, { ...base, owner_uid: owner.uid, owner_name: owner.name });
          tx.create(historyRef(snap.ref), historyData("owner", "Responsável alterado", `${row.owner_name ?? "Sem responsável"} → ${owner.name}`, actor));
          break;
        }
        case "set_qualification": {
          if (row.qualification === action.value) continue;
          tx.update(snap.ref, { ...base, qualification: action.value });
          tx.create(historyRef(snap.ref), historyData("field", "Qualificação alterada", `${QUALIFICATION_LABEL(row.qualification)} → ${QUALIFICATION_LABEL(action.value)}`, actor));
          break;
        }
        case "set_stage": {
          const pipeline = pipelines.get(row.pipeline_id ?? DEFAULT_PIPELINE_ID);
          const stage = pipeline?.stages.find((s) => s.id === action.value);
          if (!pipeline || !stage || row.stage_id === action.value || isClosed(row.status)) continue;
          tx.update(snap.ref, { ...base, ...stageExitPatch(snap, row.stage_id), pipeline_id: pipeline.id, board_id: pipeline.board_id, stage_id: stage.id, position: topPosition(), stage_entered_at: FieldValue.serverTimestamp() });
          const from = pipeline.stages.find((s) => s.id === row.stage_id)?.name ?? "—";
          tx.create(historyRef(snap.ref), historyData("stage", "Etapa alterada", `${from} → ${stage.name}`, actor));
          break;
        }
        case "set_pipeline": {
          const to = pipelines.get(action.pipeline_id);
          const stage = to?.stages.find((s) => s.id === action.stage_id);
          if (!to || to.archived || !stage) throw new PipelineNotFoundError();
          if (isClosed(row.status)) continue;
          const from = pipelines.get(row.pipeline_id ?? DEFAULT_PIPELINE_ID) ?? null;
          if (from?.id === to.id) continue;
          const fromStage = from?.stages.find((s) => s.id === row.stage_id) ?? from?.stages[0];
          tx.update(snap.ref, { ...base, ...stageExitPatch(snap, fromStage?.id), pipeline_id: to.id, board_id: to.board_id, stage_id: stage.id, position: topPosition(), stage_entered_at: FieldValue.serverTimestamp() });
          tx.create(
            historyRef(snap.ref),
            historyData("pipeline", "Movida para outro funil", `${from?.name ?? "—"} › ${fromStage?.name ?? "—"} → ${to.name} › ${stage.name}`, actor, { from: from?.id ?? null, to: to.id }),
          );
          break;
        }
      }
      updated.push(snap.id);
    }
    return updated;
  }, { maxAttempts: MAX_ATTEMPTS });
}

// ── Tarefas ──────────────────────────────────────────────────────────────────

function toTaskRow(doc: DocumentSnapshot): TaskRow {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    deal_id: str(d.deal_id),
    title: str(d.title) ?? "Tarefa",
    type: taskTypes.is(d.type) ? d.type : "outro",
    due_at: iso(d.due_at) ?? new Date(0).toISOString(),
    done_at: iso(d.done_at),
    assignee_uid: str(d.assignee_uid),
    assignee_name: str(d.assignee_name),
    notes: str(d.notes),
    created_at: iso(d.created_at),
  };
}

const formatDue = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);

/** Cria a tarefa (e registra no histórico da negociação, se tiver). */
export async function createTask(data: TaskData, assignee: Actor, actor: Actor): Promise<TaskRow> {
  const db = getAdminDb();
  const ref = db.collection(TASKS_COLLECTION).doc();
  await db.runTransaction(async (tx) => {
    const dealRef = data.deal_id ? db.collection(DEALS_COLLECTION).doc(data.deal_id) : null;
    if (dealRef && !(await tx.get(dealRef)).exists) throw new DealNotFoundError();
    const now = FieldValue.serverTimestamp();
    tx.create(ref, {
      deal_id: data.deal_id,
      title: data.title,
      type: data.type,
      due_at: Timestamp.fromDate(data.due_at),
      done: false,
      done_at: null,
      assignee_uid: assignee.uid,
      assignee_name: assignee.name,
      notes: data.notes,
      created_by_uid: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      updated_at: now,
    });
    if (dealRef) {
      tx.create(historyRef(dealRef), historyData("task", "Tarefa criada", `${taskTypes.label(data.type)}: ${data.title} · ${formatDue(data.due_at)} · ${assignee.name}`, actor, { task_id: ref.id }));
    }
  });
  return toTaskRow(await ref.get());
}

/** Tarefas de uma negociação (abertas e concluídas), da mais próxima para a mais distante. */
export async function listDealTasks(dealId: string, limit = 300): Promise<TaskRow[]> {
  const snap = await getAdminDb().collection(TASKS_COLLECTION).where("deal_id", "==", dealId).limit(limit).get();
  return snap.docs.map(toTaskRow).sort((a, b) => a.due_at.localeCompare(b.due_at));
}

/** Marca/desmarca como feita. Retorna a tarefa atualizada (null = não existe). */
export async function setTaskDone(id: string, done: boolean, actor: Actor): Promise<TaskRow | null> {
  const db = getAdminDb();
  const ref = db.collection(TASKS_COLLECTION).doc(id);
  const ok = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    if (snap.get("done") === done) return true;
    tx.update(ref, { done, done_at: done ? FieldValue.serverTimestamp() : null, updated_at: FieldValue.serverTimestamp() });
    const dealId = str(snap.get("deal_id"));
    if (dealId) {
      tx.create(historyRef(db.collection(DEALS_COLLECTION).doc(dealId)), historyData("task", done ? "Tarefa concluída" : "Tarefa reaberta", String(snap.get("title") ?? ""), actor, { task_id: id }));
    }
    return true;
  });
  return ok ? toTaskRow(await ref.get()) : null;
}

/** Estrelas iniciais da negociação a partir da qualificação do lead. */
export function starsFromLead(qualification: unknown): number {
  return leadQualifications.is(qualification) ? STARS_FROM_LEAD_QUALIFICATION[qualification] : 1;
}
