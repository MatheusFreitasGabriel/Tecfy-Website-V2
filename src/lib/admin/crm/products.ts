import "server-only";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { listContracts, toContract } from "./contracts";
import { brazilDateTime } from "./dealValidation";
import { historyData } from "./history";
import type { Actor } from "./leads";
import { basePrice, brazilDayKey, parsePriceChange, parsePromo } from "@/lib/site/plans";
import { cancelReasons, productBillings, productIcons, siteSections, stageColors } from "./options";
import { computeStats, currentMonthKey, termEndMonth } from "./revenue";
import { patchPublishedPlan, removePublishedPlan, siteDocRef } from "./siteSnapshot";
import {
  COMPANIES_COLLECTION,
  CONTRACTS_COLLECTION,
  DEAL_HISTORY_SUBCOLLECTION,
  DEALS_COLLECTION,
  LEADS_COLLECTION,
  PRODUCTS_COLLECTION,
  type Contract,
  type ContractRow,
  type Product,
  type ProductData,
  type ProductDetail,
  type ProductHistoryRow,
  type ProductLeadStats,
  type ProductRow,
  type ProductStats,
  type PromotionRow,
} from "./types";

/**
 * Catálogo de produtos (tela Produtos) e contratos de cada produto.
 * Produtos não são apagados depois de vendidos (só desativados); toda alteração vai para
 * `products/{id}/history` ("Preço: R$ 647 → R$ 697"). Contratos guardam o valor da venda:
 * mudar o preço do produto não muda contratos existentes.
 */

export const PRODUCT_HISTORY_SUBCOLLECTION = "history";
export const PRODUCT_PROMOTIONS_SUBCOLLECTION = "promotions";

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
  const features: string[] = Array.isArray(d.features) ? d.features.filter((f: unknown): f is string => typeof f === "string") : [];
  const icons: unknown[] = Array.isArray(d.feature_icons) ? d.feature_icons : [];
  const change = parsePriceChange(d.price_change);
  return {
    id: doc.id,
    name: str(d.name) ?? "Produto",
    description: str(d.description),
    billing,
    monthly_price: billing === "mensal" ? monthly : null,
    one_time_price: billing === "unico" ? numOrNull(d.one_time_price) : null,
    setup_fee: billing !== "unico" ? numOrNull(d.setup_fee) : null,
    min_term_months: billing === "unico" ? null : (numOrNull(d.min_term_months) ?? 8),
    features,
    feature_icons: features.map((_, i) => (productIcons.is(icons[i]) ? icons[i] : "check")),
    color: stageColors.is(d.color) ? d.color : "violet",
    icon: productIcons.is(d.icon) ? d.icon : "rocket",
    highlight: d.highlight === true,
    active: d.active !== false,
    site_visible: d.site_visible === true,
    site_section: siteSections.is(d.site_section) ? d.site_section : billing === "unico" ? "oneTime" : "monthly",
    site_price_label: str(d.site_price_label),
    site_cta: str(d.site_cta),
    monthly_goal: numOrNull(d.monthly_goal),
    price_label: str(d.price_label),
    sort: typeof d.sort === "number" ? d.sort : 0,
    promo: parsePromo(d.promo),
    price_change: change ? { ...change, created_by_name: str(d.price_change?.created_by_name) } : null,
  };
}

