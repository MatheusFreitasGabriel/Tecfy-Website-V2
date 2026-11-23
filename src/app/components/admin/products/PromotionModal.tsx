"use client";

import { useRef, useState } from "react";
import { promotionKinds } from "@/lib/admin/crm/options";
import { validatePromotion, type PromotionForm } from "@/lib/admin/crm/productValidation";
import type { Product } from "@/lib/admin/crm/types";
import { withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import { brazilDayKey, listPriceAt, basePrice, promoPrice } from "@/lib/site/plans";
import { maskCurrencyBRL } from "@/utils/masks";
import Button from "../form/Button";
import { Field, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import { callApi } from "../deal-detail/dealApi";
import { money } from "./productVisuals";

interface PromotionModalProps {
  basePath: string;
  product: Product;
  now: number;
  onClose: () => void;
  onDone: (scheduled: boolean) => void;
}

const PRESETS = [10, 15, 20, 30];

/** Lançar / agendar promoção. Vai direto para o site (sem "Publicar"). */
export default function PromotionModal({ basePath, product, now, onClose, onDone }: PromotionModalProps) {
  const today = brazilDayKey(now);
  const [form, setForm] = useState<PromotionForm>({ name: "", kind: "percent", value: "", start_date: today, end_date: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(crypto.randomUUID());

  const set = <K extends keyof PromotionForm>(key: K, value: PromotionForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => withoutKey(e, key));
  };

  const list = listPriceAt(basePrice(product), product.price_change, Date.parse(`${form.start_date || today}T12:00:00-03:00`)) ?? 0;
  const check = validatePromotion(form, product, today, new Date(now).toISOString());
  const preview = check.ok ? promoPrice(list, check.value) : null;
  const suffix = product.billing === "mensal" ? "/mês" : "";

  const submit = async () => {
    if (!check.ok) return setErrors(check.errors);
    setBusy(true);
    setNotice(null);
    try {
      const { ok, status, data } = await callApi(`${basePath}/api/crm/products/${product.id}/promotions`, "POST", { request_id: requestId.current, promotion: form });
      if (ok) return onDone(form.start_date > today);
      if (data.fields) setErrors(data.fields);
      setNotice(
        status === 409
          ? "Este produto já tem uma promoção ativa ou agendada. Encerre a atual antes de lançar outra."
          : status === 401
            ? "Sua sessão expirou. Entre de novo no painel."
            : "Não foi possível lançar. Confira os campos e tente de novo.",
      );
    } catch {
      setNotice("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Lançar promoção"
      titleSize="md"
      closeStyle="boxed"
      description={`${product.name} · preço de tabela ${money(list)}${suffix}. A promoção aparece no site na hora (ou na data de início) e some sozinha no fim.`}
      onClose={() => !busy && onClose()}
      widthClass="max-w-[620px]"
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
              {busy ? "Lançando..." : form.start_date > today ? "Agendar promoção" : "Lançar agora"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Nome da promoção" required error={errors.name} hint="Aparece no selo do card no site.">
          {(a) => <TextInput {...a} autoFocus maxLength={40} placeholder="Ex.: Black Friday" value={form.name} onChange={(e) => set("name", e.target.value)} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de desconto" error={errors.kind}>
            {(a) => (
              <select {...a} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as PromotionForm["kind"], value: "" }))} className={`${inputClass} h-11 cursor-pointer`}>
                {promotionKinds.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={form.kind === "percent" ? "Desconto (%)" : "Preço promocional"} required error={errors.value}>
            {(a) =>
              form.kind === "percent" ? (
                <TextInput {...a} inputMode="decimal" maxLength={4} placeholder="Ex.: 20" value={form.value} onChange={(e) => set("value", e.target.value.replace(/[^\d,]/g, ""))} />
              ) : (
                <TextInput {...a} inputMode="numeric" placeholder="R$ 0,00" value={form.value} onChange={(e) => set("value", maskCurrencyBRL(e.target.value))} />
              )
            }
          </Field>
        </div>
        {form.kind === "percent" && (
          <div className="-mt-2 flex flex-wrap gap-2">
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set("value", String(v))}
                className={`h-8 rounded-lg px-3 text-xs font-semibold transition-colors ${form.value === String(v) ? "bg-admin-tip text-admin-tip-title" : "bg-admin-badge text-admin-text-description hover:text-text-primary"}`}
              >
                {v}%
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Começa em" required error={errors.start_date} hint={form.start_date === today ? "Hoje: começa assim que lançar." : undefined}>
            {(a) => <input {...a} type="date" min={today} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={`${inputClass} h-11`} />}
          </Field>
          <Field label="Termina em" error={errors.end_date} hint="Vazio = até você encerrar.">
            {(a) => <input {...a} type="date" min={form.start_date || today} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className={`${inputClass} h-11`} />}
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-admin-drawer-card p-4">
          <div>
            <p className="text-xs font-medium text-admin-drawer-muted">No site vai aparecer</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium text-admin-text-hint line-through">
                {money(list)}
                {suffix}
              </span>
              <span className="text-2xl font-semibold text-text-primary">{preview !== null ? `${money(preview)}${suffix}` : "—"}</span>
            </p>
          </div>
          {preview !== null && list > 0 && (
            <span className="rounded-lg bg-admin-qual-hot px-3 py-1.5 text-sm font-semibold text-admin-qual-hot-text">-{Math.round((1 - preview / list) * 100)}%</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
