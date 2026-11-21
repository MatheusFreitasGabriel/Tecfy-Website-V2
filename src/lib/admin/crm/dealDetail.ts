import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminBucket, getAdminDb } from "@/lib/firebaseAdmin";
import {
  DEAL_FILE_MAX_BYTES,
  DEAL_FILE_TYPES,
  dealStatuses,
  lostReasons,
  productBillings,
} from "./options";
import { toProduct } from "./products";
import {
  BOARDS_COLLECTION,
  COMPANIES_COLLECTION,
  CONTACTS_COLLECTION,
  CONTRACT_MIN_TERM_MONTHS,
  CONTRACTS_COLLECTION,
  DEAL_FILES_COLLECTION,
  DEAL_HISTORY_SUBCOLLECTION,
  DEALS_COLLECTION,
  LEAD_NOTES_SUBCOLLECTION,
  LEADS_COLLECTION,
  PIPELINES_COLLECTION,
  TASKS_COLLECTION,
  PRODUCTS_COLLECTION,
  type DealDetail,
  type DealFileRow,
  type DealHistoryRow,
  type Pipeline,
  type ProductOption,
} from "./types";
import { DEFAULT_PIPELINE_ID, DealClosedError, stageExitPatch, DealNotFoundError, InvalidCustomValuesError, MissingLinkError, PipelineNotFoundError, StaleDealError, historyData, placeDeals, toDealRow, toPipeline } from "./deals";
import { brazilDateTime, validateCustomValues, type DealChanges, type UploadRequest, type WonInput } from "./dealValidation";
import { EmailProviderError, RecipientNotAllowedError, sendViaResend, toHtml } from "./email";
import type { Actor } from "./leads";
import type { SendEmailForm } from "./validation";
import { systemNoteData } from "./notes";

/**
 * Página da negociação: leitura completa, edição com histórico "antes → depois", venda (cria o
 * contrato → empresa vira Cliente e entra no faturamento), perda, registros (WhatsApp, ligação,
 * observação), e-mail e arquivos/propostas no Firebase Storage (bucket privado).
 */

export class NeedsCompanyError extends Error {
  constructor() {
    super("needs_company");
  }
}
export class ProductNotFoundError extends Error {
  constructor() {
    super("product_not_found");
  }
}
/** A venda veio como mensalidade para um produto de pagamento único (ou o contrário). */
export class WonKindMismatchError extends Error {
  constructor() {
    super("won_kind_mismatch");
  }
}
export { DealClosedError };
export class StorageNotConfiguredError extends Error {
  constructor() {
    super("storage_not_configured");
  }
}
export class InvalidFileError extends Error {
  constructor(public reason: string) {
    super("invalid_file");
  }
}
export class DuplicateFileError extends Error {
  constructor(public existing: string) {
    super("duplicate_file");
  }
}
export class AlreadyLinkedDealError extends Error {
  constructor() {
    super("already_linked");
  }
}
export class FileNotFoundError extends Error {
  constructor() {
    super("file_not_found");
  }
}

const MAX_ATTEMPTS = 15;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const iso = (v: unknown): string | null => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate().toISOString() : null);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number | null) => (cents === null ? "sem valor" : brl.format(cents / 100));
const dateBr = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem data");
const stars = (n: number) => `${n} ${n === 1 ? "estrela" : "estrelas"}`;

// ── Leitura ──────────────────────────────────────────────────────────────────

