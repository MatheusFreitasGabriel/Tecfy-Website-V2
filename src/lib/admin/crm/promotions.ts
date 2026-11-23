import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { basePrice, isoShortDate, listPriceAt, promoPrice, promoStatus, type PromoInfo } from "@/lib/site/plans";
import { historyData } from "./history";
import type { Actor } from "./leads";
import type { PromotionInput } from "./productValidation";
import { PRODUCT_HISTORY_SUBCOLLECTION, PRODUCT_PROMOTIONS_SUBCOLLECTION, ProductNotFoundError, toProduct } from "./products";
import { patchPublishedPlan, siteDocRef } from "./siteSnapshot";
import { PRODUCTS_COLLECTION } from "./types";

/**
 * Promoções de um produto. Uma por vez (ativa ou agendada) fica em `products/{id}.promo` — é o que
 * a venda e o site leem (leitura pontual, sem query). Cada promoção também vira um registro em
 * `products/{id}/promotions` (histórico, com o preço de tabela do lançamento).
 * Lançar/encerrar vai direto para o retrato publicado do site.
 */

/** Já existe promoção ativa ou agendada. */
export class PromotionConflictError extends Error {}
export class PromotionNotFoundError extends Error {}
/** Produto sob consulta (sem preço) ou desconto que não reduz o preço. */
export class PromotionPriceError extends Error {}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function describe(promo: Omit<PromoInfo, "id">, list: number): string {
  const price = promoPrice(list, promo);
  const discount = promo.kind === "percent" ? `${promo.value}% off` : `${Math.round((1 - price / list) * 100)}% off`;
  const period = `${isoShortDate(promo.starts_at)}${promo.ends_at ? ` até ${isoShortDate(promo.ends_at)}` : " sem data para acabar"}`;
  return `${brl.format(list)} → ${brl.format(price)} (${discount}) · ${period}`;
}

export async function createPromotion(productId: string, input: PromotionInput, actor: Actor, requestId: string): Promise<{ id: string; created: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(productId);
  const promoRef = ref.collection(PRODUCT_PROMOTIONS_SUBCOLLECTION).doc(`pr_${requestId}`);
  return db.runTransaction(async (tx) => {
    const [snap, existing, site] = await tx.getAll(ref, promoRef, siteDocRef());
    if (!snap.exists) throw new ProductNotFoundError();
    if (existing.exists) return { id: promoRef.id, created: false };
    const product = toProduct(snap);
    const now = Date.now();
    if (product.promo && promoStatus(product.promo, now) !== "ended") throw new PromotionConflictError();
    const list = listPriceAt(basePrice(product), product.price_change, Date.parse(input.starts_at) || now);
    if (list === null || promoPrice(list, input) >= list) throw new PromotionPriceError();

    const promo: PromoInfo = { id: promoRef.id, ...input };
    const scheduled = promoStatus(promo, now) === "scheduled";
    tx.update(ref, { promo, updated_at: FieldValue.serverTimestamp(), updated_by_uid: actor.uid, updated_by_name: actor.name });
    tx.create(promoRef, {
      ...input,
      list_price: list,
      ended_early_at: null,
      created_by_uid: actor.uid,
      created_by_name: actor.name,
      created_at: FieldValue.serverTimestamp(),
    });
    tx.create(
      ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(),
      historyData("promotion", `Promoção "${promo.name}" ${scheduled ? "agendada" : "lançada"}`, describe(input, list), actor, { promotion_id: promo.id }),
    );
    patchPublishedPlan(tx, site, productId, { promo });
    return { id: promo.id, created: true };
  });
}

/** Encerra agora a promoção ativa (ou cancela a agendada). Sai do site na hora. */
export async function endPromotion(productId: string, promotionId: string, actor: Actor): Promise<{ changed: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(PRODUCTS_COLLECTION).doc(productId);
  const promoRef = ref.collection(PRODUCT_PROMOTIONS_SUBCOLLECTION).doc(promotionId);
  return db.runTransaction(async (tx) => {
    const [snap, record, site] = await tx.getAll(ref, promoRef, siteDocRef());
    if (!snap.exists) throw new ProductNotFoundError();
    if (!record.exists) throw new PromotionNotFoundError();
    const product = toProduct(snap);
    const promo = product.promo;
    const now = Date.now();
    if (!promo || promo.id !== promotionId || promoStatus(promo, now) === "ended") return { changed: false };
    const scheduled = promoStatus(promo, now) === "scheduled";
    const endedAt = new Date(now).toISOString();
    tx.update(ref, { promo: null, updated_at: FieldValue.serverTimestamp(), updated_by_uid: actor.uid, updated_by_name: actor.name });
    tx.update(promoRef, { ended_early_at: endedAt, ends_at: scheduled ? promo.starts_at : endedAt, cancelled: scheduled });
    tx.create(
      ref.collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(),
      historyData(
        "promotion",
        scheduled ? `Promoção "${promo.name}" cancelada` : `Promoção "${promo.name}" encerrada`,
        scheduled ? "Cancelada antes de começar." : `Encerrada antes do previsto${promo.ends_at ? ` (ia até ${isoShortDate(promo.ends_at)})` : ""}. O site volta ao preço de tabela.`,
        actor,
        { promotion_id: promo.id },
      ),
    );
    patchPublishedPlan(tx, site, productId, { promo: null });
    return { changed: true };
  });
}
