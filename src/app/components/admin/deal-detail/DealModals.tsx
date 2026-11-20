"use client";

import { useEffect, useState } from "react";
import { FaBuilding, FaTriangleExclamation } from "react-icons/fa6";
import { lostReasons } from "@/lib/admin/crm/options";
import type { AdminUserOption, Board, DealDetail, Pipeline, PickerOption, ProductOption } from "@/lib/admin/crm/types";
import { validateCustomValues } from "@/lib/admin/crm/dealValidation";
import { withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import { maskCurrencyBRL } from "@/utils/masks";
import Button from "../form/Button";
import Combobox from "../form/Combobox";
import { Field, Select, TextArea, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import { useCrmOptions } from "../leads/crmOptionsStore";
import CustomFieldsInputs from "../deals/CustomFieldsInputs";
import { brazilDate, formatMoney } from "../deals/dealVisuals";
import { callApi } from "./dealApi";

type SaveResult = boolean | Record<string, string>;

function Footer({ busy, onClose, submit, label, tone }: { busy: boolean; onClose: () => void; submit: () => void; label: string; tone?: "danger" }) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        Cancelar
      </Button>
      <Button variant={tone === "danger" ? "danger" : "primary"} onClick={submit} disabled={busy}>
        {busy ? "Salvando..." : label}
      </Button>
    </div>
  );
}

const centsToMasked = (cents: number | null) => (cents === null ? "" : maskCurrencyBRL(String(cents)));

// ── Editar ──

