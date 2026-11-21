import "server-only";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { listContracts, toContract } from "./contracts";
import { brazilDateTime } from "./dealValidation";
import { historyData } from "./history";
import type { Actor } from "./leads";
import { cancelReasons, productBillings, productIcons, stageColors } from "./options";
import { computeStats, termEndMonth } from "./revenue";
import {
  COMPANIES_COLLECTION,
  CONTRACTS_COLLECTION,
  DEAL_HISTORY_SUBCOLLECTION,
  DEALS_COLLECTION,
  PRODUCTS_COLLECTION,
  type Contract,
  type ContractRow,
  type Product,
  type ProductData,
  type ProductDetail,
  type ProductHistoryRow,
  type ProductRow,
  type ProductStats,
} from "./types";

/**
 * Catálogo de produtos (tela Produtos) e contratos de cada produto.
 * Produtos não são apagados depois de vendidos (só desativados); toda alteração vai para
 * `products/{id}/history` ("Preço: R$ 647 → R$ 697"). Contratos guardam o valor da venda:
 * mudar o preço do produto não muda contratos existentes.
 */

export const PRODUCT_HISTORY_SUBCOLLECTION = "history";

export class ProductNotFoundError extends Error {}
/** Produto com contratos não pode ser excluído (só desativado). */
export class ProductInUseError extends Error {}
export class ContractNotFoundError extends Error {}
/** Data de cancelamento antes da assinatura. */
export class CancelDateError extends Error {}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const iso = (v: unknown): string | null => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate().toISOString() : null);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateBr = (d: string) => d.split("-").reverse().join("/");

/** Documento → produto. Compatível com os produtos antigos ({name, monthly_price, price_label, active, sort}). */
export function toProduct(doc: DocumentSnapshot): Product {
  const d = doc.data() ?? {};
  const monthly = numOrNull(d.monthly_price);
  const billing = productBillings.is(d.billing) ? d.billing : monthly !== null ? "mensal" : "sob_consulta";
  return {
    id: doc.id,
    name: str(d.name) ?? "Produto",
    description: str(d.description),
    billing,
    monthly_price: billing === "mensal" ? monthly : null,
    one_time_price: billing === "unico" ? numOrNull(d.one_time_price) : null,
    setup_fee: billing !== "unico" ? numOrNull(d.setup_fee) : null,
    min_term_months: billing === "unico" ? null : (numOrNull(d.min_term_months) ?? 8),
    features: Array.isArray(d.features) ? d.features.filter((f: unknown): f is string => typeof f === "string") : [],
    color: stageColors.is(d.color) ? d.color : "violet",
    icon: productIcons.is(d.icon) ? d.icon : "rocket",
    highlight: d.highlight === true,
    active: d.active !== false,
    price_label: str(d.price_label),
    sort: typeof d.sort === "number" ? d.sort : 0,
  };
}

const bySort = (a: Product, b: Product) => a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR");

/** Lista do catálogo (inclui inativos) com os números de cada produto + do catálogo inteiro. */
export async function listProducts(now = new Date()): Promise<{ products: ProductRow[]; totals: ProductStats }> {
  const [snap, contracts] = await Promise.all([getAdminDb().collection(PRODUCTS_COLLECTION).get(), listContracts()]);
  const byProduct = new Map<string, Contract[]>();
  for (const c of contracts) {
    const list = byProduct.get(c.product_id);
    if (list) list.push(c);
    else byProduct.set(c.product_id, [c]);
  }
  const products = snap.docs
    .map((doc) => ({ ...toProduct(doc), stats: computeStats(byProduct.get(doc.id) ?? [], now), created_at: iso(doc.get("created_at")) }))
    .sort(bySort);
  return { products, totals: computeStats(contracts, now) };
}

function toContractRow(doc: DocumentSnapshot, companies: Map<string, string>, deals: Map<string, string>): ContractRow | null {
  const c = toContract(doc);
  if (!c) return null;
  const companyId = str(doc.get("company_id"));
  const dealId = str(doc.get("deal_id"));
  return {
    id: c.id,
    company: companyId ? { id: companyId, name: companies.get(companyId) ?? "Empresa removida" } : null,
    deal: dealId ? { id: dealId, title: deals.get(dealId) ?? "Negociação" } : null,
    product_id: c.product_id,
    product_name: c.product_name,
    billing: c.billing,
    monthly_value: c.monthly_value,
    setup_value: c.setup_value,
    one_time_value: c.one_time_value,
    status: c.status,
    signed_at: c.signed_at.toISOString(),
    cancelled_at: c.cancelled_at?.toISOString() ?? null,
    cancel_reason: str(doc.get("cancel_reason")),
    min_term_months: c.min_term_months,
    term_end: c.billing === "unico" ? null : termEndMonth(c.signed_at, c.min_term_months),
  };
}

