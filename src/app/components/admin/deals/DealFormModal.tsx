"use client";

import { useEffect, useMemo, useState } from "react";
import { FaArrowRightArrowLeft, FaBuilding, FaCheck, FaMagnifyingGlass, FaPlus, FaUser, FaXmark } from "react-icons/fa6";
import { STARS_FROM_LEAD_QUALIFICATION, leadEntries, leadQualifications, leadSources } from "@/lib/admin/crm/options";
import type { AdminUserOption, Board, CompanyRow, ContactRow, ConvertibleLead, DealRow, Pipeline, PickerOption } from "@/lib/admin/crm/types";
import { emptyDealForm, validateCustomValues, validateDealForm, type DealForm } from "@/lib/admin/crm/dealValidation";
import { CONTACT_COMPANY_NONE, emptyCompanyForm, emptyContactForm, withoutKey, type CompanyForm, type ContactForm, type FieldErrors } from "@/lib/admin/crm/validation";
import { maskCurrencyBRL } from "@/utils/masks";
import Button from "../form/Button";
import Combobox from "../form/Combobox";
import { Field, Select, TextArea, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import CreateCompanyModal from "../leads/CreateCompanyModal";
import CreateContactModal from "../leads/CreateContactModal";
import { invalidateCrmOptions, useCrmOptions } from "../leads/crmOptionsStore";
import { formatDate } from "../leads/leadVisuals";
import { companyErrorMessage } from "../companies/CompaniesView";
import { contactErrorMessage } from "../contacts/ContactsView";
import { normalizeSearch } from "../shared/ListControls";
import CustomFieldsInputs from "./CustomFieldsInputs";
import { Stars, formatMoney } from "./dealVisuals";

type Link = { id: string; name: string } | null;

interface DealFormModalProps {
  mode: "create" | "convert";
  basePath: string;
  admins: AdminUserOption[];
  currentUid: string;
  boards: Board[];
  /** Funis ativos. */
  pipelines: Pipeline[];
  initialPipelineId: string;
  initialStageId?: string | null;
  /** Converter direto um lead (vindo da tela de Leads). */
  initialLeadId?: string | null;
  onClose: () => void;
  onSaved: (deal: DealRow, openKanban: boolean) => void;
}

function initialForm(pipelines: Pipeline[], pipelineId: string, stageId: string | null | undefined, owner: string): DealForm {
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  const stage = pipeline?.stages.find((s) => s.id === stageId) ?? pipeline?.stages[0];
  return emptyDealForm(owner, pipeline?.board_id ?? "", pipeline?.id ?? "", stage?.id ?? "");
}

/** Mensagem amigável para os erros das rotas de negociação. */
async function dealErrorMessage(response: Response): Promise<{ text: string; fields?: FieldErrors }> {
  const data = (await response.json().catch(() => ({}))) as { error?: string; fields?: FieldErrors };
  if (response.status === 401) return { text: "Sua sessão expirou. Entre de novo no painel." };
  if (data.error === "already_converted") return { text: "Este lead já virou negociação. Atualize a lista." };
  if (data.error === "pipeline_changed") return { text: "O funil foi alterado enquanto você preenchia. Escolha a etapa de novo." };
  if (data.error === "missing_link") return { text: "O contato ou a empresa escolhida não existe mais." };
  if (data.error === "invalid_custom") return { text: "Confira os campos do funil.", fields: Object.fromEntries(Object.entries(data.fields ?? {})) };
  if (response.status === 404) return { text: "Este lead não existe mais." };
  if (response.status === 400) return { text: "Confira os campos e tente de novo." };
  return { text: "Não foi possível salvar. Tente de novo." };
}

/** Criar negociação manual ou converter um lead: nome, quadro/funil/etapa, contato/empresa, valor, responsável... */
export default function DealFormModal({ mode, basePath, admins, currentUid, boards, pipelines, initialPipelineId, initialStageId, initialLeadId, onClose, onSaved }: DealFormModalProps) {
  const defaultOwner = admins.some((a) => a.uid === currentUid) ? currentUid : (admins[0]?.uid ?? "");
  const [form, setForm] = useState<DealForm>(() => initialForm(pipelines, initialPipelineId, initialStageId, defaultOwner));
  const [contact, setContact] = useState<Link>(null);
  const [company, setCompany] = useState<Link>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState<false | "save" | "kanban">(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [sub, setSub] = useState<null | "contact" | "company">(null);
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  // Conversão: escolher o lead primeiro.
  const [lead, setLead] = useState<ConvertibleLead | null>(null);
  const [leads, setLeads] = useState<ConvertibleLead[] | null>(null);
  const [leadsError, setLeadsError] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");

  const contacts = useCrmOptions(basePath, "contacts");
  const companies = useCrmOptions(basePath, "companies");

  const pipeline = pipelines.find((p) => p.id === form.pipeline_id) ?? null;
  const boardPipelines = pipelines.filter((p) => p.board_id === form.board_id);
  const activeBoards = boards.filter((b) => !b.archived && pipelines.some((p) => p.board_id === b.id));

  const pickLead = (l: ConvertibleLead) => {
    setLead(l);
    setForm((f) => ({
      ...f,
      title: l.company?.name && l.title !== l.company.name ? `${l.title} · ${l.company.name}` : l.title,
      owner_uid: l.owner_uid && admins.some((a) => a.uid === l.owner_uid) ? l.owner_uid : defaultOwner,
      value: l.estimated_value_cents ? maskCurrencyBRL(String(l.estimated_value_cents)) : "",
      expected_close_date: l.expected_close_date ?? "",
      qualification: String(STARS_FROM_LEAD_QUALIFICATION[l.qualification] ?? 1),
      context: [l.interest_plan ? `Plano de interesse: ${l.interest_plan}` : "", l.notes ?? ""].filter(Boolean).join("\n\n"),
    }));
    setContact(l.contact);
    setCompany(l.company);
    setErrors({});
    setServerError(null);
  };

  useEffect(() => {
    if (mode !== "convert") return;
    let alive = true;
    fetch(`${basePath}/api/crm/deals/convert`, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ leads: ConvertibleLead[] }>) : Promise.reject()))
      .then((data) => {
        if (!alive) return;
        setLeads(data.leads);
        const preset = initialLeadId ? data.leads.find((l) => l.id === initialLeadId) : null;
        if (preset) pickLead(preset);
      })
      .catch(() => alive && setLeadsError(true));
    return () => {
      alive = false;
    };
    // Carrega uma vez ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleLeads = useMemo(() => {
    const terms = normalizeSearch(leadQuery).split(/\s+/).filter(Boolean);
    return (leads ?? []).filter((l) => {
      const hay = normalizeSearch([l.title, l.contact?.name, l.company?.name, l.interest_plan].filter(Boolean).join(" "));
      return terms.every((t) => hay.includes(t));
    });
  }, [leads, leadQuery]);

  const set = <K extends keyof DealForm>(key: K, value: DealForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => withoutKey(e, key));
  };

  const choosePipeline = (id: string) => {
    const p = pipelines.find((x) => x.id === id);
    if (!p) return;
    setForm((f) => ({ ...f, board_id: p.board_id, pipeline_id: p.id, stage_id: p.stages[0]?.id ?? "", custom: {} }));
    setErrors((e) => withoutKey(withoutKey(e, "pipeline_id"), "stage_id"));
  };

  const chooseBoard = (id: string) => {
    const first = pipelines.find((p) => p.board_id === id);
    if (first) choosePipeline(first.id);
  };

  const submit = async (openKanban: boolean) => {
    if (saving) return;
    const base = validateDealForm(form, admins.map((a) => a.uid), pipelines);
    const custom = pipeline ? validateCustomValues(pipeline.custom_fields, form.custom) : { ok: true as const, value: {} };
    const next: FieldErrors = { ...(base.ok ? {} : base.errors), ...(custom.ok ? {} : custom.errors) };
    if (!contact && !company) next.links = "Vincule um contato ou uma empresa.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setSaving(openKanban ? "kanban" : "save");
    setServerError(null);
    try {
      const url = mode === "convert" ? `${basePath}/api/crm/deals/convert` : `${basePath}/api/crm/deals`;
      const payload =
        mode === "convert"
          ? { lead_id: lead?.id, deal: form, contact_id: contact?.id ?? "", company_id: company?.id ?? "" }
          : { request_id: requestId, deal: form, contact_id: contact?.id ?? "", company_id: company?.id ?? "" };
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
      if (!response.ok) {
        const message = await dealErrorMessage(response);
        setServerError(message.text);
        if (message.fields) setErrors(message.fields);
        return;
      }
      const data = (await response.json()) as { deal: DealRow | null };
      if (data.deal) onSaved(data.deal, openKanban);
      else onClose();
    } catch {
      setServerError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const createContact = async (draft: ContactForm) => {
    setSubBusy(true);
    setSubError(null);
    try {
      const response = await fetch(`${basePath}/api/crm/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact: draft }), credentials: "same-origin" });
      if (!response.ok) return setSubError(await contactErrorMessage(response));
      const { contact: created } = (await response.json()) as { contact: ContactRow };
      setContact({ id: created.id, name: created.name });
      if (!company && created.company) setCompany(created.company);
      setErrors((e) => withoutKey(e, "links"));
      invalidateCrmOptions("contacts");
      setSub(null);
    } catch {
      setSubError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSubBusy(false);
    }
  };

  const createCompany = async (draft: CompanyForm) => {
    setSubBusy(true);
    setSubError(null);
    try {
      const response = await fetch(`${basePath}/api/crm/companies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: draft }), credentials: "same-origin" });
      if (!response.ok) return setSubError(await companyErrorMessage(response));
      const { company: created } = (await response.json()) as { company: CompanyRow };
      setCompany({ id: created.id, name: created.trade_name });
      setErrors((e) => withoutKey(e, "links"));
      invalidateCrmOptions("companies");
      setSub(null);
    } catch {
      setSubError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSubBusy(false);
    }
  };

  const picking = mode === "convert" && !lead;
  const title = mode === "convert" ? "Converter lead em negociação" : "Criar negociação";
  const description = picking
    ? "Escolha o lead que vai entrar em negociação. Os dados dele já vêm preenchidos."
    : mode === "convert"
      ? "Confira os dados do lead e complete a negociação."
      : "Cadastre uma negociação com um contato ou uma empresa vinculada.";

  const footer = picking ? (
    <div className="flex justify-end">
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {serverError && (
        <p role="alert" className="text-sm font-medium text-admin-danger">
          {serverError}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={Boolean(saving)}>
          Cancelar
        </Button>
        {mode === "convert" ? (
          <>
            <Button variant="secondary" onClick={() => submit(false)} disabled={Boolean(saving)}>
              {saving === "save" ? "Convertendo..." : "Converter"}
            </Button>
            <Button onClick={() => submit(true)} disabled={Boolean(saving)}>
              {saving === "kanban" ? "Convertendo..." : "Converter e abrir Kanban"}
            </Button>
          </>
        ) : (
          <Button onClick={() => submit(true)} disabled={Boolean(saving)}>
            {saving ? "Criando..." : "Criar negociação"}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Modal title={title} description={description} onClose={() => !saving && onClose()} widthClass="max-w-[880px]" footer={footer}>
        {picking ? (
          <LeadPicker leads={visibleLeads} total={leads?.length ?? null} error={leadsError} query={leadQuery} onQuery={setLeadQuery} onPick={pickLead} />
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              submit(true);
            }}
          >
            {lead && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-admin-tip px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-admin-tip-text">Lead selecionado</p>
                  <p className="truncate text-sm font-semibold text-admin-tip-title">{lead.title}</p>
                  <p className="text-xs font-medium text-admin-tip-text">
                    {leadEntries.label(lead.entry)} · {lead.source ? leadSources.label(lead.source) : "Sem origem"} · {leadQualifications.label(lead.qualification)} · chegou em {formatDate(lead.created_at)}
                  </p>
                </div>
                <Button variant="ghost" icon={FaArrowRightArrowLeft} onClick={() => setLead(null)} className="h-9 px-3 text-[13px]">
                  Trocar lead
                </Button>
              </div>
            )}

            <Field label="Nome da negociação" required error={errors.title}>
              {(p) => <TextInput {...p} autoFocus maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Sistema de gestão · Padaria Pão Quente" />}
            </Field>

            <section className="flex flex-col gap-3 rounded-xl bg-background-kpi p-4 outline outline-1 -outline-offset-1 outline-admin-card-border" aria-label="Onde a negociação entra">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Quadro" required>
                  {(p) => <Select {...p} options={activeBoards.map((b) => ({ value: b.id, label: b.name }))} value={form.board_id} onChange={(e) => chooseBoard(e.target.value)} />}
                </Field>
                <Field label="Funil" required error={errors.pipeline_id}>
                  {(p) => <Select {...p} options={boardPipelines.map((x) => ({ value: x.id, label: x.name }))} value={form.pipeline_id} onChange={(e) => choosePipeline(e.target.value)} />}
                </Field>
              </div>
              {pipeline && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-admin-text-label">Etapa *</span>
                  <div role="radiogroup" aria-label="Etapa" className="flex flex-wrap gap-2">
                    {pipeline.stages.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={form.stage_id === s.id}
                        onClick={() => set("stage_id", s.id)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-card-border transition-colors hover:bg-admin-card aria-checked:bg-admin-tip aria-checked:text-text-primary aria-checked:outline-admin-accent/60"
                      >
                        <span className="text-admin-text-hint">{i + 1}.</span> {s.name}
                      </button>
                    ))}
                  </div>
                  {errors.stage_id && <p className="text-xs font-medium text-admin-danger">{errors.stage_id}</p>}
                </div>
              )}
            </section>

            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LinkPicker
                  label="Contato"
                  icon={FaUser}
                  selected={contact}
                  options={contacts.options}
                  error={contacts.error}
                  onSelect={(o) => {
                    setContact({ id: o.id, name: o.label });
                    setErrors((e) => withoutKey(e, "links"));
                  }}
                  onClear={() => setContact(null)}
                  onCreate={() => {
                    setSubError(null);
                    setSub("contact");
                  }}
                />
                <LinkPicker
                  label="Empresa"
                  icon={FaBuilding}
                  selected={company}
                  options={companies.options}
                  error={companies.error}
                  onSelect={(o) => {
                    setCompany({ id: o.id, name: o.label });
                    setErrors((e) => withoutKey(e, "links"));
                  }}
                  onClear={() => setCompany(null)}
                  onCreate={() => {
                    setSubError(null);
                    setSub("company");
                  }}
                />
              </div>
              <p className={`text-xs font-medium ${errors.links ? "text-admin-danger" : "text-admin-text-hint"}`} role={errors.links ? "alert" : undefined}>
                {errors.links ?? "A negociação precisa de pelo menos um contato ou uma empresa."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Responsável" required error={errors.owner_uid}>
                {(p) => <Select {...p} options={admins.map((a) => ({ value: a.uid, label: a.name }))} value={form.owner_uid} onChange={(e) => set("owner_uid", e.target.value)} />}
              </Field>
              <Field label="Valor da negociação" error={errors.value} hint={lead?.estimated_value_cents ? `Estimado no lead: ${formatMoney(lead.estimated_value_cents)}` : undefined}>
                {(p) => <TextInput {...p} inputMode="numeric" value={form.value} onChange={(e) => set("value", maskCurrencyBRL(e.target.value))} placeholder="R$ 0,00" />}
              </Field>
              <Field label="Previsão de fechamento" error={errors.expected_close_date}>
                {(p) => <input {...p} type="date" value={form.expected_close_date} onChange={(e) => set("expected_close_date", e.target.value)} className={`${inputClass} h-11`} />}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-admin-text-label">Qualificação</span>
                <Stars value={Number(form.qualification)} onChange={(n) => set("qualification", String(n))} size="md" />
              </div>
              <Field label="Status" error={errors.status}>
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
            </div>

            <Field label="Contexto da negociação" error={errors.context} hint="O que o cliente precisa, dores, prazos, quem decide...">
              {(p) => <TextArea {...p} maxLength={4000} heightClass="h-[96px]" value={form.context} onChange={(e) => set("context", e.target.value)} placeholder="Escreva o contexto para quem for tocar a negociação" />}
            </Field>

            {pipeline && pipeline.custom_fields.length > 0 && (
              <section className="flex flex-col gap-3" aria-label={`Campos do funil ${pipeline.name}`}>
                <h3 className="text-sm font-semibold text-text-primary">Campos do funil “{pipeline.name}”</h3>
                <CustomFieldsInputs
                  fields={pipeline.custom_fields}
                  values={form.custom}
                  errors={errors}
                  onChange={(id, value) => {
                    setForm((f) => ({ ...f, custom: { ...f.custom, [id]: value } }));
                    if (errors[`custom_${id}`]) setErrors((e) => withoutKey(e, `custom_${id}`));
                  }}
                />
              </section>
            )}
          </form>
        )}
      </Modal>

      {sub === "contact" && (
        <CreateContactModal
          mode="create"
          initial={{ ...emptyContactForm(), company_choice: company?.id ?? CONTACT_COMPANY_NONE }}
          companies={companies.options ?? []}
          leadCompanyName={null}
          busy={subBusy}
          serverError={subError}
          onClose={() => !subBusy && setSub(null)}
          onSubmit={createContact}
        />
      )}
      {sub === "company" && (
        <CreateCompanyModal mode="create" initial={emptyCompanyForm()} busy={subBusy} serverError={subError} onClose={() => !subBusy && setSub(null)} onSubmit={createCompany} />
      )}
    </>
  );
}

