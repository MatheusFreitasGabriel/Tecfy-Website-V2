import "server-only";
import { unstable_cache } from "next/cache";
import { fallbackPlans } from "@/app/components/public/home/plans/PlansCardsData";
import { SITE_CONTENT_COLLECTION, SITE_PLANS_DOC, SITE_PLANS_TAG, parseSitePlans, type SitePlan } from "./plans";

/**
 * Lê o retrato publicado (1 leitura por invalidação — "Publicar no site", promoção e reajuste
 * invalidam a tag). Erro de leitura NÃO é cacheado: o site mostra os planos fixos e tenta de novo.
 */
const readPublished = unstable_cache(
  async (): Promise<SitePlan[] | null> => {
    const { getAdminDb } = await import("@/lib/firebaseAdmin");
    const snap = await getAdminDb().collection(SITE_CONTENT_COLLECTION).doc(SITE_PLANS_DOC).get();
    return snap.exists ? parseSitePlans(snap.get("plans")) : null;
  },
  ["site-plans-v1"],
  { tags: [SITE_PLANS_TAG], revalidate: 300 },
);

/** Planos da landing: o que foi publicado no painel ou, se nunca publicado / sem Firestore, os fixos. */
export async function getSitePlans(): Promise<SitePlan[]> {
  try {
    return (await readPublished()) ?? fallbackPlans;
  } catch (error) {
    console.error("site plans read error", error instanceof Error ? error.message : "unknown");
    return fallbackPlans;
  }
}
