/**
 * Validação do cadastro de produto e do cancelamento de contrato.
 * Módulo puro: o modal usa para mostrar os erros e as rotas revalidam no servidor.
 */
import { cancelReasons, productBillings, productIcons, stageColors, type ProductBilling } from "./options";
import type { ProductData } from "./types";
import { parseCurrencyToCents, type FieldErrors } from "./validation";

export const PRODUCT_LIMITS = { name: 60, description: 400, features: 12, feature: 80, maxTerm: 60, maxCents: 100_000_000_000 } as const;
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
  const seen = new Set<string>();
  for (const raw of Array.isArray(input.features) ? input.features : []) {
    const f = clean(raw);
    if (!f || seen.has(f.toLowerCase())) continue;
    seen.add(f.toLowerCase());
    features.push(f);
  }
  if (features.length > PRODUCT_LIMITS.features) errors.features = `Use até ${PRODUCT_LIMITS.features} itens.`;
  else if (features.some((f) => f.length > PRODUCT_LIMITS.feature)) errors.features = `Cada item pode ter até ${PRODUCT_LIMITS.feature} caracteres.`;

  if (!stageColors.is(input.color)) errors.color = "Cor inválida.";
  if (!productIcons.is(input.icon)) errors.icon = "Ícone inválido.";

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