/** Nomes por id (leituras diretas, em lotes). */
async function namesById(collection: string, field: string, ids: Set<string>): Promise<Map<string, string>> {
  const db = getAdminDb();
  const list = [...ids];
  const out = new Map<string, string>();
  for (let i = 0; i < list.length; i += 300) {
    const snaps = await db.getAll(...list.slice(i, i + 300).map((id) => db.collection(collection).doc(id)), { fieldMask: [field] });
    for (const s of snaps) if (s.exists) out.set(s.id, str(s.get(field)) ?? "Sem nome");
  }
  return out;
}

/** Página do produto: dados, números, contratos (com empresa/negociação) e histórico. */
export async function getProductDetail(id: string, now = new Date()): Promise<ProductDetail | null> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
  const [doc, contractsSnap, historySnap] = await Promise.all([
    ref.get(),
    db.collection(CONTRACTS_COLLECTION).where("product_id", "==", id).get(),
    ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).orderBy("created_at", "desc").limit(100).get(),
  ]);
  if (!doc.exists) return null;

  const companyIds = new Set(contractsSnap.docs.map((d) => str(d.get("company_id"))).filter((v): v is string => Boolean(v)));
  const dealIds = new Set(contractsSnap.docs.map((d) => str(d.get("deal_id"))).filter((v): v is string => Boolean(v)));
  const [companies, deals] = await Promise.all([namesById(COMPANIES_COLLECTION, "trade_name", companyIds), namesById(DEALS_COLLECTION, "title", dealIds)]);

  const contracts = contractsSnap.docs
    .map((d) => toContractRow(d, companies, deals))
    .filter((c): c is ContractRow => c !== null)
    .sort((a, b) => (a.status === b.status ? (b.signed_at ?? "").localeCompare(a.signed_at ?? "") : a.status === "active" ? -1 : 1));
  const stats = computeStats(contractsSnap.docs.map(toContract).filter((c): c is Contract => c !== null), now);
  const history: ProductHistoryRow[] = historySnap.docs.map((h) => ({
    id: h.id,
    title: str(h.get("title")) ?? "",
    description: str(h.get("description")),
    author_name: str(h.get("author_name")),
    created_at: iso(h.get("created_at")),
  }));

  return { ...toProduct(doc), stats, created_at: iso(doc.get("created_at")), contracts, history };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

const money = (v: number | null) => (v === null ? "—" : brl.format(v));

/** "Campo: antes → depois" de cada campo alterado (para o histórico). */
export function describeProductChanges(before: Product, after: ProductData): string[] {
  const changes: string[] = [];
  const push = (label: string, a: string, b: string) => a !== b && changes.push(`${label}: ${a} → ${b}`);
  push("Nome", before.name, after.name);
  push("Cobrança", productBillings.label(before.billing), productBillings.label(after.billing));
  push("Preço mensal", money(before.monthly_price), money(after.monthly_price));
  push("Pagamento único", money(before.one_time_price), money(after.one_time_price));
  push("Implantação", money(before.setup_fee), money(after.setup_fee));
  push("Fidelidade", before.min_term_months ? `${before.min_term_months} meses` : "—", after.min_term_months ? `${after.min_term_months} meses` : "—");
  if ((before.description ?? "") !== (after.description ?? "")) changes.push("Descrição alterada");
  if (before.features.join("\n") !== after.features.join("\n")) changes.push(`Itens inclusos: ${before.features.length} → ${after.features.length}`);
  push("Cor", stageColors.label(before.color), stageColors.label(after.color));
  push("Ícone", productIcons.label(before.icon), productIcons.label(after.icon));
  push("Destaque", before.highlight ? "sim" : "não", after.highlight ? "sim" : "não");
  push("Situação", before.active ? "Ativo" : "Inativo", after.active ? "Ativo" : "Inativo");
  return changes;
}

const authorship = (actor: Actor) => ({ updated_by_uid: actor.uid, updated_by_name: actor.name, updated_at: FieldValue.serverTimestamp() });

/** Cria o produto no fim do catálogo. Idempotente pelo `requestId` (id do documento). */
export async function createProduct(data: ProductData, actor: Actor, requestId: string): Promise<{ id: string; created: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(`p_${requestId}`);
  const last = await db.collection(PRODUCTS_COLLECTION).orderBy("sort", "desc").limit(1).get();
  const sort = (last.docs[0]?.get("sort") ?? -1) + 1;
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return { id: ref.id, created: false };
    tx.create(ref, {
      ...data,
      price_label: null,
      sort,
      created_by_uid: actor.uid,
      created_by_name: actor.name,
      created_at: FieldValue.serverTimestamp(),
      ...authorship(actor),
    });
    tx.create(ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(), historyData("created", "Produto criado", null, actor));
    return { id: ref.id, created: true };
  });
}

/** Edita o produto. Sem mudança → não grava. Contratos existentes não mudam. */
export async function updateProduct(id: string, data: ProductData, actor: Actor): Promise<{ changed: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProductNotFoundError();
    const changes = describeProductChanges(toProduct(snap), data);
    if (!changes.length) return { changed: false };
    tx.update(ref, { ...data, price_label: null, ...authorship(actor) });
    tx.create(ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(), historyData("updated", "Produto alterado", changes.join(" · "), actor));
    return { changed: true };
  });
}