function LeadPicker({ leads, total, error, query, onQuery, onPick }: { leads: ConvertibleLead[]; total: number | null; error: boolean; query: string; onQuery: (q: string) => void; onPick: (l: ConvertibleLead) => void }) {
  if (error) return <p className="text-sm text-admin-danger">Não foi possível carregar os leads. Feche e tente de novo.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <FaMagnifyingGlass aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-text-description" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar lead por nome, contato, empresa ou plano"
          aria-label="Buscar lead"
          className={`${inputClass} h-11 pl-[42px]`}
        />
      </div>
      {total === null ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Carregando leads...</span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[68px] rounded-xl bg-admin-card motion-safe:animate-pulse" />
          ))}
        </div>
      ) : !leads.length ? (
        <p className="py-8 text-center text-sm text-admin-text-hint">{total ? "Nenhum lead com essa busca." : "Todos os leads já viraram negociação. 🎉"}</p>
      ) : (
        <ul className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1" aria-label="Leads disponíveis">
          {leads.slice(0, 200).map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onPick(l)}
                className="group flex w-full items-center justify-between gap-4 rounded-xl bg-admin-card px-4 py-3 text-left outline outline-1 -outline-offset-1 outline-admin-card-border transition-colors hover:outline-admin-accent/60 focus-visible:outline-2 focus-visible:outline-admin-primary"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{l.title}</p>
                  <p className="truncate text-xs font-medium text-admin-text-description">
                    {[l.contact?.name, l.company?.name].filter(Boolean).join(" · ") || "Sem contato/empresa"} · {leadQualifications.label(l.qualification)} · {formatDate(l.created_at)}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-admin-accent opacity-70 group-hover:opacity-100">
                  <FaCheck aria-hidden className="h-3 w-3" /> Escolher
                </span>
              </button>
            </li>
          ))}
          {leads.length > 200 && <li className="py-2 text-center text-xs text-admin-text-hint">Mostrando 200 de {leads.length}. Refine a busca.</li>}
        </ul>
      )}
    </div>
  );
}

