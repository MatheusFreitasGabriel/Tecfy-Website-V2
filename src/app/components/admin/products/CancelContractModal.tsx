"use client";

import { useState } from "react";
import { FaTriangleExclamation } from "react-icons/fa6";
import { cancelReasons } from "@/lib/admin/crm/options";
import { parseCancel } from "@/lib/admin/crm/productValidation";
import type { ContractRow } from "@/lib/admin/crm/types";
import { withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import { Field, Select, TextArea, TextInput } from "../form/Field";
import Modal from "../form/Modal";
import { callApi } from "../deal-detail/dealApi";
import { money, monthLabel } from "./productVisuals";

interface CancelContractModalProps {
  basePath: string;
  contract: ContractRow;
  onClose: () => void;
  onDone: () => void;
}

/** Hoje em Brasília ("AAAA-MM-DD"). */
const todayBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Cancela um contrato: data, motivo e detalhe. Avisa quando ainda está dentro da fidelidade. */
export default function CancelContractModal({ basePath, contract, onClose, onDone }: CancelContractModalProps) {
  const [form, setForm] = useState({ date: todayBr(), reason: "", detail: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => withoutKey(e, key));
  };

  const month = form.date.slice(0, 7);
  const withinTerm = contract.term_end !== null && month < contract.term_end;

  const submit = async () => {
    const check = parseCancel(form);
    if (!check.ok) return setErrors(check.errors);
    setBusy(true);
    setNotice(null);
    try {
      const { ok, status, data } = await callApi(`${basePath}/api/crm/contracts/${contract.id}/cancel`, "POST", form);
      if (ok) return onDone();
      if (data.fields) setErrors(data.fields);
      setNotice(status === 401 ? "Sua sessão expirou. Entre de novo no painel." : status === 404 ? "Este contrato não existe mais." : "Não foi possível cancelar. Confira os campos.");
    } catch {
      setNotice("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Cancelar contrato"
      description={`${contract.company?.name ?? "Cliente"} · ${contract.product_name}`}
      onClose={() => !busy && onClose()}
      widthClass="max-w-[560px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm font-medium text-admin-danger">
            {notice}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Voltar
            </Button>
            <Button variant="danger" onClick={() => void submit()} disabled={busy}>
              {busy ? "Cancelando..." : "Cancelar contrato"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-admin-drawer-card p-4 text-sm">
          <div>
            <p className="text-xs font-medium text-admin-drawer-muted">Valor</p>
            <p className="font-semibold text-text-primary">{contract.billing === "unico" ? money(contract.one_time_value) : `${money(contract.monthly_value)}/mês`}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-admin-drawer-muted">Assinado em</p>
            <p className="font-semibold text-text-primary">{contract.signed_at ? new Date(contract.signed_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-admin-drawer-muted">Fidelidade até</p>
            <p className="font-semibold text-text-primary">{monthLabel(contract.term_end)}</p>
          </div>
        </div>

        <Field label="Data do cancelamento" required error={errors.date} hint="O mês do cancelamento ainda conta como cobrado no faturamento do ano.">
          {(a) => <TextInput {...a} type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />}
        </Field>

        {withinTerm && (
          <p className="flex items-start gap-2 rounded-xl bg-admin-qual-hot/50 p-3.5 text-sm font-medium leading-5 text-admin-qual-hot-text">
            <FaTriangleExclamation aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Ainda dentro da fidelidade (até {monthLabel(contract.term_end)}). O cancelamento fica registrado como antecipado.
          </p>
        )}

        <Field label="Motivo" required error={errors.reason}>
          {(a) => <Select {...a} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Selecione" options={cancelReasons.options} />}
        </Field>
        <Field label={form.reason === "outro" ? "Conte o motivo" : "Detalhes (opcional)"} required={form.reason === "outro"} error={errors.detail}>
          {(a) => <TextArea {...a} maxLength={1000} value={form.detail} onChange={(e) => set("detail", e.target.value)} placeholder="O que aconteceu, quem pediu, se pode voltar..." />}
        </Field>
        <p className="text-xs font-medium leading-[18px] text-admin-text-hint">
          O contrato sai do faturamento mensal e dos contratos ativos. Se a empresa não tiver outro contrato ativo, volta a ser Prospect. Fica registrado na negociação e no histórico do produto.
        </p>
      </div>
    </Modal>
  );
}