export async function setProductActive(id: string, active: boolean, actor: Actor): Promise<{ changed: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProductNotFoundError();
    if ((snap.get("active") !== false) === active) return { changed: false };
    tx.update(ref, { active, ...authorship(actor) });
    tx.create(
      ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(),
      historyData("status", active ? "Produto ativado" : "Produto desativado", active ? "Volta a aparecer em \"Marcar como vendida\"." : "Some de \"Marcar como vendida\"; contratos existentes continuam.", actor),
    );
    return { changed: true };
  });
}

/** Move o produto uma posição na ordem do catálogo (renumera 0..n, um batch). */
export async function moveProduct(id: string, direction: "up" | "down"): Promise<void> {
  const db = getAdminDb();
  const snap = await db.collection(PRODUCTS_COLLECTION).get();
  const list = snap.docs.map(toProduct).sort(bySort);
  const index = list.findIndex((p) => p.id === id);
  if (index < 0) throw new ProductNotFoundError();
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  const batch = db.batch();
  list.forEach((p, i) => p.sort !== i && batch.update(db.collection(PRODUCTS_COLLECTION).doc(p.id), { sort: i }));
  await batch.commit();
}

/** Exclui um produto que NUNCA foi vendido (cadastro errado). Com contratos → ProductInUseError. */
export async function deleteProduct(id: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
  const [snap, used] = await Promise.all([ref.get(), db.collection(CONTRACTS_COLLECTION).where("product_id", "==", id).limit(1).get()]);
  if (!snap.exists) throw new ProductNotFoundError();
  if (!used.empty) throw new ProductInUseError();
  const history = await ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).limit(400).get();
  const batch = db.batch();
  history.docs.forEach((h) => batch.delete(h.ref));
  batch.delete(ref);
  await batch.commit();
}

// ── Contratos ────────────────────────────────────────────────────────────────

/**
 * Cancela o contrato: deixa de contar como ativo/faturamento mensal; o mês do cancelamento é o
 * último cobrado no faturamento anual. Registra na negociação e no produto. Idempotente.
 */
export async function cancelContract(id: string, input: { date: string; reason: string; detail: string | null }, actor: Actor): Promise<{ changed: boolean; productId: string | null; companyId: string | null; dealId: string | null }> {
  const db = getAdminDb();
  const ref = db.collection(CONTRACTS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ContractNotFoundError();
    const contract = toContract(snap);
    if (!contract) throw new ContractNotFoundError();
    const dealId = str(snap.get("deal_id"));
    const companyId = str(snap.get("company_id"));
    const productRef = contract.product_id ? db.collection(PRODUCTS_COLLECTION).doc(contract.product_id) : null;
    const dealRef = dealId ? db.collection(DEALS_COLLECTION).doc(dealId) : null;
    const companyRef = companyId ? db.collection(COMPANIES_COLLECTION).doc(companyId) : null;
    const [product, deal, company] = await Promise.all([
      productRef ? tx.get(productRef) : null,
      dealRef ? tx.get(dealRef) : null,
      companyRef ? tx.get(companyRef) : null,
    ]);
    const result = { productId: contract.product_id || null, companyId, dealId };
    if (contract.status === "cancelled") return { changed: false, ...result };

    const cancelledAt = brazilDateTime(input.date, "12:00");
    if (cancelledAt < new Date(contract.signed_at.getTime() - 86_400_000)) throw new CancelDateError();

    const term = contract.billing === "unico" ? null : termEndMonth(contract.signed_at, contract.min_term_months);
    const cancelMonth = input.date.slice(0, 7);
    const withinTerm = term !== null && cancelMonth < term;
    const reason = [cancelReasons.label(input.reason), input.detail].filter(Boolean).join(" — ");
    const description = [
      `${contract.product_name} · ${brl.format(contract.monthly_value)}/mês · cancelado em ${dateBr(input.date)}`,
      reason,
      withinTerm ? `Dentro da fidelidade (até ${term!.split("-").reverse().join("/")}).` : null,
    ]
      .filter(Boolean)
      .join("\n");

    tx.update(ref, {
      status: "cancelled",
      cancelled_at: Timestamp.fromDate(cancelledAt),
      cancel_reason: reason,
      cancelled_by_uid: actor.uid,
      cancelled_by_name: actor.name,
      updated_at: FieldValue.serverTimestamp(),
    });
    if (deal?.exists) tx.create(deal.ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(), historyData("contract_cancelled", "Contrato cancelado", description, actor, { contract_id: id }));
    if (product?.exists) {
      const companyName = company?.exists ? ` — ${str(company.get("trade_name")) ?? "empresa"}` : "";
      tx.create(product.ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(), historyData("contract_cancelled", `Contrato cancelado${companyName}`, description, actor, { contract_id: id }));
    }
    return { changed: true, ...result };
  });
}
