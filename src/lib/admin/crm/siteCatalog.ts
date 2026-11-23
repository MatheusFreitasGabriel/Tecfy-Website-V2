import "server-only";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { SITE_PUBLICATIONS_COLLECTION, buildSitePlans, diffSitePlans, parseSitePlans, type SitePlan } from "@/lib/site/plans";
import { historyData } from "./history";
import type { Actor } from "./leads";
import { PRODUCT_HISTORY_SUBCOLLECTION, listCatalog, toProduct } from "./products";
import { siteDocRef } from "./siteSnapshot";
import { PRODUCTS_COLLECTION, type SitePublicationRow, type SiteState } from "./types";

/**
 * Seção "Planos e valores" do site. O cadastro dos produtos é o rascunho; "Publicar no site"
 * grava o retrato (`site_content/plans`) que a landing lê + uma cópia em `site_publications`
 * (histórico, com "Restaurar").
 */

export class PublicationNotFoundError extends Error {}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const iso = (v: unknown): string | null => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate().toISOString() : null);
const dateTimeBr = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function toPublicationRow(doc: DocumentSnapshot): SitePublicationRow {
  const plans = parseSitePlans(doc.get("plans")) ?? [];
  return {
    id: doc.id,
    published_at: iso(doc.get("published_at")),
    published_by_name: str(doc.get("published_by_name")),
    title: str(doc.get("title")) ?? "Publicação",
    summary: Array.isArray(doc.get("summary")) ? (doc.get("summary") as unknown[]).filter((s): s is string => typeof s === "string") : [],
    plan_count: plans.length,
  };
}

/** O que está no ar + últimas publicações. */
export async function getSiteState(): Promise<SiteState> {
  const db = getAdminDb();
  const [site, pubs] = await Promise.all([siteDocRef().get(), db.collection(SITE_PUBLICATIONS_COLLECTION).orderBy("published_at", "desc").limit(30).get()]);
  return {
    published: site.exists ? (parseSitePlans(site.get("plans")) ?? []) : null,
    published_at: site.exists ? iso(site.get("published_at")) : null,
    published_by_name: site.exists ? str(site.get("published_by_name")) : null,
    publications: pubs.docs.map(toPublicationRow),
  };
}

/** Resumo legível das diferenças (vai para o histórico da publicação). */
function summarize(draft: SitePlan[], published: SitePlan[] | null, now: number): string[] {
  if (!published) return [`Primeira publicação: ${draft.length} plano(s) no site.`];
  const { diffs, orderChanged } = diffSitePlans(draft, published, now);
  const lines = diffs.map((d) => (d.kind === "added" ? `${d.name}: entrou no site` : d.kind === "removed" ? `${d.name}: saiu do site` : `${d.name}: ${d.fields.join(", ")}`));
  if (orderChanged) lines.push("Ordem dos planos alterada");
  return lines.length ? lines : ["Sem mudanças (republicado)"];
}

/** Publica o catálogo atual no site. */
export async function publishSite(actor: Actor): Promise<{ plans: number; summary: string[] }> {
  const db = getAdminDb();
  const now = Date.now();
  const [products, site] = await Promise.all([listCatalog(new Date(now)), siteDocRef().get()]);
  const plans = buildSitePlans(products);
  const published = site.exists ? parseSitePlans(site.get("plans")) : null;
  const summary = summarize(plans, published, now);
  const { diffs } = published ? diffSitePlans(plans, published, now) : { diffs: plans.map((p) => ({ id: p.id, name: p.name, kind: "added" as const, fields: [] })) };

  const batch = db.batch();
  const meta = { published_at: FieldValue.serverTimestamp(), published_by_uid: actor.uid, published_by_name: actor.name };
  batch.set(siteDocRef(), { plans, ...meta, updated_at: FieldValue.serverTimestamp(), version: FieldValue.increment(1) });
  batch.create(db.collection(SITE_PUBLICATIONS_COLLECTION).doc(), { plans, ...meta, title: "Publicação", summary });
  // Cada produto que mudou no site ganha um registro no histórico (produto excluído não tem mais documento).
  const existing = new Set(products.map((p) => p.id));
  for (const d of diffs.filter((x) => existing.has(x.id)).slice(0, 200)) {
    const text = d.kind === "added" ? "Passou a aparecer no site." : d.kind === "removed" ? "Saiu do site." : `Atualizado no site: ${d.fields.join(", ")}.`;
    batch.create(db.collection(PRODUCTS_COLLECTION).doc(d.id).collection(PRODUCT_HISTORY_SUBCOLLECTION).doc(), historyData("site", "Publicado no site", text, actor));
  }
  await batch.commit();
  return { plans: plans.length, summary };
}

/**
 * Volta o site para uma publicação anterior. O cadastro (rascunho) não muda — a tela passa a mostrar
 * as diferenças como pendentes. Promoção e reajuste de cada plano vêm do cadastro atual (são "ao vivo").
 */
export async function restorePublication(id: string, actor: Actor): Promise<{ plans: number }> {
  const db = getAdminDb();
  const pub = await db.collection(SITE_PUBLICATIONS_COLLECTION).doc(id).get();
  if (!pub.exists) throw new PublicationNotFoundError();
  const old = parseSitePlans(pub.get("plans")) ?? [];
  const current = old.length ? await db.getAll(...old.map((p) => db.collection(PRODUCTS_COLLECTION).doc(p.id))) : [];
  const byId = new Map(current.filter((s) => s.exists).map((s) => [s.id, toProduct(s)]));
  const plans = old.map((p) => {
    const live = byId.get(p.id);
    return live && p.price !== null ? { ...p, promo: live.promo, price_change: live.price_change ? { new_price: live.price_change.new_price, effective_date: live.price_change.effective_date } : null } : p;
  });
  const when = iso(pub.get("published_at"));
  const title = `Restauração da versão de ${when ? dateTimeBr.format(new Date(when)) : "uma publicação anterior"}`;
  const meta = { published_at: FieldValue.serverTimestamp(), published_by_uid: actor.uid, published_by_name: actor.name };
  const batch = db.batch();
  batch.set(siteDocRef(), { plans, ...meta, updated_at: FieldValue.serverTimestamp(), version: FieldValue.increment(1) });
  batch.create(db.collection(SITE_PUBLICATIONS_COLLECTION).doc(), { plans, ...meta, title, summary: [`${plans.length} plano(s) restaurados.`], restored_from: id });
  await batch.commit();
  return { plans: plans.length };
}
