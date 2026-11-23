/**
 * Planos da seção "Planos e valores" do site — módulo PURO (cliente e servidor).
 *
 * Fluxo: o painel edita `products` (rascunho). "Publicar no site" grava um retrato em
 * `site_content/plans` (`SitePlan[]`), que é o que a landing lê. Promoções e reajustes agendados
 * são ações explícitas: vão direto para o retrato publicado (sem esperar "Publicar").
 * Tudo que depende de data (promoção ativa, reajuste já valendo) é calculado na hora de mostrar,
 * então uma promoção que acaba some do site sozinha.
 */
import type { ProductBilling, ProductIcon, PromotionKind, SiteSection } from "@/lib/admin/crm/options";

export const SITE_CONTENT_COLLECTION = "site_content";
export const SITE_PLANS_DOC = "plans";
export const SITE_PUBLICATIONS_COLLECTION = "site_publications";
/** Tag do cache do site (landing). */
export const SITE_PLANS_TAG = "site-plans";

export interface PromoInfo {
  id: string;
  /** Ex.: "Black Friday". */
  name: string;
  kind: PromotionKind;
  /** % (1–90) ou preço promocional em reais. */
  value: number;
  /** ISO. */
  starts_at: string;
  /** ISO; null = sem data para acabar. */
  ends_at: string | null;
}

export interface PriceChange {
  /** Novo preço em reais (mensal ou único, conforme a cobrança). */
  new_price: number;
  /** "AAAA-MM-DD" (Brasília): a partir deste dia vale o novo preço. */
  effective_date: string;
}

export type PromoStatus = "scheduled" | "active" | "ended";

export interface SiteFeature {
  text: string;
  icon: ProductIcon;
}

/** Um card da seção de planos. */
export interface SitePlan {
  id: string;
  name: string;
  section: SiteSection;
  billing: ProductBilling;
  /** Preço de tabela em reais; null = sob consulta. */
  price: number | null;
  /** Texto no lugar do preço quando não há preço ("SOB CONSULTA"). */
  price_label: string | null;
  setup_fee: number | null;
  description: string | null;
  features: SiteFeature[];
  highlight: boolean;
  /** Texto do botão. */
  cta: string;
  promo: PromoInfo | null;
  price_change: PriceChange | null;
}

/** O mínimo de um produto para virar card do site (o `Product` do CRM atende). */
export interface SiteProductLike {
  id: string;
  name: string;
  description: string | null;
  billing: ProductBilling;
  monthly_price: number | null;
  one_time_price: number | null;
  setup_fee: number | null;
  features: string[];
  feature_icons: ProductIcon[];
  highlight: boolean;
  active: boolean;
  sort: number;
  site_visible: boolean;
  site_section: SiteSection;
  site_price_label: string | null;
  site_cta: string | null;
  promo: PromoInfo | null;
  price_change: PriceChange | null;
}

export const DEFAULT_PRICE_LABEL = "SOB CONSULTA";
export const defaultCta = (name: string) => `Assinar ${name}`;

// ── Datas (Brasília) ─────────────────────────────────────────────────────────

const brazilDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
/** "AAAA-MM-DD" do dia em Brasília. */
export const brazilDayKey = (ms: number) => brazilDay.format(new Date(ms));
/** Início do dia em Brasília (ISO). */
export const dayStartIso = (day: string) => new Date(`${day}T00:00:00-03:00`).toISOString();
/** Fim do dia em Brasília (ISO). */
export const dayEndIso = (day: string) => new Date(`${day}T23:59:59-03:00`).toISOString();
/** "AAAA-MM-DD" → "dd/mm". */
export const shortDate = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7);
/** ISO → "dd/mm" em Brasília. */
export const isoShortDate = (iso: string) => shortDate(brazilDayKey(Date.parse(iso)));

// ── Preço ────────────────────────────────────────────────────────────────────

export function promoStatus(promo: Pick<PromoInfo, "starts_at" | "ends_at">, now: number): PromoStatus {
  if (Date.parse(promo.starts_at) > now) return "scheduled";
  if (promo.ends_at && Date.parse(promo.ends_at) <= now) return "ended";
  return "active";
}

/** Preço de tabela pela forma de cobrança; null = sob consulta. */
export function basePrice(p: { billing: ProductBilling; monthly_price: number | null; one_time_price: number | null }): number | null {
  if (p.billing === "mensal") return p.monthly_price;
  if (p.billing === "unico") return p.one_time_price;
  return null;
}

/** Preço de tabela num instante (aplica o reajuste agendado quando a data chega). */
export function listPriceAt(base: number | null, change: PriceChange | null, now: number): number | null {
  if (base === null) return null;
  if (change && brazilDayKey(now) >= change.effective_date) return change.new_price;
  return base;
}

/** Preço com a promoção aplicada (em reais, centavos arredondados). */
export function promoPrice(list: number, promo: Pick<PromoInfo, "kind" | "value">): number {
  if (promo.kind === "fixed") return Math.min(list, promo.value);
  return Math.round(list * (100 - promo.value)) / 100;
}

export interface PriceAt {
  /** Preço cobrado agora (com promoção, se houver); null = sob consulta. */
  price: number | null;
  /** Preço de tabela riscado quando há promoção ativa. */
  original: number | null;
  /** Promoção ativa agora. */
  promo: PromoInfo | null;
}

