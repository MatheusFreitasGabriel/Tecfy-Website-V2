"use client";

import { useRef, useState } from "react";
import { FaArrowDown, FaArrowUp, FaGlobe, FaPlus, FaXmark } from "react-icons/fa6";
import PlanCard from "@/app/components/public/home/plans/PlanCard";
import { useClock } from "@/app/components/public/home/plans/useClock";
import { productBillings, productIcons, siteSections, stageColors, type ProductBilling, type ProductIcon } from "@/lib/admin/crm/options";
import { DEFAULT_PRICE_LABEL, defaultCta, toSitePlan } from "@/lib/site/plans";
import { PRODUCT_LIMITS, emptyProductForm, validateProductForm, type ProductForm } from "@/lib/admin/crm/productValidation";
import type { Product } from "@/lib/admin/crm/types";
import { withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import { maskCurrencyBRL } from "@/utils/masks";
import Button from "../form/Button";
import { Field, TextArea, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import { callApi } from "../deal-detail/dealApi";
import { PRODUCT_ICONS, colorVar } from "./productVisuals";

interface ProductFormModalProps {
  basePath: string;
  /** null = novo produto. */
  product: Product | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  /** Horário da renderização no servidor (ms), para a prévia. */
  renderedAt: number;
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
    feature_icons: [...p.feature_icons],
    site_visible: p.site_visible,
    site_section: p.site_section,
    site_price_label: p.site_price_label ?? "",
    site_cta: p.site_cta ?? "",
    monthly_goal: toMasked(p.monthly_goal),
  };
}

const cents = (masked: string) => Number(masked.replace(/\D/g, "")) / 100 || null;

/** Escolha do ícone de um item incluso (popover com a grade de ícones). */
function FeatureIconPicker({ value, onChange, label }: { value: ProductIcon; onChange: (icon: ProductIcon) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const Icon = PRODUCT_ICONS[value];
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Ícone de "${label}"`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md bg-admin-card text-text-primary outline outline-1 -outline-offset-1 outline-admin-input-border hover:outline-admin-accent"
      >
        <Icon aria-hidden className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="listbox" aria-label="Ícones" className="absolute left-0 top-9 z-20 grid w-[232px] grid-cols-6 gap-1 rounded-xl bg-admin-card p-2 shadow-2xl outline outline-1 -outline-offset-1 outline-admin-card-border">
          {productIcons.options.map((o) => {
            const Option = PRODUCT_ICONS[o.value];
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={value === o.value}
                title={o.label}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex h-8 items-center justify-center rounded-md transition-colors ${value === o.value ? "bg-admin-tip text-admin-tip-title" : "text-admin-text-hint hover:bg-admin-badge hover:text-text-primary"}`}
              >
                <Option aria-hidden className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const BILLING_HELP: Record<ProductBilling, string> = {
  mensal: "Mensalidade com valor fixo. Pode ter taxa de implantação.",
  sob_consulta: "Mensalidade negociada em cada venda (ex.: Startup, Equity).",
  unico: "Projeto ou serviço pago uma vez. Não entra no faturamento mensal.",
};

/** Cadastro/edição de produto com prévia ao vivo do card. */
export default function ProductFormModal({ basePath, product, onClose, onSaved, renderedAt }: ProductFormModalProps) {
  const now = useClock(renderedAt);
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
    if (!form.features.some((f) => f.toLowerCase() === text.toLowerCase())) {
      setForm((f) => ({ ...f, features: [...f.features, text], feature_icons: [...f.features.map((_, i) => f.feature_icons[i] ?? "check"), "check"] }));
      setErrors((e) => withoutKey(e, "features"));
    }
    setFeature("");
  };
  const moveFeature = (index: number, delta: -1 | 1) => {
    const next = [...form.features];
    const icons = form.features.map((_, i) => form.feature_icons[i] ?? "check");
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    [icons[index], icons[target]] = [icons[target], icons[index]];
    setForm((f) => ({ ...f, features: next, feature_icons: icons }));
  };
  const removeFeature = (index: number) =>
    setForm((f) => ({ ...f, features: f.features.filter((_, j) => j !== index), feature_icons: f.features.map((_, i) => f.feature_icons[i] ?? "check").filter((_, j) => j !== index) }));
  const setFeatureIcon = (index: number, icon: ProductIcon) =>
    setForm((f) => ({ ...f, feature_icons: f.features.map((_, i) => (i === index ? icon : (f.feature_icons[i] ?? "check"))) }));

  const submit = async () => {
    const pending = feature.trim() ? [...form.features, feature.trim()] : form.features;
    const data = { ...form, features: pending, feature_icons: pending.map((_, i) => form.feature_icons[i] ?? "check") };
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

  const color = stageColors.is(form.color) ? form.color : "violet";
  const previewPlan = toSitePlan({
    id: product?.id ?? "novo",
    name: form.name.trim() || "Nome do produto",
    description: form.description.trim() || null,
    billing: form.billing,
    monthly_price: form.billing === "mensal" ? cents(form.monthly_price) : null,
    one_time_price: form.billing === "unico" ? cents(form.one_time_price) : null,
    setup_fee: form.billing === "unico" ? null : cents(form.setup_fee),
    features: form.features,
    feature_icons: form.features.map((_, i) => (productIcons.is(form.feature_icons[i]) ? (form.feature_icons[i] as ProductIcon) : "check")),
    highlight: form.highlight,
    active: form.active,
    sort: 0,
    site_visible: form.site_visible,
    site_section: form.site_section,
    site_price_label: form.site_price_label.trim() || null,
    site_cta: form.site_cta.trim() || null,
    promo: product?.promo ?? null,
    price_change: product?.price_change ?? null,
  });

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
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
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
          <Field label={`Itens inclusos (${form.features.length}/${PRODUCT_LIMITS.features})`} error={errors.features} hint="Enter adiciona. Clique no ícone à esquerda para trocar o ícone que aparece no site.">
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
                        <FeatureIconPicker label={f} value={productIcons.is(form.feature_icons[i]) ? (form.feature_icons[i] as ProductIcon) : "check"} onChange={(icon) => setFeatureIcon(i, icon)} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-admin-text-input">{f}</span>
                        <button type="button" aria-label={`Subir "${f}"`} disabled={i === 0} onClick={() => moveFeature(i, -1)} className="rounded p-1 text-admin-text-hint hover:bg-admin-badge hover:text-text-primary disabled:opacity-30">
                          <FaArrowUp aria-hidden className="h-3 w-3" />
                        </button>
                        <button type="button" aria-label={`Descer "${f}"`} disabled={i === form.features.length - 1} onClick={() => moveFeature(i, 1)} className="rounded p-1 text-admin-text-hint hover:bg-admin-badge hover:text-text-primary disabled:opacity-30">
                          <FaArrowDown aria-hidden className="h-3 w-3" />
                        </button>
                        <button type="button" aria-label={`Remover "${f}"`} onClick={() => removeFeature(i)} className="rounded p-1 text-admin-text-hint hover:bg-admin-badge hover:text-admin-danger">
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
          <div>
            <fieldset>
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/55">Ícone (só no painel)</legend>
              <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
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
                      className={`flex h-9 items-center justify-center rounded-lg transition-colors ${selected ? "bg-white text-background" : "bg-admin-input text-admin-text-hint hover:text-text-primary"}`}
                    >
                      <Icon aria-hidden className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {/* Site */}
          <fieldset className="flex flex-col gap-4 rounded-xl bg-admin-drawer-card p-4">
            <legend className="sr-only">No site</legend>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={form.site_visible} onChange={(e) => set("site_visible", e.target.checked)} className="mt-0.5 h-4 w-4 accent-admin-primary [color-scheme:dark]" />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <FaGlobe aria-hidden className="h-3.5 w-3.5 text-admin-accent" /> Mostrar na seção de planos do site
                </span>
                <span className="text-xs font-medium text-admin-text-description">Só vai pro ar quando você clicar em &quot;Publicar no site&quot; na tela Produtos.</span>
              </span>
            </label>
            {form.site_visible && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Aba no site">
                  {(a) => (
                    <select {...a} value={form.site_section} onChange={(e) => set("site_section", e.target.value as ProductForm["site_section"])} className={`${inputClass} h-11 cursor-pointer`}>
                      {siteSections.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Texto do botão" error={errors.site_cta}>
                  {(a) => <TextInput {...a} maxLength={PRODUCT_LIMITS.cta} placeholder={defaultCta(form.name.trim() || "Plano")} value={form.site_cta} onChange={(e) => set("site_cta", e.target.value)} />}
                </Field>
                {form.billing === "sob_consulta" && (
                  <Field label="Texto no lugar do preço" error={errors.site_price_label}>
                    {(a) => <TextInput {...a} maxLength={PRODUCT_LIMITS.priceLabel} placeholder={DEFAULT_PRICE_LABEL} value={form.site_price_label} onChange={(e) => set("site_price_label", e.target.value)} />}
                  </Field>
                )}
              </div>
            )}
          </fieldset>

          {form.billing !== "unico" && (
            <Field label="Meta de faturamento mensal" error={errors.monthly_goal} hint="Opcional. Mostra uma barra de progresso no card e na página do produto." className="sm:max-w-[280px]">
              {(a) => <TextInput {...a} inputMode="numeric" placeholder="R$ 0,00" value={form.monthly_goal} onChange={(e) => set("monthly_goal", maskCurrencyBRL(e.target.value))} />}
            </Field>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-admin-text-label">
              <input type="checkbox" checked={form.highlight} onChange={(e) => set("highlight", e.target.checked)} className="h-4 w-4 accent-admin-primary [color-scheme:dark]" />
              Em destaque (card com degradê no site)
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-admin-text-label">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-admin-primary [color-scheme:dark]" />
              Ativo (aparece em &quot;Marcar como vendida&quot;)
            </label>
          </div>
        </div>

        {/* Prévia: o card exatamente como no site */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
          <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-admin-text-hint">
            Prévia no site
            {!form.site_visible && <span className="normal-case tracking-normal text-admin-text-hint">(fora do site)</span>}
          </p>
          <div style={colorVar(color)} className={`rounded-2xl bg-background p-3 outline outline-1 -outline-offset-1 outline-admin-card-border ${form.site_visible && form.active ? "" : "opacity-60"}`}>
            <PlanCard plan={previewPlan} now={now} preview />
          </div>
          <p className="text-xs font-medium leading-4 text-admin-text-hint">O ícone do produto aparece só no painel. No site valem o destaque, os textos e os ícones dos itens.</p>
        </aside>
      </div>
    </Modal>
  );
}