/** Campos do cadastro (o que o formulário grava) a partir do produto. */
export function productDataOf(p: Product): ProductData {
  return {
    name: p.name,
    description: p.description,
    billing: p.billing,
    monthly_price: p.monthly_price,
    one_time_price: p.one_time_price,
    setup_fee: p.setup_fee,
    min_term_months: p.min_term_months,
    features: p.features,
    color: p.color,
    icon: p.icon,
    highlight: p.highlight,
    active: p.active,
    feature_icons: p.feature_icons,
    site_visible: p.site_visible,
    site_section: p.site_section,
    site_price_label: p.site_price_label,
    site_cta: p.site_cta,
    monthly_goal: p.monthly_goal,
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
  const products = (await applyDuePriceChanges(snap.docs.map(toProduct), now))
    .map((p) => ({ ...p, stats: computeStats(byProduct.get(p.id) ?? [], now), created_at: iso(snap.docs.find((d) => d.id === p.id)?.get("created_at")) }))
    .sort(bySort);
  return { products, totals: computeStats(contracts, now) };
}

/** Um produto (leitura pontual) ou null. */
export async function getProduct(id: string): Promise<Product | null> {
  const snap = await getAdminDb().collection(PRODUCTS_COLLECTION).doc(id).get();
  return snap.exists ? toProduct(snap) : null;
}

/** Só para o cálculo do site/rascunho (sem números): catálogo inteiro, reajustes vencidos aplicados. */
export async function listCatalog(now = new Date()): Promise<Product[]> {
  const snap = await getAdminDb().collection(PRODUCTS_COLLECTION).get();
  return (await applyDuePriceChanges(snap.docs.map(toProduct), now)).sort(bySort);
}

/**
 * Reajustes agendados cuja data chegou viram o preço de tabela (com histórico e retrato do site
 * atualizado). Roda nas leituras do catálogo; a tela e o site já mostram o preço novo antes disso
 * (calculam pela data), então isto só "consolida" o cadastro. Falha aqui não derruba a leitura.
 */
async function applyDuePriceChanges(products: Product[], now: Date): Promise<Product[]> {
  const today = brazilDayKey(now.getTime());
  const due = products.filter((p) => p.price_change && p.price_change.effective_date <= today && basePrice(p) !== null);
  if (!due.length) return products;
  const db = getAdminDb();
  const applied = new Map<string, Product>();
  await Promise.all(
    due.map(async (p) => {
      try {
        const ref = db.collection(PRODUCTS_COLLECTION).doc(p.id);
        const result = await db.runTransaction(async (tx) => {
          const [snap, site] = await tx.getAll(ref, siteDocRef());
          if (!snap.exists) return null;
          const fresh = toProduct(snap);
          const change = fresh.price_change;
          if (!change || change.effective_date > today || basePrice(fresh) === null) return null;
          const field = fresh.billing === "unico" ? "one_time_price" : "monthly_price";
          const before = basePrice(fresh);
          tx.update(ref, { [field]: change.new_price, price_change: null, updated_at: FieldValue.serverTimestamp() });
          tx.create(
            ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(),
            historyData("price_change", "Reajuste aplicado", `Preço: ${money(before)} → ${money(change.new_price)} (agendado para ${dateBr(change.effective_date)})`, { uid: "system", name: "Sistema" }),
          );
          patchPublishedPlan(tx, site, p.id, { price: change.new_price, price_change: null });
          return { ...fresh, [field]: change.new_price, price_change: null } as Product;
        });
        if (result) applied.set(p.id, result);
      } catch (error) {
        console.error("crm apply price change error", error instanceof Error ? error.message : "unknown");
      }
    }),
  );
  return products.map((p) => applied.get(p.id) ?? p);
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
    promotion_id: str(doc.get("promotion_id")),
    list_price: numOrNull(doc.get("list_price")),
  };
}

function toPromotionRow(doc: DocumentSnapshot): PromotionRow | null {
  const promo = parsePromo({ ...doc.data(), id: doc.id });
  if (!promo) return null;
  return {
    ...promo,
    list_price: numOrNull(doc.get("list_price")) ?? 0,
    ended_early_at: str(doc.get("ended_early_at")),
    created_by_name: str(doc.get("created_by_name")),
    created_at: iso(doc.get("created_at")),
  };
}