export function EditDealModal({ deal, pipeline, admins, busy, onClose, onSave }: { deal: DealDetail; pipeline: Pipeline; admins: AdminUserOption[]; busy: boolean; onClose: () => void; onSave: (changes: Record<string, unknown>) => Promise<SaveResult> }) {
  const closed = deal.status === "vendida" || deal.status === "perdida";
  const initial = {
    title: deal.title,
    value: centsToMasked(deal.value_cents),
    expected_close_date: deal.expected_close_date ?? "",
    owner_uid: deal.owner_uid ?? "",
    status: deal.status,
    context: deal.context ?? "",
  };
  const [form, setForm] = useState(initial);
  const [custom, setCustom] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const f of pipeline.custom_fields) {
      const v = deal.custom[f.id];
      out[f.id] = f.type === "currency" && typeof v === "number" ? maskCurrencyBRL(String(v)) : (v ?? "");
    }
    return out;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => withoutKey(e, key));
  };

  const submit = async () => {
    const changes: Record<string, unknown> = {};
    for (const key of ["title", "value", "expected_close_date", "owner_uid", "context"] as const) if (form[key] !== initial[key]) changes[key] = form[key];
    if (!closed && form.status !== initial.status) changes.status = form.status;
    if (pipeline.custom_fields.length) {
      const check = validateCustomValues(pipeline.custom_fields, custom);
      if (!check.ok) return setErrors(check.errors);
      if (JSON.stringify(check.value) !== JSON.stringify(Object.fromEntries(pipeline.custom_fields.map((f) => [f.id, deal.custom[f.id] ?? null])))) changes.custom = custom;
    }
    if (!form.title.trim()) return setErrors({ title: "Dê um nome à negociação." });
    if (!Object.keys(changes).length) return onClose();
    const result = await onSave(changes);
    if (typeof result === "object") setErrors(result);
  };

  return (
    <Modal title="Editar negociação" description="Cada alteração fica registrada no histórico (antes → depois)." onClose={() => !busy && onClose()} widthClass="max-w-[760px]" footer={<Footer busy={busy} onClose={onClose} submit={submit} label="Salvar alterações" />}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Nome da negociação" required error={errors.title}>
          {(p) => <TextInput {...p} maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} />}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Valor" error={errors.value}>
            {(p) => <TextInput {...p} inputMode="numeric" placeholder="R$ 0,00" value={form.value} onChange={(e) => set("value", maskCurrencyBRL(e.target.value))} />}
          </Field>
          <Field label="Fechamento previsto" error={errors.expected_close_date}>
            {(p) => <input {...p} type="date" value={form.expected_close_date} onChange={(e) => set("expected_close_date", e.target.value)} className={`${inputClass} h-11`} />}
          </Field>
          <Field label="Responsável" error={errors.owner_uid}>
            {(p) => <Select {...p} options={admins.map((a) => ({ value: a.uid, label: a.name }))} value={form.owner_uid} onChange={(e) => set("owner_uid", e.target.value)} />}
          </Field>
        </div>
        {!closed && (
          <Field label="Status" hint="Vendida e perdida têm botões próprios no topo da página.">
            {(p) => (
              <Select
                {...p}
                options={[
                  { value: "em_andamento", label: "Em andamento" },
                  { value: "pausada", label: "Pausada" },
                ]}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Contexto da negociação" error={errors.context}>
          {(p) => <TextArea {...p} maxLength={4000} heightClass="h-[120px]" value={form.context} onChange={(e) => set("context", e.target.value)} />}
        </Field>
        {pipeline.custom_fields.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text-primary">Campos do funil “{pipeline.name}”</h3>
            <CustomFieldsInputs
              fields={pipeline.custom_fields}
              values={custom}
              errors={errors}
              onChange={(id, value) => {
                setCustom((c) => ({ ...c, [id]: value }));
                if (errors[`custom_${id}`]) setErrors((e) => withoutKey(e, `custom_${id}`));
              }}
            />
          </section>
        )}
      </form>
    </Modal>
  );
}

// ── Venda ──

export function WonModal({ basePath, deal, busy, onClose, onConfirm, onLinkCompany }: { basePath: string; deal: DealDetail; busy: boolean; onClose: () => void; onConfirm: (body: Record<string, unknown>) => Promise<SaveResult>; onLinkCompany: () => void }) {
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [today] = useState(() => brazilDate(Date.now()));
  const [form, setForm] = useState({ product_id: "", product_name: "", monthly_value: centsToMasked(deal.value_cents), signed_date: today });
  const OTHER = "__outro__";
  // Sem produtos cadastrados (ou nenhum serve): descreve o que foi vendido.
  const custom = form.product_id === OTHER || (products !== null && products.length === 0);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let alive = true;
    callApi<{ products: ProductOption[] }>(`${basePath}/api/crm/products`, "GET")
      .then(({ ok, data }) => {
        if (!alive) return;
        if (ok) setProducts(data.products);
        else {
          setProducts([]);
          setLoadError(true);
        }
      })
      .catch(() => {
        if (!alive) return;
        setProducts([]);
        setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [basePath]);

  const chooseProduct = (id: string) => {
    const product = products?.find((p) => p.id === id);
    setForm((f) => ({ ...f, product_id: id, monthly_value: product?.monthly_price ? maskCurrencyBRL(String(Math.round(product.monthly_price * 100))) : f.monthly_value }));
    setErrors((e) => withoutKey(withoutKey(e, "product_id"), "monthly_value"));
  };

  const submit = async () => {
    const next: FieldErrors = {};
    if (custom && !form.product_name.trim()) next.product_name = "Descreva o que foi vendido.";
    if (!custom && !form.product_id) next.product_id = "Escolha o produto.";
    if (!form.monthly_value) next.monthly_value = "Informe o valor mensal fechado.";
    if (Object.keys(next).length) return setErrors(next);
    const body = custom
      ? { product_name: form.product_name.trim(), monthly_value: form.monthly_value, signed_date: form.signed_date }
      : { product_id: form.product_id, monthly_value: form.monthly_value, signed_date: form.signed_date };
    const result = await onConfirm(body);
    if (typeof result === "object") setErrors(result);
  };

  const noCompany = !deal.company_info;
  return (
    <Modal
      title="Registrar venda 🎉"
      description="Cria o contrato: a empresa passa a Cliente e o valor mensal entra no faturamento do dashboard."
      onClose={() => !busy && onClose()}
      widthClass="max-w-[600px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        noCompany ? (
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button icon={FaBuilding} onClick={onLinkCompany}>
              Vincular empresa
            </Button>
          </div>
        ) : (
          <Footer busy={busy || products === null} onClose={onClose} submit={submit} label="Registrar venda" />
        )
      }
    >
      {noCompany ? (
        <p className="flex items-start gap-3 rounded-xl bg-admin-qual-hot px-4 py-3 text-sm font-medium text-admin-qual-hot-text">
          <FaTriangleExclamation aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          O contrato pertence a uma empresa. Vincule a empresa do cliente a esta negociação para registrar a venda.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {products !== null && products.length > 0 && (
            <Field label="Produto contratado" required error={errors.product_id}>
              {(p) => (
                <Select
                  {...p}
                  placeholder="Selecione o produto"
                  options={[
                    ...products.map((x) => ({ value: x.id, label: `${x.name} · ${x.monthly_price ? `${formatMoney(Math.round(x.monthly_price * 100))}/mês` : (x.price_label ?? "sob consulta")}` })),
                    { value: OTHER, label: "Outro (descrever o que foi vendido)" },
                  ]}
                  value={form.product_id}
                  onChange={(e) => (e.target.value === OTHER ? setForm((f) => ({ ...f, product_id: OTHER })) : chooseProduct(e.target.value))}
                />
              )}
            </Field>
          )}
          {products === null && <p className="text-sm text-admin-text-hint">Carregando produtos...</p>}
          {custom && (
            <Field
              label="O que foi vendido"
              required
              error={errors.product_name ?? errors.product_id}
              hint={products !== null && products.length === 0 ? (loadError ? "Não deu para carregar os produtos; descreva a venda." : "Ainda não há produtos cadastrados; descreva a venda.") : undefined}
            >
              {(p) => (
                <TextInput {...p} autoFocus maxLength={80} placeholder="Ex.: Sistema de gestão sob medida" value={form.product_name} onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))} />
              )}
            </Field>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Valor mensal fechado" required error={errors.monthly_value} hint="Fica gravado no contrato (mudanças de preço depois não afetam).">
              {(p) => <TextInput {...p} inputMode="numeric" placeholder="R$ 0,00" value={form.monthly_value} onChange={(e) => setForm((f) => ({ ...f, monthly_value: maskCurrencyBRL(e.target.value) }))} />}
            </Field>
            <Field label="Data da venda" required error={errors.signed_date}>
              {(p) => <input {...p} type="date" max={today} value={form.signed_date} onChange={(e) => setForm((f) => ({ ...f, signed_date: e.target.value }))} className={`${inputClass} h-11`} />}
            </Field>
          </div>
          <p className="text-xs text-admin-text-hint">Contrato com permanência mínima de 8 meses; continua ativo mês a mês até ser cancelado.</p>
        </div>
      )}
    </Modal>
  );
}

