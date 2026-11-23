/**
 * Validação do cadastro de produto e do cancelamento de contrato.
 * Módulo puro: o modal usa para mostrar os erros e as rotas revalidam no servidor.
 */
import { DEFAULT_PRICE_LABEL, basePrice, dayEndIso, dayStartIso, type PromoInfo } from "@/lib/site/plans";
import { cancelReasons, productBillings, productIcons, promotionKinds, siteSections, stageColors, type ProductBilling, type ProductIcon, type PromotionKind, type SiteSection } from "./options";
import type { Product, ProductData } from "./types";
import { parseCurrencyToCents, type FieldErrors } from "./validation";

export const PRODUCT_LIMITS = { name: 60, description: 400, features: 12, feature: 80, maxTerm: 60, maxCents: 100_000_000_000, priceLabel: 30, cta: 40, promoName: 40 } as const;
export const PRODUCT_MAX_BYTES = 12 * 1024;

/** Formulário (como digitado, valores com máscara "R$ 1.200,00"). */
export interface ProductForm {
  name: string;
  description: string;
  billing: ProductBilling;
  monthly_price: string;
  one_time_price: string;
  setup_fee: string;
  min_term_months: string;
  features: string[];
  color: string;
  icon: string;
  highlight: boolean;
  active: boolean;
  feature_icons: string[];
  site_visible: boolean;
  site_section: SiteSection;
  site_price_label: string;
  site_cta: string;
  monthly_goal: string;
}

export const emptyProductForm = (): ProductForm => ({
  name: "",
  description: "",
  billing: "mensal",
  monthly_price: "",
  one_time_price: "",
  setup_fee: "",
  min_term_months: "8",
  features: [],
  color: "violet",
  icon: "rocket",
  highlight: false,
  active: true,
  feature_icons: [],
  site_visible: false,
  site_section: "monthly",
  site_price_label: "",
  site_cta: "",
  monthly_goal: "",
});

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const clean = (v: unknown): string =>
  str(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

/** Centavos → reais (sem perder precisão de centavo). */
const reais = (cents: number | null): number | null => (cents === null ? null : Math.round(cents) / 100);

export function validateProductForm(input: Partial<ProductForm>): { ok: true; value: ProductData } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const name = clean(input.name);
  if (!name) errors.name = "Dê um nome ao produto.";
  else if (name.length > PRODUCT_LIMITS.name) errors.name = `Use até ${PRODUCT_LIMITS.name} caracteres.`;

  const description = str(input.description).trim();
  if (description.length > PRODUCT_LIMITS.description) errors.description = `Use até ${PRODUCT_LIMITS.description} caracteres.`;

  const billing = productBillings.is(input.billing) ? input.billing : null;
  if (!billing) errors.billing = "Escolha como o produto é cobrado.";

  const money = (field: "monthly_price" | "one_time_price" | "setup_fee", required: boolean, label: string): number | null => {
    const cents = parseCurrencyToCents(str(input[field]));
    if (cents === null || cents === 0) {
      if (required) errors[field] = `Informe ${label}.`;
      return null;
    }
    if (cents > PRODUCT_LIMITS.maxCents) errors[field] = "Valor alto demais.";
    return cents;
  };
  const monthly = billing === "mensal" ? money("monthly_price", true, "o valor mensal") : null;
  const oneTime = billing === "unico" ? money("one_time_price", true, "o valor do pagamento único") : null;
  const setup = billing && billing !== "unico" ? money("setup_fee", false, "a taxa") : null;

  let term: number | null = null;
  if (billing && billing !== "unico") {
    const raw = str(input.min_term_months).trim();
    term = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(term) || term < 0 || term > PRODUCT_LIMITS.maxTerm) errors.min_term_months = `De 0 a ${PRODUCT_LIMITS.maxTerm} meses.`;
  }

  const features: string[] = [];
  const featureIcons: ProductIcon[] = [];
  const seen = new Set<string>();
  const rawIcons: unknown[] = Array.isArray(input.feature_icons) ? input.feature_icons : [];
  (Array.isArray(input.features) ? input.features : []).forEach((raw, i) => {
    const f = clean(raw);
    if (!f || seen.has(f.toLowerCase())) return;
    seen.add(f.toLowerCase());
    features.push(f);
    const icon = rawIcons[i];
    featureIcons.push(productIcons.is(icon) ? icon : "check");
  });
  if (features.length > PRODUCT_LIMITS.features) errors.features = `Use até ${PRODUCT_LIMITS.features} itens.`;
  else if (features.some((f) => f.length > PRODUCT_LIMITS.feature)) errors.features = `Cada item pode ter até ${PRODUCT_LIMITS.feature} caracteres.`;

  if (!stageColors.is(input.color)) errors.color = "Cor inválida.";
  if (!productIcons.is(input.icon)) errors.icon = "Ícone inválido.";

  const siteSection: SiteSection = siteSections.is(input.site_section) ? input.site_section : billing === "unico" ? "oneTime" : "monthly";
  const priceLabel = clean(input.site_price_label);
  if (priceLabel.length > PRODUCT_LIMITS.priceLabel) errors.site_price_label = `Use até ${PRODUCT_LIMITS.priceLabel} caracteres.`;
  const cta = clean(input.site_cta);
  if (cta.length > PRODUCT_LIMITS.cta) errors.site_cta = `Use até ${PRODUCT_LIMITS.cta} caracteres.`;
  const goalCents = parseCurrencyToCents(str(input.monthly_goal));
  if (goalCents !== null && goalCents > PRODUCT_LIMITS.maxCents) errors.monthly_goal = "Valor alto demais.";

  if (Object.keys(errors).length || !billing) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      description: description || null,
      billing,
      monthly_price: reais(monthly),
      one_time_price: reais(oneTime),
      setup_fee: reais(setup),
      min_term_months: term,
      features,
      color: input.color as ProductData["color"],
      icon: input.icon as ProductData["icon"],
      highlight: input.highlight === true,
      active: input.active !== false,
      feature_icons: featureIcons,
      site_visible: input.site_visible === true,
      site_section: siteSection,
      site_price_label: priceLabel && priceLabel.toUpperCase() !== DEFAULT_PRICE_LABEL ? priceLabel : null,
      site_cta: cta || null,
      monthly_goal: goalCents ? reais(goalCents) : null,
    },
  };
}

