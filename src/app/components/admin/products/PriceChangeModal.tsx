"use client";

import { useState } from "react";
import { validatePriceChange } from "@/lib/admin/crm/productValidation";
import type { Product } from "@/lib/admin/crm/types";
import { withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import { basePrice, brazilDayKey } from "@/lib/site/plans";
import { maskCurrencyBRL } from "@/utils/masks";
import Button from "../form/Button";
import { Field, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import { callApi } from "../deal-detail/dealApi";
import { money } from "./productVisuals";

interface PriceChangeModalProps {
  basePath: string;
  product: Product;
  now: number;
  onClose: () => void;
  onDone: () => void;
}

/** Agenda um reajuste de preço para uma data. Vale no site e em "Marcar como vendida" a partir do dia. */
export default function PriceChangeModal({ basePath, product, now, onClose, onDone }: PriceChangeModalProps) {
  const today = brazilDayKey(now);
  const tomorrow = brazilDayKey(now + 86_400_000);
  const current = basePrice(product) ?? 0;
  const [form, setForm] = useState({
    new_price: product.price_change ? maskCurrencyBRL(String(Math.round(product.price_change.new_price * 100))) : "",
    effective_date: product.price_change?.effective_date ?? tomorrow,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => withoutKey(e, key));
  };
  const next = Number(form.new_price.replace(/\D/g, "")) / 100;
  const change = current && next ? next / current - 1 : null;
  const suffix = product.billing === "mensal" ? "/mês" : "";

  const submit = async () => {
    const check = validatePriceChange(form, product, today);
    if (!check.ok) return setErrors(check.errors);
    setBusy(true);
    setNotice(null);
    try {
      const { ok, status, data } = await callApi(`${basePath}/api/crm/products/${product.id}`, "PATCH", { price_change: form });
      if (ok) return onDone();
      if (data.fields) setErrors(data.fields);
      setNotice(status === 401 ? "Sua sessão expirou. Entre de novo no painel." : "Não foi possível agendar. Tente de novo.");
    } catch {
      setNotice("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={product.price_change ? "Alterar reajuste agendado" : "Agendar reajuste de preço"}
      titleSize="md"
      closeStyle="boxed"
      description={`${product.name} · hoje ${money(current)}${suffix}. No dia escolhido o novo preço passa a valer no site e nas novas vendas. Contratos já fechados não mudam.`}
      onClose={() => !busy && onClose()}
      widthClass="max-w-[560px]"
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
              {busy ? "Salvando..." : "Agendar reajuste"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Novo preço${suffix}`} required error={errors.new_price}>
            {(a) => <TextInput {...a} autoFocus inputMode="numeric" placeholder="R$ 0,00" value={form.new_price} onChange={(e) => set("new_price", maskCurrencyBRL(e.target.value))} />}
          </Field>
          <Field label="A partir de" required error={errors.effective_date}>
            {(a) => <input {...a} type="date" min={tomorrow} value={form.effective_date} onChange={(e) => set("effective_date", e.target.value)} className={`${inputClass} h-11`} />}
          </Field>
        </div>
        {change !== null && Number.isFinite(change) && change !== 0 && (
          <p className="rounded-xl bg-admin-drawer-card p-4 text-sm font-medium text-admin-text-label">
            {money(current)} → <strong className="text-text-primary">{money(next)}</strong>
            {suffix} ({change > 0 ? "+" : ""}
            {(change * 100).toFixed(1).replace(".", ",")}%)
          </p>
        )}
      </div>
    </Modal>
  );
}