/** Preço vigente de um plano/produto num instante. */
export function priceAt(p: { price: number | null; promo: PromoInfo | null; price_change: PriceChange | null }, now: number): PriceAt {
  const list = listPriceAt(p.price, p.price_change, now);
  if (list === null) return { price: null, original: null, promo: null };
  if (p.promo && promoStatus(p.promo, now) === "active") {
    const price = promoPrice(list, p.promo);
    if (price < list) return { price, original: list, promo: p.promo };
  }
  return { price: list, original: null, promo: null };
}

// ── Produto → card ───────────────────────────────────────────────────────────

export function toSitePlan(p: SiteProductLike): SitePlan {
  const price = basePrice(p);
  return {
    id: p.id,
    name: p.name,
    section: p.site_section,
    billing: p.billing,
    price,
    price_label: price === null ? (p.site_price_label ?? DEFAULT_PRICE_LABEL) : null,
    setup_fee: p.billing === "unico" ? null : p.setup_fee,
    description: p.description,
    features: p.features.map((text, i) => ({ text, icon: p.feature_icons[i] ?? "check" })),
    highlight: p.highlight,
    cta: p.site_cta ?? defaultCta(p.name),
    promo: price === null ? null : p.promo,
    price_change: price === null ? null : p.price_change,
  };
}

/** Cards do site a partir do catálogo: só ativos e marcados "no site", na ordem do catálogo. */
export function buildSitePlans(products: SiteProductLike[]): SitePlan[] {
  return products
    .filter((p) => p.active && p.site_visible)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR"))
    .map(toSitePlan);
}

// ── Diferenças rascunho × publicado ──────────────────────────────────────────

export interface SiteDiff {
  id: string;
  name: string;
  kind: "added" | "removed" | "changed";
  /** Rótulos do que mudou (só em "changed"). */
  fields: string[];
}

const FIELD_LABELS: [keyof SitePlan | "effective_price", string][] = [
  ["name", "nome"],
  ["section", "aba"],
  ["effective_price", "preço"],
  ["price_label", "texto do preço"],
  ["setup_fee", "implantação"],
  ["description", "descrição"],
  ["features", "itens"],
  ["highlight", "destaque"],
  ["cta", "botão"],
];

/**
 * O que "Publicar" vai mudar no site. Promoção e reajuste não entram (vão direto pro ar);
 * o preço é comparado já com o reajuste aplicado, para um reajuste que entrou em vigor não
 * aparecer como pendência.
 */
export function diffSitePlans(draft: SitePlan[], published: SitePlan[], now: number): { diffs: SiteDiff[]; orderChanged: boolean } {
  const pub = new Map(published.map((p) => [p.id, p]));
  const dft = new Map(draft.map((p) => [p.id, p]));
  const diffs: SiteDiff[] = [];
  const view = (p: SitePlan) => ({ ...p, effective_price: listPriceAt(p.price, p.price_change, now) });
  for (const d of draft) {
    const p = pub.get(d.id);
    if (!p) {
      diffs.push({ id: d.id, name: d.name, kind: "added", fields: [] });
      continue;
    }
    const a = view(d);
    const b = view(p);
    const fields = FIELD_LABELS.filter(([key]) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(([, label]) => label);
    if (fields.length) diffs.push({ id: d.id, name: d.name, kind: "changed", fields });
  }
  for (const p of published) if (!dft.has(p.id)) diffs.push({ id: p.id, name: p.name, kind: "removed", fields: [] });
  const common = (list: SitePlan[], other: Map<string, SitePlan>) => list.filter((p) => other.has(p.id)).map((p) => p.id).join(",");
  return { diffs, orderChanged: common(draft, pub) !== common(published, dft) };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Promoção gravada no Firestore → PromoInfo (null se malformada). */
export function parsePromo(v: unknown): PromoInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.id) || !isStr(o.name) || (o.kind !== "percent" && o.kind !== "fixed") || !isNum(o.value) || !isStr(o.starts_at)) return null;
  return { id: o.id, name: o.name, kind: o.kind, value: o.value, starts_at: o.starts_at, ends_at: isStr(o.ends_at) ? o.ends_at : null };
}

export function parsePriceChange(v: unknown): PriceChange | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isNum(o.new_price) || !isStr(o.effective_date) || !/^\d{4}-\d{2}-\d{2}$/.test(o.effective_date)) return null;
  return { new_price: o.new_price, effective_date: o.effective_date };
}

/** Lê com segurança um `SitePlan[]` vindo do Firestore. */
export function parseSitePlans(value: unknown): SitePlan[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((p): p is SitePlan => Boolean(p) && typeof p === "object" && typeof (p as SitePlan).id === "string" && typeof (p as SitePlan).name === "string")
    .map((p) => ({
      ...p,
      section: p.section === "oneTime" ? "oneTime" : "monthly",
      price: isNum(p.price) ? p.price : null,
      setup_fee: isNum(p.setup_fee) ? p.setup_fee : null,
      features: Array.isArray(p.features) ? p.features.filter((f) => f && typeof f.text === "string") : [],
      cta: isStr(p.cta) ? p.cta : defaultCta(p.name),
      promo: parsePromo(p.promo),
      price_change: parsePriceChange(p.price_change),
    }));
}