// ── Perda ──

export function LostModal({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: (body: Record<string, unknown>) => Promise<SaveResult> }) {
  const [form, setForm] = useState({ reason: "", detail: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const submit = async () => {
    if (!form.reason) return setErrors({ reason: "Escolha o motivo." });
    const result = await onConfirm(form);
    if (typeof result === "object") setErrors(result);
  };
  return (
    <Modal title="Marcar como perdida" description="O motivo fica registrado e ajuda a entender onde as vendas escapam." onClose={() => !busy && onClose()} widthClass="max-w-[560px]" closeStyle="boxed" titleSize="md" footer={<Footer busy={busy} onClose={onClose} submit={submit} label="Marcar como perdida" tone="danger" />}>
      <div className="flex flex-col gap-5">
        <Field label="Motivo" required error={errors.reason}>
          {(p) => <Select {...p} placeholder="Selecione o motivo" options={lostReasons.options} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />}
        </Field>
        <Field label="Detalhes" required={form.reason === "outro"} error={errors.detail}>
          {(p) => <TextArea {...p} maxLength={1000} value={form.detail} placeholder="O que aconteceu? (ex.: escolheu o concorrente X pelo preço)" onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} />}
        </Field>
      </div>
    </Modal>
  );
}

// ── Vincular contato/empresa ──

export function LinkModal({ basePath, target, busy, onClose, onLink }: { basePath: string; target: "contact" | "company"; busy: boolean; onClose: () => void; onLink: (id: string) => void }) {
  const options = useCrmOptions(basePath, target === "contact" ? "contacts" : "companies");
  const [chosen, setChosen] = useState<PickerOption | null>(null);
  const noun = target === "contact" ? "contato" : "empresa";
  return (
    <Modal
      title={`Vincular ${noun}`}
      description={`Busque ${target === "contact" ? "um contato cadastrado" : "uma empresa cadastrada"}. Para cadastrar ${target === "contact" ? "um novo" : "uma nova"}, use a tela ${target === "contact" ? "Contatos" : "Empresas"}.`}
      onClose={() => !busy && onClose()}
      widthClass="max-w-[560px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => chosen && onLink(chosen.id)} disabled={busy || !chosen}>
            {busy ? "Vinculando..." : `Vincular ${noun}`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Combobox options={options.options ?? []} placeholder={options.options ? `Buscar ${noun}` : "Carregando cadastros..."} ariaLabel={`Buscar ${noun}`} onSelect={setChosen} emptyText={options.error ? "Não foi possível carregar." : "Nada encontrado."} />
        {chosen && (
          <p className="rounded-lg bg-admin-tip px-3.5 py-2.5 text-sm font-semibold text-admin-tip-title">
            {chosen.label}
            {chosen.hint && <span className="ml-2 text-xs font-medium text-admin-tip-text">{chosen.hint}</span>}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ── Pausar ──

export function PauseModal({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: (body: { reason: string; resume_date: string }) => Promise<SaveResult> }) {
  const [today] = useState(() => brazilDate(Date.now()));
  const [form, setForm] = useState({ reason: "", resume_date: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const submit = async () => {
    if (form.resume_date && form.resume_date < today) return setErrors({ resume_date: "Escolha hoje ou uma data futura." });
    const result = await onConfirm(form);
    if (typeof result === "object") setErrors(result);
  };
  return (
    <Modal
      title="Pausar negociação"
      description="A negociação continua no funil, marcada como pausada. Retome quando quiser."
      onClose={() => !busy && onClose()}
      widthClass="max-w-[560px]"
      closeStyle="boxed"
      titleSize="md"
      footer={<Footer busy={busy} onClose={onClose} submit={submit} label="Pausar" />}
    >
      <div className="flex flex-col gap-5">
        <Field label="Motivo" error={errors.reason} hint="Opcional. Ex.: cliente pediu para retomar depois das férias.">
          {(p) => <TextArea {...p} autoFocus maxLength={500} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />}
        </Field>
        <Field label="Retomar em" error={errors.resume_date} hint="Opcional. Cria a tarefa “Retomar negociação” às 09:00 desse dia para o responsável.">
          {(p) => <input {...p} type="date" min={today} value={form.resume_date} onChange={(e) => setForm((f) => ({ ...f, resume_date: e.target.value }))} className={`${inputClass} h-11`} />}
        </Field>
      </div>
    </Modal>
  );
}

// ── Mover para outro funil ──

export function MovePipelineModal({
  boards,
  pipelines,
  currentPipelineId,
  currentStageId,
  busy,
  onClose,
  onConfirm,
}: {
  boards: Board[];
  /** Funis ativos. */
  pipelines: Pipeline[];
  currentPipelineId: string;
  currentStageId: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (pipelineId: string, stageId: string) => void;
}) {
  const usable = boards.filter((b) => !b.archived && pipelines.some((p) => p.board_id === b.id));
  const firstOther = pipelines.find((p) => p.id !== currentPipelineId) ?? pipelines[0];
  const [pipelineId, setPipelineId] = useState(firstOther?.id ?? "");
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? null;
  const [stageId, setStageId] = useState(pipeline?.stages[0]?.id ?? "");
  const boardId = pipeline?.board_id ?? usable[0]?.id ?? "";
  const same = pipelineId === currentPipelineId && stageId === currentStageId;

  const choosePipeline = (id: string) => {
    setPipelineId(id);
    setStageId(pipelines.find((p) => p.id === id)?.stages[0]?.id ?? "");
  };

  return (
    <Modal
      title="Mover para outro funil"
      description="A mesma negociação muda de funil, com histórico, tarefas, arquivos e valores. A mudança fica registrada."
      onClose={() => !busy && onClose()}
      widthClass="max-w-[640px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(pipelineId, stageId)} disabled={busy || !pipeline || !stageId || same}>
            {busy ? "Movendo..." : "Mover negociação"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Quadro">
            {(p) => (
              <Select
                {...p}
                options={usable.map((b) => ({ value: b.id, label: b.name }))}
                value={boardId}
                onChange={(e) => {
                  const first = pipelines.find((x) => x.board_id === e.target.value);
                  if (first) choosePipeline(first.id);
                }}
              />
            )}
          </Field>
          <Field label="Funil">
            {(p) => (
              <Select
                {...p}
                options={pipelines.filter((x) => x.board_id === boardId).map((x) => ({ value: x.id, label: x.id === currentPipelineId ? `${x.name} (atual)` : x.name }))}
                value={pipelineId}
                onChange={(e) => choosePipeline(e.target.value)}
              />
            )}
          </Field>
        </div>
        {pipeline && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-admin-text-label">Entra na etapa</span>
            <div role="radiogroup" aria-label="Etapa de entrada" className="flex flex-wrap gap-2">
              {pipeline.stages.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={stageId === s.id}
                  onClick={() => setStageId(s.id)}
                  className="h-9 rounded-lg px-3 text-[13px] font-semibold text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-card-border transition-colors hover:bg-admin-card aria-checked:bg-admin-primary aria-checked:text-text-primary aria-checked:outline-admin-primary"
                >
                  <span className="opacity-60">{i + 1}.</span> {s.name}
                </button>
              ))}
            </div>
            {same && <p className="text-xs text-admin-text-hint">A negociação já está nesta etapa.</p>}
            {pipeline.custom_fields.length > 0 && (
              <p className="text-xs text-admin-text-hint">Este funil tem campos próprios ({pipeline.custom_fields.map((f) => f.label).join(", ")}); preencha depois em “Editar”.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
