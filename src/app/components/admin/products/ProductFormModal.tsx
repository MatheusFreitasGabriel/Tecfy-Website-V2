"use client";

import { useRef, useState } from "react";
import { FaArrowDown, FaArrowUp, FaCheck, FaPlus, FaStar, FaXmark } from "react-icons/fa6";
import { productBillings, productIcons, stageColors, type ProductBilling } from "@/lib/admin/crm/options";
import { PRODUCT_LIMITS, emptyProductForm, validateProductForm, type ProductForm } from "@/lib/admin/crm/productValidation";
import type { Product } from "@/lib/admin/crm/types";
import { withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import { maskCurrencyBRL } from "@/utils/masks";
import Button from "../form/Button";
import { Field, TextArea, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import { callApi } from "../deal-detail/dealApi";
import { BillingBadge, PRODUCT_ICONS, ProductIconBox, colorVar, priceParts } from "./productVisuals";

interface ProductFormModalProps {
  basePath: string;
  /** null = novo produto. */
  product: Product | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}

const toMasked = (reais: number | null) => (reais ? maskCurrencyBRL(String(Math.round(reais * 100))) : "");

function formOf(p: Product): ProductForm {
  return {
    name: p.name,
    description: p.description ?? "",
    billing: p.billing,
    monthly_price: toMasked(p.monthly_price),
    one_time_price: toMasked(p.one_time_price),
    setup_fee: toMasked(p.setup_fee),
    min_term_months: p.min_term_months === null ? "8" : String(p.min_term_months),
    features: [...p.features],
    color: p.color,
    icon: p.icon,
    highlight: p.highlight,
    active: p.active,
  };
}

const BILLING_HELP: Record<ProductBilling, string> = {
  mensal: "Mensalidade com valor fixo. Pode ter taxa de implantação.",
  sob_consulta: "Mensalidade negociada em cada venda (ex.: Startup, Equity).",
  unico: "Projeto ou serviço pago uma vez. Não entra no faturamento mensal.",
};

/** Cadastro/edição de produto com prévia ao vivo do card. */
export default function ProductFormModal({ basePath, product, onClose, onSaved }: ProductFormModalProps) {
  const [form, setForm] = useState<ProductForm>(() => (product ? formOf(product) : emptyProductForm()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feature, setFeature] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(crypto.randomUUID());

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => withoutKey(e, key));
  };

  const addFeature = () => {
    const text = feature.trim().slice(0, PRODUCT_LIMITS.feature);
    if (!text || form.features.length >= PRODUCT_LIMITS.features) return;
    if (!form.features.some((f) => f.toLowerCase() === text.toLowerCase())) set("features", [...form.features, text]);
    setFeature("");
  };
  const moveFeature = (index: number, delta: -1 | 1) => {
    const next = [...form.features];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set("features", next);
  };

  const submit = async () => {
    const pending = feature.trim() ? [...form.features, feature.trim()] : form.features;
    const data = { ...form, features: pending };
    const check = validateProductForm(data);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { ok, status, data: res } = product
        ? await callApi<{ changed: boolean }>(`${basePath}/api/crm/products/${product.id}`, "PATCH", { product: data })
        : await callApi<{ id: string }>(`${basePath}/api/crm/products`, "POST", { request_id: requestId.current, product: data });
      if (ok) return onSaved(product ? product.id : (res as { id: string }).id);
      if (res.fields) setErrors(res.fields);
      setNotice(status === 401 ? "Sua sessão expirou. Entre de novo no painel." : status === 404 ? "Este produto não existe mais." : "Não foi possível salvar. Confira os campos e tente de novo.");
    } catch {
      setNotice("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const preview = priceParts({
    billing: form.billing,
    monthly_price: Number(form.monthly_price.replace(/\D/g, "")) / 100 || null,
    one_time_price: Number(form.one_time_price.replace(/\D/g, "")) / 100 || null,
    setup_fee: form.billing === "unico" ? null : Number(form.setup_fee.replace(/\D/g, "")) / 100 || null,
  });
  const color = stageColors.is(form.color) ? form.color : "violet";
  const icon = productIcons.is(form.icon) ? form.icon : "rocket";

  return (
    <Modal
      title={product ? "Editar produto" : "Novo produto"}
      description={product ? "Mudanças de preço valem para as próximas vendas; contratos já fechados mantêm o valor." : "O produto aparece em \"Marcar como vendida\" nas negociações."}
      onClose={() => !busy && onClose()}
      widthClass="max-w-[1080px]"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm font-medium text-admin-danger">
            {notice}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "Salvando..." : product ? "Salvar alterações" : "Criar produto"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <Field label="Nome do produto" required error={errors.name}>
            {(a) => <TextInput {...a} autoFocus maxLength={PRODUCT_LIMITS.name} placeholder="Ex.: Pro" value={form.name} onChange={(e) => set("name", e.target.value)} />}
          </Field>
          <Field label="Descrição" error={errors.description} hint={`${form.description.length}/${PRODUCT_LIMITS.description}`}>
            {(a) => <TextArea {...a} maxLength={PRODUCT_LIMITS.description} placeholder="Para quem é e o que resolve." value={form.description} onChange={(e) => set("description", e.target.value)} />}
          </Field>

          {/* Cobrança */}
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-[13px] font-medium leading-[19px] text-admin-text-label">Como é cobrado *</legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {productBillings.options.map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl p-3.5 outline outline-1 -outline-offset-1 transition-colors ${
                    form.billing === o.value ? "bg-admin-tip outline-admin-accent" : "bg-admin-input outline-admin-input-border hover:bg-admin-card"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <input type="radio" name="billing" checked={form.billing === o.value} onChange={() => set("billing", o.value)} className="accent-admin-primary" />
                    {o.label}
                  </span>
                  <span className="text-xs font-medium leading-4 text-admin-text-description">{BILLING_HELP[o.value]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            {form.billing === "mensal" && (
              <Field label="Valor mensal" required error={errors.monthly_price}>
                {(a) => <TextInput {...a} inputMode="numeric" placeholder="R$ 0,00" value={form.monthly_price} onChange={(e) => set("monthly_price", maskCurrencyBRL(e.target.value))} />}
              </Field>
            )}
            {form.billing === "unico" && (
              <Field label="Valor do pagamento único" required error={errors.one_time_price}>
                {(a) => <TextInput {...a} inputMode="numeric" placeholder="R$ 0,00" value={form.one_time_price} onChange={(e) => set("one_time_price", maskCurrencyBRL(e.target.value))} />}
              </Field>
            )}
            {form.billing !== "unico" && (
              <>
                <Field label="Taxa de implantação" error={errors.setup_fee} hint="Opcional, cobrada uma vez.">
                  {(a) => <TextInput {...a} inputMode="numeric" placeholder="R$ 0,00" value={form.setup_fee} onChange={(e) => set("setup_fee", maskCurrencyBRL(e.target.value))} />}
                </Field>
                <Field label="Fidelidade (meses)" error={errors.min_term_months} hint="0 = sem fidelidade.">
                  {(a) => (
                    <TextInput
                      {...a}
                      inputMode="numeric"
                      maxLength={2}
                      value={form.min_term_months}
                      onChange={(e) => set("min_term_months", e.target.value.replace(/\D/g, ""))}
                    />
                  )}
                </Field>
              </>
            )}
          </div>

          {/* Itens inclusos */}
          <Field label={`Itens inclusos (${form.features.length}/${PRODUCT_LIMITS.features})`} error={errors.features} hint="Enter adiciona. Aparecem no card (os 4 primeiros).">
            {(a) => (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    {...a}
                    type="text"
                    value={feature}
                    maxLength={PRODUCT_LIMITS.feature}
                    disabled={form.features.length >= PRODUCT_LIMITS.features}
                    placeholder="Ex.: Suporte técnico em horário comercial"
                    onChange={(e) => setFeature(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addFeature();
                      }
                    }}
                    className={`${inputClass} h-11`}
                  />
                  <Button variant="secondary" icon={FaPlus} onClick={addFeature} disabled={!feature.trim()} aria-label="Adicionar item" className="!px-4" />
                </div>
                {form.features.length > 0 && (
                  <ul className="flex flex-col divide-y divide-admin-divider rounded-lg bg-admin-input outline outline-1 -outline-offset-1 outline-admin-input-border">
                    {form.features.map((f, i) => (
                      <li key={f} className="flex items-center gap-2 px-3 py-2">
                        <FaCheck aria-hidden className="h-3 w-3 shrink-0 text-admin-success" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-admin-text-input">{f}</span>
                        <button type="button" aria-label={`Subir "${f}"`} disabled={i === 0} onClick={() => moveFeature(i, -1)} className="rounded p-1 text-admin-text-hint hover:bg-admin-badge hover:text-text-primary disabled:opacity-30">
                          <FaArrowUp aria-hidden className="h-3 w-3" />
                        </button>
                        <button type="button" aria-label={`Descer "${f}"`} disabled={i === form.features.length - 1} onClick={() => moveFeature(i, 1)} className="rounded p-1 text-admin-text-hint hover:bg-admin-badge hover:text-text-primary disabled:opacity-30">
                          <FaArrowDown aria-hidden className="h-3 w-3" />
                        </button>
                        <button type="button" aria-label={`Remover "${f}"`} onClick={() => set("features", form.features.filter((_, j) => j !== i))} className="rounded p-1 text-admin-text-hint hover:bg-admin-badge hover:text-admin-danger">
                          <FaXmark aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Field>

          {/* Aparência */}
          <div className="grid gap-6 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium leading-[19px] text-admin-text-label">Cor</legend>
              <div className="flex flex-wrap gap-2">
                {stageColors.options.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={c.label}
                    aria-pressed={form.color === c.value}
                    onClick={() => set("color", c.value)}
                    style={colorVar(c.value)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full bg-(--pc) transition-transform hover:scale-110 ${form.color === c.value ? "ring-2 ring-text-primary ring-offset-2 ring-offset-background-kpi" : ""}`}
                  >
                    {form.color === c.value && <FaCheck aria-hidden className="h-3.5 w-3.5 text-black" />}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium leading-[19px] text-admin-text-label">Ícone</legend>
              <div className="grid grid-cols-6 gap-1.5">
                {productIcons.options.map((o) => {
                  const Icon = PRODUCT_ICONS[o.value];
                  const selected = form.icon === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-label={o.label}
                      title={o.label}
                      aria-pressed={selected}
                      onClick={() => set("icon", o.value)}
                      style={colorVar(color)}
                      className={`flex h-9 items-center justify-center rounded-lg transition-colors ${selected ? "bg-(--pc)/20 text-(--pc) outline outline-1 outline-(--pc)" : "bg-admin-input text-admin-text-hint hover:text-text-primary"}`}
                    >
                      <Icon aria-hidden className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-admin-text-label">
              <input type="checkbox" checked={form.highlight} onChange={(e) => set("highlight", e.target.checked)} className="h-4 w-4 accent-admin-primary [color-scheme:dark]" />
              Produto em destaque
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-admin-text-label">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-admin-primary [color-scheme:dark]" />
              Ativo (aparece em &quot;Marcar como vendida&quot;)
            </label>
          </div>
        </div>

        {/* Prévia */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-text-hint">Prévia do card</p>
          <div style={colorVar(color)} className={`flex flex-col overflow-hidden rounded-2xl bg-admin-table outline outline-1 -outline-offset-1 ${form.highlight ? "outline-(--pc)/45" : "outline-admin-card-border"} ${form.active ? "" : "opacity-60"}`}>
            <span aria-hidden className="h-1 w-full bg-(--pc)" />
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <ProductIconBox icon={icon} color={color} />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-text-primary">{form.name || "Nome do produto"}</p>
                  <div className="mt-1 flex gap-1.5">
                    <BillingBadge billing={form.billing} />
                    {form.highlight && (
                      <span className="inline-flex h-6 items-center gap-1 rounded-md bg-(--pc)/15 px-2 text-[11px] font-semibold uppercase text-(--pc)">
                        <FaStar aria-hidden className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <p className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-2xl font-semibold text-text-primary">{preview.main}</span>
                  {preview.suffix && <span className="text-xs font-medium text-admin-text-description">{preview.suffix}</span>}
                </p>
                {preview.extra && <p className="text-xs font-medium text-admin-text-hint">{preview.extra}</p>}
              </div>
              {form.description && <p className="line-clamp-3 text-[13px] font-medium leading-5 text-admin-text-description">{form.description}</p>}
              {form.features.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {form.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs font-medium text-admin-text-label">
                      <FaCheck aria-hidden className="mt-0.5 h-2.5 w-2.5 shrink-0 text-(--pc)" />
                      <span className="line-clamp-1">{f}</span>
                    </li>
                  ))}
                  {form.features.length > 4 && <li className="pl-4 text-[11px] text-admin-text-hint">+{form.features.length - 4} itens</li>}
                </ul>
              )}
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
