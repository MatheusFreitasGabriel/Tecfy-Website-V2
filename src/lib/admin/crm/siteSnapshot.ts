import "server-only";
import { FieldValue, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { SITE_CONTENT_COLLECTION, SITE_PLANS_DOC, parseSitePlans, type SitePlan } from "@/lib/site/plans";

/** `site_content/plans`: o retrato publicado que a landing lê. */
export const siteDocRef = () => getAdminDb().collection(SITE_CONTENT_COLLECTION).doc(SITE_PLANS_DOC);

/**
 * Atualiza UM card no retrato publicado, dentro de uma transação que já leu `site` (leitura pontual).
 * Usado por promoções e reajustes, que vão direto pro ar. Se o produto não está publicado, nada muda.
 */
export function patchPublishedPlan(tx: Transaction, site: DocumentSnapshot, productId: string, patch: Partial<SitePlan>): boolean {
  if (!site.exists) return false;
  const plans = parseSitePlans(site.get("plans"));
  if (!plans) return false;
  const index = plans.findIndex((p) => p.id === productId);
  if (index < 0) return false;
  plans[index] = { ...plans[index], ...patch };
  tx.update(site.ref, { plans, updated_at: FieldValue.serverTimestamp() });
  return true;
}

/**
 * Tira UM card do retrato publicado (produto excluído ou desativado sai do site na hora), dentro de
 * uma transação que já leu `site`. Retorna se o card estava no ar.
 */
export function removePublishedPlan(tx: Transaction, site: DocumentSnapshot, productId: string): boolean {
  if (!site.exists) return false;
  const plans = parseSitePlans(site.get("plans"));
  if (!plans || !plans.some((p) => p.id === productId)) return false;
  tx.update(site.ref, { plans: plans.filter((p) => p.id !== productId), updated_at: FieldValue.serverTimestamp() });
  return true;
}