/** Leads do site que pediram o plano pelo nome (`interest_plan`), últimos 12 meses por mês. */
async function leadStats(name: string, now: Date): Promise<ProductLeadStats> {
  const db = getAdminDb();
  const variants = [...new Set([name, name.toLowerCase(), name.toUpperCase()])];
  const snaps = await Promise.all(variants.map((v) => db.collection(LEADS_COLLECTION).where("interest_plan", "==", v).select("deal_id", "converted_at", "created_at").get()));
  const seen = new Set<string>();
  const stats: ProductLeadStats = { total: 0, converted: 0, by_month: {} };
  const oldest = new Date(now);
  oldest.setMonth(oldest.getMonth() - 12);
  for (const doc of snaps.flatMap((s) => s.docs)) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    stats.total += 1;
    if (doc.get("deal_id") || doc.get("converted_at")) stats.converted += 1;
    const created = doc.get("created_at");
    if (created && typeof created.toDate === "function") {
      const date: Date = created.toDate();
      if (date >= oldest) {
        const key = currentMonthKey(date);
        stats.by_month[key] = (stats.by_month[key] ?? 0) + 1;
      }
    }
  }
  return stats;
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
  const [doc, contractsSnap, historySnap, promotionsSnap] = await Promise.all([
    ref.get(),
    db.collection(CONTRACTS_COLLECTION).where("product_id", "==", id).get(),
    ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).orderBy("created_at", "desc").limit(200).get(),
    ref.collection(PRODUCT_PROMOTIONS_SUBCOLLECTION).orderBy("created_at", "desc").limit(50).get(),
  ]);
  if (!doc.exists) return null;
  const [product] = await applyDuePriceChanges([toProduct(doc)], now);
  const leads = await leadStats(product.name, now).catch(() => ({ total: 0, converted: 0, by_month: {} }));

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
    type: str(h.get("type")) ?? "updated",
    title: str(h.get("title")) ?? "",
    description: str(h.get("description")),
    author_name: str(h.get("author_name")),
    created_at: iso(h.get("created_at")),
  }));
  const promotions = promotionsSnap.docs.map(toPromotionRow).filter((p): p is PromotionRow => p !== null);

  return { ...product, stats, created_at: iso(doc.get("created_at")), contracts, history, promotions, leads };
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
  if (before.features.join("\n") === after.features.join("\n") && before.feature_icons.join() !== after.feature_icons.join()) changes.push("Ícones dos itens alterados");
  push("No site", before.site_visible ? "sim" : "não", after.site_visible ? "sim" : "não");
  push("Aba do site", siteSections.label(before.site_section), siteSections.label(after.site_section));
  push("Texto do preço no site", before.site_price_label ?? "padrão", after.site_price_label ?? "padrão");
  push("Botão no site", before.site_cta ?? "padrão", after.site_cta ?? "padrão");
  push("Meta mensal", money(before.monthly_goal), money(after.monthly_goal));
  return changes;
}

/** Tipo do registro de histórico pela mudança: preço / site / cadastro. */
const changeType = (changes: string[]) =>
  changes.some((c) => /^(Preço mensal|Pagamento único|Implantação|Cobrança)/.test(c)) ? "price" : changes.every((c) => /site/i.test(c)) ? "site" : "updated";

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
      promo: null,
      price_change: null,
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
    tx.create(ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(), historyData(changeType(changes), "Produto alterado", changes.join(" · "), actor));
    return { changed: true };
  });
}

/** Cópia do produto (desativada e fora do site), no fim do catálogo. Idempotente pelo `requestId`. */
export async function duplicateProduct(sourceId: string, actor: Actor, requestId: string): Promise<{ id: string; created: boolean }> {
  const db = getAdminDb();
  const source = await db.collection(PRODUCTS_COLLECTION).doc(sourceId).get();
  if (!source.exists) throw new ProductNotFoundError();
  const original = toProduct(source);
  const suffix = " (cópia)";
  const data: ProductData = {
    ...productDataOf(original),
    name: original.name.slice(0, 60 - suffix.length) + suffix,
    active: false,
    highlight: false,
    site_visible: false,
  };
  const result = await createProduct(data, actor, requestId);
  if (result.created) {
    await db
      .collection(PRODUCTS_COLLECTION)
      .doc(result.id)
      .collection(PRODUCT_HISTORY_SUBCOLLECTION)
      .add(historyData("created", "Criado como cópia", `Cópia de "${original.name}". Começa desativado e fora do site.`, actor));
  }
  return result;
}