function addressOf(a: Record<string, unknown> | undefined): string | null {
  if (!a) return null;
  const line = [str(a.street), str(a.number)].filter(Boolean).join(", ");
  const place = [str(a.district), str(a.city), a.region === "EX" ? "Exterior" : str(a.region)].filter(Boolean).join(" · ");
  const zip = str(a.zip);
  return [line, place, zip ? `CEP ${zip.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : null].filter(Boolean).join(" — ") || null;
}

async function pipelinesFor(ids: string[]): Promise<Pipeline[]> {
  const db = getAdminDb();
  const snaps = await db.getAll(...[...new Set([...ids, DEFAULT_PIPELINE_ID])].map((id) => db.collection(PIPELINES_COLLECTION).doc(id)));
  return snaps.filter((s) => s.exists).map(toPipeline);
}

/** Negociação completa com contato, empresa e contrato. null = não existe. */
export async function getDealDetail(id: string, opts: { openTaskDue?: string[] } = {}): Promise<DealDetail | null> {
  const db = getAdminDb();
  const snap = await db.collection(DEALS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  const contactId = str(d.contact_id);
  const companyId = str(d.company_id);
  const contractId = str(d.contract_id);
  const [contact, company, contract, tasks, pipelines] = await Promise.all([
    contactId ? db.collection(CONTACTS_COLLECTION).doc(contactId).get() : null,
    companyId ? db.collection(COMPANIES_COLLECTION).doc(companyId).get() : null,
    contractId ? db.collection(CONTRACTS_COLLECTION).doc(contractId).get() : null,
    // Vencimentos das tarefas abertas: a página já tem as tarefas e passa (sem consultar de novo).
    opts.openTaskDue ? null : db.collection("tasks").where("deal_id", "==", id).where("done", "==", false).select("due_at").get(),
    pipelinesFor([str(d.pipeline_id) ?? DEFAULT_PIPELINE_ID]),
  ]);
  const contacts = new Map<string, DocumentSnapshot>(contact?.exists ? [[contact.id, contact]] : []);
  const companies = new Map<string, DocumentSnapshot>(company?.exists ? [[company.id, company]] : []);
  const due = opts.openTaskDue
    ? opts.openTaskDue.map((due_at) => ({ deal_id: id, due_at }))
    : (tasks?.docs ?? []).map((t) => ({ deal_id: id, due_at: iso(t.get("due_at")) ?? "" })).filter((t) => t.due_at);
  const row = placeDeals([toDealRow(snap, contacts, companies)], pipelines, due)[0];
  const c = contract?.exists ? contract.data() ?? {} : null;
  return {
    ...row,
    interest_plan: str(d.interest_plan),
    lead_created_at: iso(d.lead_created_at),
    won_at: iso(d.won_at),
    lost_at: iso(d.lost_at),
    lost_detail: str(d.lost_detail),
    paused_reason: str(d.paused_reason),
    contract: c
      ? {
          id: contract!.id,
          product_name: String(c.product_name ?? ""),
          billing: productBillings.is(c.billing) ? c.billing : "mensal",
          monthly_value: typeof c.monthly_value === "number" ? c.monthly_value : 0,
          one_time_total: (typeof c.setup_value === "number" ? c.setup_value : 0) + (typeof c.one_time_value === "number" ? c.one_time_value : 0),
          status: c.status === "cancelled" ? "cancelled" : "active",
          signed_at: iso(c.signed_at),
        }
      : null,
    contact_info: contact?.exists
      ? { id: contact.id, name: str(contact.get("name")) ?? "Sem nome", email: str(contact.get("email")), phone: str(contact.get("phone")), role: str(contact.get("role")) }
      : null,
    company_info: company?.exists
      ? {
          id: company.id,
          name: str(company.get("trade_name")) ?? "Sem nome",
          legal_name: str(company.get("legal_name")),
          cnpj: str(company.get("cnpj")),
          phone: str(company.get("phone")),
          email: str(company.get("email")),
          website: str(company.get("website")),
          address: addressOf(company.get("address")),
        }
      : null,
  };
}

/** Histórico completo (mais recentes primeiro). */
export async function listDealHistory(id: string, limit = 500): Promise<DealHistoryRow[]> {
  const snap = await getAdminDb().collection(DEALS_COLLECTION).doc(id).collection(DEAL_HISTORY_SUBCOLLECTION).orderBy("created_at", "desc").limit(limit).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    type: str(doc.get("type")) ?? "note",
    title: str(doc.get("title")) ?? "Registro",
    description: str(doc.get("description")),
    author_name: str(doc.get("author_name")),
    created_at: iso(doc.get("created_at")),
  }));
}

/** Produtos para a venda (só leitura; inativos ficam de fora). */
export async function listProductOptions(): Promise<ProductOption[]> {
  const snap = await getAdminDb().collection(PRODUCTS_COLLECTION).get();
  return snap.docs
    .map(toProduct)
    .filter((p) => p.active)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR"))
    .map((p) => ({
      id: p.id,
      name: p.name,
      billing: p.billing,
      monthly_price: p.monthly_price,
      one_time_price: p.one_time_price,
      setup_fee: p.setup_fee,
      price_label: p.price_label,
    }));
}

// ── Edição ───────────────────────────────────────────────────────────────────

/**
 * Edita campos da negociação. Concorrência otimista: `version` precisa bater com a atual
 * (senão StaleDealError → a tela pede para recarregar, sem sobrescrever a edição de outra pessoa).
 * Cada campo alterado vira um registro "antes → depois" no histórico.
 */
export async function updateDeal(id: string, version: number, changes: DealChanges, owner: Actor | null, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DealNotFoundError();
    const row = toDealRow(snap, new Map(), new Map());
    if (row.version !== version) throw new StaleDealError("stale");
    if ((row.status === "vendida" || row.status === "perdida") && (changes.status || changes.stage_id)) throw new DealClosedError();
    const pSnap = await tx.get(db.collection(PIPELINES_COLLECTION).doc(row.pipeline_id ?? DEFAULT_PIPELINE_ID));
    if (!pSnap.exists) throw new PipelineNotFoundError();
    const pipeline = toPipeline(pSnap);
    const currentStage = pipeline.stages.some((s) => s.id === row.stage_id) ? row.stage_id : pipeline.stages[0]?.id;
    // Vínculos novos: lidos antes das escritas; só valem se a negociação ainda não tem.
    const linkContact = changes.contact_id && !snap.get("contact_id") ? await tx.get(db.collection(CONTACTS_COLLECTION).doc(changes.contact_id)) : null;
    const linkCompany = changes.company_id && !snap.get("company_id") ? await tx.get(db.collection(COMPANIES_COLLECTION).doc(changes.company_id)) : null;
    if ((changes.contact_id && snap.get("contact_id")) || (changes.company_id && snap.get("company_id"))) throw new AlreadyLinkedDealError();
    if ((linkContact && !linkContact.exists) || (linkCompany && !linkCompany.exists)) throw new MissingLinkError();

    const update: Record<string, unknown> = {};
    const entries: [string, string, string][] = []; // [tipo, título, descrição]
    if (changes.title !== undefined && changes.title !== row.title) {
      update.title = changes.title;
      entries.push(["field", "Nome alterado", `${row.title} → ${changes.title}`]);
    }
    if (changes.value_cents !== undefined && changes.value_cents !== row.value_cents) {
      update.value_cents = changes.value_cents;
      entries.push(["field", "Valor alterado", `${money(row.value_cents)} → ${money(changes.value_cents)}`]);
    }
    if (changes.expected_close_date !== undefined && changes.expected_close_date !== row.expected_close_date) {
      update.expected_close_date = changes.expected_close_date;
      entries.push(["field", "Previsão de fechamento alterada", `${dateBr(row.expected_close_date)} → ${dateBr(changes.expected_close_date)}`]);
    }
    if (changes.qualification !== undefined && changes.qualification !== row.qualification) {
      update.qualification = changes.qualification;
      entries.push(["field", "Qualificação alterada", `${stars(row.qualification)} → ${stars(changes.qualification)}`]);
    }
    if (changes.status !== undefined && changes.status !== row.status) {
      update.status = changes.status;
      entries.push(["status", "Status alterado", `${dealStatuses.label(row.status)} → ${dealStatuses.label(changes.status)}`]);
    }
    if (changes.context !== undefined && changes.context !== row.context) {
      update.context = changes.context;
      entries.push(["field", "Contexto atualizado", changes.context ? changes.context.slice(0, 300) : "Contexto apagado."]);
    }
    if (changes.owner_uid !== undefined && owner && owner.uid !== row.owner_uid) {
      update.owner_uid = owner.uid;
      update.owner_name = owner.name;
      entries.push(["owner", "Responsável alterado", `${row.owner_name ?? "Sem responsável"} → ${owner.name}`]);
    }
    if (changes.stage_id !== undefined && changes.stage_id !== currentStage) {
      const stage = pipeline.stages.find((s) => s.id === changes.stage_id);
      if (!stage) throw new PipelineNotFoundError();
      update.stage_id = stage.id;
      update.pipeline_id = pipeline.id;
      update.board_id = pipeline.board_id;
      update.position = -Date.now();
      Object.assign(update, stageExitPatch(snap, currentStage));
      update.stage_entered_at = FieldValue.serverTimestamp();
      entries.push(["stage", "Etapa alterada", `${pipeline.stages.find((s) => s.id === currentStage)?.name ?? "—"} → ${stage.name}`]);
    }
    if (changes.custom !== undefined) {
      const merged = { ...row.custom, ...changes.custom };
      const result = validateCustomValues(pipeline.custom_fields, merged);
      if (!result.ok) throw new InvalidCustomValuesError(result.errors);
      const changed = pipeline.custom_fields.filter((f) => JSON.stringify(row.custom[f.id] ?? null) !== JSON.stringify(result.value[f.id] ?? null));
      if (changed.length) {
        update.custom = result.value;
        const show = (v: unknown) => (v === null || v === undefined || v === "" ? "vazio" : v === true ? "Sim" : v === false ? "Não" : String(v));
        for (const f of changed) entries.push(["field", `“${f.label}” alterado`, `${show(row.custom[f.id])} → ${show(result.value[f.id])}`]);
      }
    }
    if (linkContact) {
      update.contact_id = linkContact.id;
      entries.push(["link", "Contato vinculado", str(linkContact.get("name")) ?? "Contato"]);
    }
    if (linkCompany) {
      update.company_id = linkCompany.id;
      entries.push(["link", "Empresa vinculada", str(linkCompany.get("trade_name")) ?? "Empresa"]);
    }
    if (!entries.length) return;
    tx.update(ref, { ...update, version: row.version + 1, updated_at: FieldValue.serverTimestamp(), last_activity_at: FieldValue.serverTimestamp() });
    for (const [type, title, description] of entries) tx.create(ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(), historyData(type, title, description, actor));
  }, { maxAttempts: MAX_ATTEMPTS });
}

// ── Venda / perda / reabrir ──────────────────────────────────────────────────

/**
 * Marca como vendida e cria o contrato (`contracts/deal_<id>`): a empresa passa a Cliente e o valor
 * entra no faturamento do dashboard. Idempotente (clique duplo não cria 2 contratos).
 */
export async function markDealWon(id: string, input: WonInput, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  const contractRef = db.collection(CONTRACTS_COLLECTION).doc(`deal_${id}`);
  await db.runTransaction(async (tx) => {
    const [snap, contract] = await tx.getAll(ref, contractRef);
    // Produto cadastrado (lido, nunca gravado) ou descrição livre do que foi vendido.
    const product = input.product_id ? await tx.get(db.collection(PRODUCTS_COLLECTION).doc(input.product_id)) : null;
    if (!snap.exists) throw new DealNotFoundError();
    if (snap.get("status") === "vendida" && contract.exists) return;
    if (snap.get("status") === "perdida") throw new DealClosedError(); // reabra antes de vender
    if (product && (!product.exists || product.get("active") === false)) throw new ProductNotFoundError();
    const catalog = product?.exists ? toProduct(product) : null;
    if (catalog && (catalog.billing === "unico") !== (input.kind === "unico")) throw new WonKindMismatchError();
    const companyId = str(snap.get("company_id"));
    if (!companyId) throw new NeedsCompanyError();
    const productName = catalog ? catalog.name : (input.product_name ?? "Venda");
    const billing = catalog ? catalog.billing : input.kind === "unico" ? "unico" : "mensal";
    const signedAt = Timestamp.fromDate(brazilDateTime(input.signed_date, "12:00"));
    tx.set(contractRef, {
      lead_id: str(snap.get("lead_id")) ?? "",
      deal_id: id,
      company_id: companyId,
      product_id: product?.id ?? "",
      product_name: productName,
      billing,
      monthly_value: input.monthly_cents / 100,
      setup_value: input.setup_cents / 100,
      one_time_value: input.one_time_cents / 100,
      status: "active",
      signed_at: signedAt,
      cancelled_at: null,
      min_term_months: billing === "unico" ? 0 : (catalog?.min_term_months ?? CONTRACT_MIN_TERM_MONTHS),
      created_by_uid: actor.uid,
      created_by_name: actor.name,
      created_at: FieldValue.serverTimestamp(),
    });
    tx.update(ref, {
      status: "vendida",
      won_at: FieldValue.serverTimestamp(),
      contract_id: contractRef.id,
      lost_reason: null,
      lost_detail: null,
      lost_at: null,
      version: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
      last_activity_at: FieldValue.serverTimestamp(),
    });
    const value =
      input.kind === "unico"
        ? `${money(input.one_time_cents)} (pagamento único)`
        : `${money(input.monthly_cents)}/mês${input.setup_cents ? ` + ${money(input.setup_cents)} de implantação` : ""}`;
    tx.create(ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(), historyData("won", "Venda registrada 🎉", `${productName} · ${value} · assinada em ${dateBr(input.signed_date)}`, actor));
  }, { maxAttempts: MAX_ATTEMPTS });
}

export async function markDealLost(id: string, reason: string, detail: string | null, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DealNotFoundError();
    if (snap.get("status") === "vendida") throw new DealClosedError();
    if (snap.get("status") === "perdida") return;
    tx.update(ref, {
      status: "perdida",
      lost_reason: reason,
      lost_detail: detail,
      lost_at: FieldValue.serverTimestamp(),
      version: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
      last_activity_at: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(), historyData("lost", "Negociação perdida", [lostReasons.label(reason), detail].filter(Boolean).join(" — "), actor));
  }, { maxAttempts: MAX_ATTEMPTS });
}

/** Reabre (desfaz venda ou perda). Venda desfeita remove o contrato (foi registrada por engano). */
export async function reopenDeal(id: string, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DealNotFoundError();
    const status = snap.get("status");
    if (status !== "vendida" && status !== "perdida") return;
    const contractId = str(snap.get("contract_id"));
    const contract = status === "vendida" && contractId ? await tx.get(db.collection(CONTRACTS_COLLECTION).doc(contractId)) : null;
    // Venda registrada por engano: o contrato some. Contrato já CANCELADO é histórico real de
    // faturamento: fica (só desliga da negociação).
    if (contract?.exists && contract.get("status") !== "cancelled") tx.delete(contract.ref);
    tx.update(ref, {
      status: "em_andamento",
      contract_id: null,
      won_at: null,
      lost_reason: null,
      lost_detail: null,
      lost_at: null,
      version: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
      last_activity_at: FieldValue.serverTimestamp(),
    });
    tx.create(
      ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(),
      historyData("status", "Negociação reaberta", status === "vendida" ? "Venda desfeita: o contrato foi removido do faturamento." : "Perda desfeita.", actor),
    );
  }, { maxAttempts: MAX_ATTEMPTS });
}

// ── Registros (WhatsApp, ligação, observação) e e-mail ───────────────────────

const ACTIVITY_TITLES = { whatsapp: "WhatsApp aberto", call: "Ligação registrada", note: "Observação" } as const;

export async function logDealActivity(id: string, kind: keyof typeof ACTIVITY_TITLES, text: string, actor: Actor): Promise<DealHistoryRow> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  const history = ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc();
  const createdAt = Timestamp.now();
  try {
    // Registro + "última atividade" juntos; falha se a negociação não existir.
    const batch = db.batch();
    batch.update(ref, { last_activity_at: FieldValue.serverTimestamp() });
    batch.create(history, { ...historyData(kind, ACTIVITY_TITLES[kind], text || null, actor), created_at: createdAt });
    await batch.commit();
  } catch (error) {
    if ((error as { code?: number }).code === 5) throw new DealNotFoundError();
    throw error;
  }
  return { id: history.id, type: kind, title: ACTIVITY_TITLES[kind], description: text || null, author_name: actor.name, created_at: createdAt.toDate().toISOString() };
}

/**
 * E-mail pelo Resend para o contato ou a empresa da negociação (nunca para qualquer endereço).
 * O envio vai para o histórico.
 */
export async function sendDealEmail(id: string, input: SendEmailForm, actor: Actor, replyTo: string | null): Promise<DealHistoryRow> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  const deal = await ref.get();
  if (!deal.exists) throw new DealNotFoundError();
  const allowed = new Set<string>();
  const [contact, company] = await Promise.all([
    str(deal.get("contact_id")) ? db.collection(CONTACTS_COLLECTION).doc(deal.get("contact_id")).get() : null,
    str(deal.get("company_id")) ? db.collection(COMPANIES_COLLECTION).doc(deal.get("company_id")).get() : null,
  ]);
  for (const v of [contact?.get("email"), company?.get("email")]) if (typeof v === "string" && v) allowed.add(v.toLowerCase());
  if (!allowed.has(input.to)) throw new RecipientNotAllowedError();

  try {
    await sendViaResend({ to: input.to, subject: input.subject, html: toHtml(input.body), text: input.body, replyTo });
  } catch (error) {
    await ref.collection(DEAL_HISTORY_SUBCOLLECTION).add(historyData("email", "E-mail não enviado", `Para ${input.to} · ${input.subject}`, actor)).catch(() => undefined);
    throw error instanceof EmailProviderError ? error : new EmailProviderError("network");
  }
  return logEmailSent(id, input, actor);
}

async function logEmailSent(id: string, input: SendEmailForm, actor: Actor): Promise<DealHistoryRow> {
  const ref = getAdminDb().collection(DEALS_COLLECTION).doc(id);
  const history = ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc();
  const createdAt = Timestamp.now();
  const description = `Para ${input.to} · ${input.subject}\n\n${input.body.slice(0, 1500)}`;
  await history.create({ ...historyData("email", "E-mail enviado", description, actor), created_at: createdAt });
  await ref.update({ last_activity_at: FieldValue.serverTimestamp() }).catch(() => undefined);
  return { id: history.id, type: "email", title: "E-mail enviado", description, author_name: actor.name, created_at: createdAt.toDate().toISOString() };
}

// ── Arquivos e propostas (Firebase Storage, bucket privado) ─────────────────

const UPLOAD_TTL_MS = 5 * 60_000;
const MAX_PENDING_UPLOADS = 10;

function toFileRow(doc: DocumentSnapshot): DealFileRow {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    name: str(d.name) ?? "arquivo",
    kind: d.kind === "proposta" ? "proposta" : "arquivo",
    mime: str(d.mime) ?? "application/octet-stream",
    size: typeof d.size === "number" ? d.size : 0,
    uploaded_by_name: str(d.uploaded_by_name),
    created_at: iso(d.ready_at) ?? iso(d.created_at),
  };
}

export async function listDealFiles(dealId: string): Promise<DealFileRow[]> {
  const snap = await getAdminDb().collection(DEAL_FILES_COLLECTION).where("deal_id", "==", dealId).where("status", "==", "ready").limit(300).get();
  return snap.docs.map(toFileRow).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

/**
 * Passo 1 do envio: registra o arquivo como "pendente" e devolve uma URL assinada de upload
 * (5 minutos, tipo e tamanho máximo fixados na assinatura). O navegador envia direto ao Storage.
 */
export async function createUploadUrl(dealId: string, req: UploadRequest, actor: Actor): Promise<{ file_id: string; url: string; headers: Record<string, string> }> {
  const bucket = await getAdminBucket();
  if (!bucket) throw new StorageNotConfiguredError();
  const db = getAdminDb();
  const deal = await db.collection(DEALS_COLLECTION).doc(dealId).get();
  if (!deal.exists) throw new DealNotFoundError();
  // Limite de envios em aberto por negociação (só igualdades: não exige índice composto).
  const pending = await db.collection(DEAL_FILES_COLLECTION).where("deal_id", "==", dealId).where("status", "==", "pending").select("created_at").limit(200).get();
  const since = Date.now() - UPLOAD_TTL_MS;
  if (pending.docs.filter((d) => (d.get("created_at")?.toMillis?.() ?? 0) > since).length >= MAX_PENDING_UPLOADS) throw new InvalidFileError("too_many");

  const fileId = randomUUID();
  const ext = DEAL_FILE_TYPES[req.mime].ext;
  const path = `deals/${dealId}/${fileId}.${ext}`;
  const range = `0,${req.size}`;
  const [url] = await bucket.file(path).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + UPLOAD_TTL_MS,
    contentType: req.mime,
    extensionHeaders: { "x-goog-content-length-range": range },
  });
  await db.collection(DEAL_FILES_COLLECTION).doc(fileId).create({
    deal_id: dealId,
    path,
    name: req.name,
    kind: req.kind,
    mime: req.mime,
    size: req.size,
    status: "pending",
    uploaded_by_uid: actor.uid,
    uploaded_by_name: actor.name,
    created_at: FieldValue.serverTimestamp(),
  });
  return { file_id: fileId, url, headers: { "Content-Type": req.mime, "x-goog-content-length-range": range } };
}

/**
 * Passo 2: confere o arquivo QUE CHEGOU no Storage (não confia no navegador): tamanho real,
 * assinatura binária (PDF = "%PDF"; Office = ZIP com [Content_Types].xml) e SHA-256.
 * Inválido → apagado. Igual a um já anexado nesta negociação → apagado e avisado.
 */
export async function completeUpload(dealId: string, fileId: string, actor: Actor): Promise<DealFileRow> {
  const bucket = await getAdminBucket();
  if (!bucket) throw new StorageNotConfiguredError();
  const db = getAdminDb();
  const ref = db.collection(DEAL_FILES_COLLECTION).doc(fileId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("deal_id") !== dealId) throw new FileNotFoundError();
  if (snap.get("status") === "ready") return toFileRow(snap);
  if (snap.get("status") !== "pending") throw new FileNotFoundError();

  const file = bucket.file(String(snap.get("path")));
  const reject = async (reason: string): Promise<never> => {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    await ref.update({ status: "rejected", reject_reason: reason }).catch(() => undefined);
    throw new InvalidFileError(reason);
  };

  const [exists] = await file.exists();
  if (!exists) throw new InvalidFileError("not_uploaded");
  const [meta] = await file.getMetadata();
  const size = Number(meta.size);
  if (!Number.isFinite(size) || size <= 0 || size > Math.min(Number(snap.get("size")), DEAL_FILE_MAX_BYTES)) await reject("size");

  const type = DEAL_FILE_TYPES[String(snap.get("mime"))];
  const hash = createHash("sha256");
  let head = Buffer.alloc(0);
  await new Promise<void>((resolve, reject2) => {
    file
      .createReadStream({ validation: false })
      .on("data", (chunk: Buffer) => {
        hash.update(chunk);
        if (head.length < 65_536) head = Buffer.concat([head, chunk]).subarray(0, 65_536);
      })
      .on("error", reject2)
      .on("end", resolve);
  });
  const okMagic =
    type?.magic === "pdf"
      ? head.subarray(0, 5).toString("latin1") === "%PDF-"
      : head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && head.includes(Buffer.from("[Content_Types].xml"));
  if (!type || !okMagic) await reject("content");
  const sha256 = hash.digest("hex");

  const same = await db.collection(DEAL_FILES_COLLECTION).where("deal_id", "==", dealId).where("sha256", "==", sha256).where("status", "==", "ready").limit(1).get();
  if (!same.empty) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    await ref.delete().catch(() => undefined);
    throw new DuplicateFileError(String(same.docs[0].get("name") ?? "arquivo"));
  }

  const kind = snap.get("kind") === "proposta" ? "proposta" : "arquivo";
  const batch = db.batch();
  batch.update(ref, { status: "ready", sha256, size, ready_at: FieldValue.serverTimestamp() });
  batch.create(
    db.collection(DEALS_COLLECTION).doc(dealId).collection(DEAL_HISTORY_SUBCOLLECTION).doc(),
    historyData("file", kind === "proposta" ? "Proposta anexada" : "Arquivo anexado", `${snap.get("name")} · ${(size / 1024 / 1024).toFixed(2).replace(".", ",")} MB`, actor, { file_id: fileId }),
  );
  batch.update(db.collection(DEALS_COLLECTION).doc(dealId), { last_activity_at: FieldValue.serverTimestamp() });
  await batch.commit();
  return toFileRow(await ref.get());
}

/** Link de download de 5 minutos (gerado só depois de checar a sessão). Registra quem baixou. */
export async function downloadUrl(dealId: string, fileId: string, actor: Actor): Promise<string> {
  const bucket = await getAdminBucket();
  if (!bucket) throw new StorageNotConfiguredError();
  const db = getAdminDb();
  const snap = await db.collection(DEAL_FILES_COLLECTION).doc(fileId).get();
  if (!snap.exists || snap.get("deal_id") !== dealId || snap.get("status") !== "ready") throw new FileNotFoundError();
  const name = String(snap.get("name") ?? "arquivo");
  const [url] = await bucket.file(String(snap.get("path"))).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + UPLOAD_TTL_MS,
    responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    responseType: String(snap.get("mime")),
  });
  await db
    .collection(DEALS_COLLECTION)
    .doc(dealId)
    .collection(DEAL_HISTORY_SUBCOLLECTION)
    .add(historyData("download", "Arquivo baixado", name, actor))
    .catch(() => undefined);
  return url;
}

// ── Pausar / retomar ─────────────────────────────────────────────────────────

/**
 * Pausa a negociação (motivo opcional). Com `resume_date`, cria na mesma transação a tarefa
 * "Retomar negociação" às 09:00 desse dia para o responsável.
 */
export async function pauseDeal(id: string, input: { reason: string | null; resume_date: string | null }, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DealNotFoundError();
    const status = snap.get("status");
    if (status === "vendida" || status === "perdida") throw new DealClosedError();
    if (status === "pausada") return;
    const now = FieldValue.serverTimestamp();
    tx.update(ref, {
      status: "pausada",
      paused_reason: input.reason,
      paused_until: input.resume_date,
      paused_at: now,
      version: FieldValue.increment(1),
      updated_at: now,
      last_activity_at: now,
    });
    const parts = [input.reason, input.resume_date ? `Retomar em ${dateBr(input.resume_date)}.` : null].filter(Boolean).join(" — ");
    tx.create(ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(), historyData("status", "Negociação pausada", parts || null, actor));
    if (input.resume_date) {
      const ownerUid = str(snap.get("owner_uid")) ?? actor.uid;
      const ownerName = str(snap.get("owner_name")) ?? actor.name;
      const task = db.collection(TASKS_COLLECTION).doc();
      tx.create(task, {
        deal_id: id,
        title: "Retomar negociação",
        type: "follow_up",
        due_at: Timestamp.fromDate(brazilDateTime(input.resume_date, "09:00")),
        done: false,
        done_at: null,
        assignee_uid: ownerUid,
        assignee_name: ownerName,
        notes: input.reason ? `Pausada: ${input.reason}` : null,
        created_by_uid: actor.uid,
        created_by_name: actor.name,
        created_at: now,
        updated_at: now,
      });
      tx.create(ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(), historyData("task", "Tarefa criada", `Follow-up: Retomar negociação · ${dateBr(input.resume_date)} 09:00 · ${ownerName}`, actor, { task_id: task.id }));
    }
  }, { maxAttempts: MAX_ATTEMPTS });
}

export async function resumeDeal(id: string, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DealNotFoundError();
    if (snap.get("status") !== "pausada") return;
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { status: "em_andamento", paused_reason: null, paused_until: null, paused_at: null, version: FieldValue.increment(1), updated_at: now, last_activity_at: now });
    tx.create(ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(), historyData("status", "Negociação retomada", "Pausada → Em andamento", actor));
  }, { maxAttempts: MAX_ATTEMPTS });
}

// ── Excluir ──────────────────────────────────────────────────────────────────

export class DealSoldError extends Error {
  constructor() {
    super("deal_sold");
  }
}

/**
 * Exclui uma negociação criada por engano (vendida não: desfaça a venda antes).
 * Transação: apaga a negociação e devolve o lead de origem para "convertível". Depois, em lotes:
 * histórico, tarefas e arquivos (inclusive no Storage). Contato/empresa/lead nunca são apagados.
 */
export async function deleteDeal(id: string, actor: Actor): Promise<{ leadId: string | null; companyId: string | null }> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DealNotFoundError();
    if (snap.get("status") === "vendida") throw new DealSoldError();
    const leadId = str(snap.get("lead_id"));
    const leadRef = leadId ? db.collection(LEADS_COLLECTION).doc(leadId) : null;
    const lead = leadRef ? await tx.get(leadRef) : null;
    tx.delete(ref);
    if (leadRef && lead?.exists && lead.get("deal_id") === id) {
      tx.update(leadRef, { deal_id: null, converted_at: null, status: "em_andamento", stage: "qualificacao", updated_at: FieldValue.serverTimestamp() });
      tx.create(leadRef.collection(LEAD_NOTES_SUBCOLLECTION).doc(), systemNoteData(`Negociação “${str(snap.get("title")) ?? "sem nome"}” excluída. O lead pode ser convertido de novo.`, actor));
    }
    return { leadId, companyId: str(snap.get("company_id")) };
  }, { maxAttempts: MAX_ATTEMPTS });

  // Limpeza (fora da transação): nada aponta mais para esta negociação.
  await db.recursiveDelete(ref).catch((e) => console.error("deal delete: history cleanup", e instanceof Error ? e.message : e));
  const [tasks, files] = await Promise.all([
    db.collection(TASKS_COLLECTION).where("deal_id", "==", id).select().get(),
    db.collection(DEAL_FILES_COLLECTION).where("deal_id", "==", id).get(),
  ]);
  const bucket = files.empty ? null : await getAdminBucket();
  for (const f of files.docs) if (bucket) await bucket.file(String(f.get("path"))).delete({ ignoreNotFound: true }).catch(() => undefined);
  const docs = [...tasks.docs, ...files.docs];
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return result;
}

// ── Tarefas (módulo próprio: crm/tasks.ts) ──
export { TaskNotFoundError, deleteTask, updateTask } from "./tasks";

// ── Mover para outro funil ───────────────────────────────────────────────────

/**
 * Leva a MESMA negociação para outro funil (pode ser de outro quadro), numa etapa escolhida.
 * Nada é duplicado: histórico, tarefas, arquivos e valores continuam; o tempo na etapa de saída é
 * somado em `stage_time`. Os campos personalizados do funil antigo ficam guardados (não aparecem
 * no novo). Fica registrado no histórico "de → para".
 */
export async function moveDealToPipeline(id: string, input: { pipeline_id: string; stage_id: string; version: number }, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(DEALS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DealNotFoundError();
    const row = toDealRow(snap, new Map(), new Map());
    if (row.version !== input.version) throw new StaleDealError("stale");
    if (row.status === "vendida" || row.status === "perdida") throw new DealClosedError();
    const fromId = row.pipeline_id ?? DEFAULT_PIPELINE_ID;
    const [fromSnap, toSnap] = await tx.getAll(db.collection(PIPELINES_COLLECTION).doc(fromId), db.collection(PIPELINES_COLLECTION).doc(input.pipeline_id));
    if (!toSnap.exists) throw new PipelineNotFoundError();
    const to = toPipeline(toSnap);
    const stage = to.stages.find((s) => s.id === input.stage_id);
    if (to.archived || !stage) throw new PipelineNotFoundError();
    const from = fromSnap.exists ? toPipeline(fromSnap) : null;
    const fromStage = from?.stages.find((s) => s.id === row.stage_id) ?? from?.stages[0] ?? null;
    if (from?.id === to.id && fromStage?.id === stage.id) return;
    const [fromBoard, toBoard] = await tx.getAll(db.collection(BOARDS_COLLECTION).doc(from?.board_id ?? to.board_id), db.collection(BOARDS_COLLECTION).doc(to.board_id));
    if (!toBoard.exists || toBoard.get("archived") === true) throw new PipelineNotFoundError();
    const label = (board: DocumentSnapshot, pipeline: Pipeline | null, stageName: string | undefined) =>
      [str(board.get("name")), pipeline?.name, stageName].filter(Boolean).join(" › ") || "—";

    tx.update(ref, {
      ...stageExitPatch(snap, fromStage?.id ?? null),
      board_id: to.board_id,
      pipeline_id: to.id,
      stage_id: stage.id,
      position: -Date.now(),
      stage_entered_at: FieldValue.serverTimestamp(),
      version: row.version + 1,
      updated_at: FieldValue.serverTimestamp(),
      last_activity_at: FieldValue.serverTimestamp(),
    });
    tx.create(
      ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(),
      historyData("pipeline", "Movida para outro funil", `${label(fromBoard, from, fromStage?.name)} → ${label(toBoard, to, stage.name)}`, actor, { from: from?.id ?? null, to: to.id }),
    );
  }, { maxAttempts: MAX_ATTEMPTS });
}