export interface CancelInput {
  /** "AAAA-MM-DD". */
  date: string;
  reason: string;
  detail: string | null;
}

export function parseCancel(body: Record<string, unknown>): { ok: true; value: CancelInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const date = str(body.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) errors.date = "Informe a data do cancelamento.";
  const reason = str(body.reason);
  if (!cancelReasons.is(reason)) errors.reason = "Escolha o motivo.";
  const detail = str(body.detail).trim();
  if (detail.length > 1000) errors.detail = "Use até 1.000 caracteres.";
  if (reason === "outro" && !detail) errors.detail = "Conte o motivo.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { date, reason, detail: detail || null } };
}

// ── Promoção ────────────────────────────────────────────────────────────────

/** Formulário da promoção (datas "AAAA-MM-DD" em Brasília; valor com máscara). */
export interface PromotionForm {
  name: string;
  kind: PromotionKind;
  /** "15" (%) ou "R$ 497,00". */
  value: string;
  start_date: string;
  /** "" = sem data para acabar. */
  end_date: string;
}

export type PromotionInput = Omit<PromoInfo, "id">;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: string) => DAY.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/**
 * Valida a promoção contra o preço de tabela do produto. `today` = "AAAA-MM-DD" de hoje em Brasília
 * (começar hoje = começa agora; datas no passado não são aceitas).
 */
export function validatePromotion(
  input: Partial<PromotionForm>,
  product: Pick<Product, "billing" | "monthly_price" | "one_time_price">,
  today: string,
  nowIso: string,
): { ok: true; value: PromotionInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const list = basePrice(product);
  if (list === null) return { ok: false, errors: { value: "Produto sob consulta não tem preço para dar desconto." } };

  const name = clean(input.name);
  if (!name) errors.name = "Dê um nome à promoção (ex.: Black Friday).";
  else if (name.length > PRODUCT_LIMITS.promoName) errors.name = `Use até ${PRODUCT_LIMITS.promoName} caracteres.`;

  const kind = promotionKinds.is(input.kind) ? input.kind : null;
  if (!kind) errors.kind = "Escolha o tipo de desconto.";
  let value = 0;
  if (kind === "percent") {
    value = Number(str(input.value).replace(",", ".").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(value) || value < 1 || value > 90) errors.value = "De 1% a 90%.";
    else value = Math.round(value * 10) / 10;
  } else if (kind === "fixed") {
    const cents = parseCurrencyToCents(str(input.value));
    if (!cents) errors.value = "Informe o preço promocional.";
    else if (cents >= Math.round(list * 100)) errors.value = "O preço promocional precisa ser menor que o preço atual.";
    else value = cents / 100;
  }

  const start = str(input.start_date);
  const end = str(input.end_date);
  if (!validDay(start)) errors.start_date = "Informe quando começa.";
  else if (start < today) errors.start_date = "A data de início não pode ser no passado.";
  if (end) {
    if (!validDay(end)) errors.end_date = "Data inválida.";
    else if (validDay(start) && end < start) errors.end_date = "Precisa ser depois do início.";
    else if (end < today) errors.end_date = "A data de fim não pode ser no passado.";
  }

  if (Object.keys(errors).length || !kind) return { ok: false, errors };
  return {
    ok: true,
    value: { name, kind, value, starts_at: start === today ? nowIso : dayStartIso(start), ends_at: end ? dayEndIso(end) : null },
  };
}

// ── Reajuste agendado ────────────────────────────────────────────────────────

export function validatePriceChange(
  input: { new_price?: unknown; effective_date?: unknown },
  product: Pick<Product, "billing" | "monthly_price" | "one_time_price">,
  today: string,
): { ok: true; value: { new_price: number; effective_date: string } } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const list = basePrice(product);
  if (list === null) return { ok: false, errors: { new_price: "Produto sob consulta não tem preço de tabela." } };
  const cents = parseCurrencyToCents(str(input.new_price));
  if (!cents) errors.new_price = "Informe o novo preço.";
  else if (cents > PRODUCT_LIMITS.maxCents) errors.new_price = "Valor alto demais.";
  else if (cents === Math.round(list * 100)) errors.new_price = "É o mesmo preço de hoje.";
  const date = str(input.effective_date);
  if (!validDay(date)) errors.effective_date = "Informe a partir de quando.";
  else if (date <= today) errors.effective_date = "Escolha uma data a partir de amanhã (para hoje, edite o preço direto).";
  if (Object.keys(errors).length || !cents) return { ok: false, errors };
  return { ok: true, value: { new_price: cents / 100, effective_date: date } };
}