/** Agenda um reajuste de preço (substitui o agendado). Vai direto para o retrato do site. */
export async function schedulePriceChange(id: string, change: { new_price: number; effective_date: string }, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const [snap, site] = await tx.getAll(ref, siteDocRef());
    if (!snap.exists) throw new ProductNotFoundError();
    const product = toProduct(snap);
    tx.update(ref, { price_change: { ...change, created_by_name: actor.name }, ...authorship(actor) });
    tx.create(
      ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(),
      historyData("price_change", "Reajuste agendado", `Preço: ${money(basePrice(product))} → ${money(change.new_price)} a partir de ${dateBr(change.effective_date)}`, actor),
    );
    patchPublishedPlan(tx, site, id, { price_change: { new_price: change.new_price, effective_date: change.effective_date } });
  });
}

export async function cancelPriceChange(id: string, actor: Actor): Promise<{ changed: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const [snap, site] = await tx.getAll(ref, siteDocRef());
    if (!snap.exists) throw new ProductNotFoundError();
    const change = toProduct(snap).price_change;
    if (!change) return { changed: false };
    tx.update(ref, { price_change: null, ...authorship(actor) });
    tx.create(ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(), historyData("price_change", "Reajuste cancelado", `${money(change.new_price)} a partir de ${dateBr(change.effective_date)} não vai mais valer.`, actor));
    patchPublishedPlan(tx, site, id, { price_change: null });
    return { changed: true };
  });
}

/**
 * Ativa/desativa. Desativar tira o card do site NA HORA (sem esperar "Publicar"); reativar não
 * publica sozinho — volta ao site no próximo "Publicar no site".
 */
export async function setProductActive(id: string, active: boolean, actor: Actor): Promise<{ changed: boolean; leftSite: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const [snap, site] = await tx.getAll(ref, siteDocRef());
    if (!snap.exists) throw new ProductNotFoundError();
    if ((snap.get("active") !== false) === active) return { changed: false, leftSite: false };
    const leftSite = !active && removePublishedPlan(tx, site, id);
    tx.update(ref, { active, ...authorship(actor) });
    tx.create(
      ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(),
      historyData(
        "status",
        active ? "Produto ativado" : "Produto desativado",
        active
          ? "Volta a aparecer em \"Marcar como vendida\". Para voltar ao site, publique na tela Produtos."
          : `Some de "Marcar como vendida"; contratos existentes continuam.${leftSite ? " Saiu do site na hora." : ""}`,
        actor,
      ),
    );
    return { changed: true, leftSite };
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

/** Exclui um produto que NUNCA foi vendido (cadastro errado) e tira o card do site. Com contratos → ProductInUseError. */
export async function deleteProduct(id: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
  const [snap, used] = await Promise.all([ref.get(), db.collection(CONTRACTS_COLLECTION).where("product_id", "==", id).limit(1).get()]);
  if (!snap.exists) throw new ProductNotFoundError();
  if (!used.empty) throw new ProductInUseError();
  // Produto + card do site na mesma transação: excluir tira do site na hora.
  await db.runTransaction(async (tx) => {
    const [fresh, site] = await tx.getAll(ref, siteDocRef());
    if (!fresh.exists) return;
    removePublishedPlan(tx, site, id);
    tx.delete(ref);
  });
  const [history, promotions] = await Promise.all([ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).limit(400).get(), ref.collection(PRODUCT_PROMOTIONS_SUBCOLLECTION).limit(80).get()]);
  if (!history.empty || !promotions.empty) {
    const batch = db.batch();
    history.docs.forEach((h) => batch.delete(h.ref));
    promotions.docs.forEach((h) => batch.delete(h.ref));
    await batch.commit();
  }
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