function LinkPicker({
  label,
  icon: Icon,
  selected,
  options,
  error,
  onSelect,
  onClear,
  onCreate,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  selected: Link;
  options: PickerOption[] | null;
  error: boolean;
  onSelect: (o: PickerOption) => void;
  onClear: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium leading-[19px] text-admin-text-label">{label}</span>
        {!selected && (
          <button type="button" onClick={onCreate} className="inline-flex items-center gap-1 text-xs font-semibold text-admin-accent hover:underline">
            <FaPlus aria-hidden className="h-2.5 w-2.5" /> Criar {label.toLowerCase()}
          </button>
        )}
      </div>
      {selected ? (
        <div className="flex h-11 items-center justify-between gap-2 rounded-lg bg-admin-tip px-3.5 outline outline-1 -outline-offset-1 outline-admin-accent/40">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-admin-tip-title">
            <Icon aria-hidden className="h-3 w-3 shrink-0" />
            <span className="truncate">{selected.name}</span>
          </span>
          <button type="button" onClick={onClear} aria-label={`Remover ${label.toLowerCase()} ${selected.name}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-admin-tip-text hover:bg-admin-card">
            <FaXmark aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <Combobox
          options={options ?? []}
          placeholder={options ? `Buscar ${label.toLowerCase()} existente` : "Carregando cadastros..."}
          ariaLabel={`Buscar ${label.toLowerCase()}`}
          onSelect={onSelect}
          emptyText={error ? "Não foi possível carregar." : options ? "Nada encontrado." : "Carregando cadastros..."}
        />
      )}
    </div>
  );
}
