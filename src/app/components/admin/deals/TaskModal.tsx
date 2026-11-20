"use client";

import { useState } from "react";
import { FaBuilding, FaHandshake, FaUser, FaUserPlus, FaXmark } from "react-icons/fa6";
import { taskParents, taskRecurrences, taskReminders, taskTypes, type TaskParentType } from "@/lib/admin/crm/options";
import type { AdminUserOption, TaskRow } from "@/lib/admin/crm/types";
import { validateTaskForm, type TaskForm } from "@/lib/admin/crm/dealValidation";
import { withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import Combobox from "../form/Combobox";
import { Field, Select, TextArea, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import { useCrmOptions, type OptionsType } from "../leads/crmOptionsStore";
import { brazilDate } from "./dealVisuals";

interface TaskModalProps {
  basePath: string;
  /** Negociação fixa (aberto pela página da negociação / Kanban). */
  deal: { id: string; title: string } | null;
  admins: AdminUserOption[];
  currentUid: string;
  onClose: () => void;
  /** Tarefa criada ou salva. */
  onCreated: (task: TaskRow) => void;
  /** Editar/reagendar esta tarefa (em vez de criar). */
  task?: TaskRow | null;
  /** Dia sugerido (AAAA-MM-DD), ex.: clique num dia do calendário. */
  defaultDate?: string | null;
}

const timeOf = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

const DAY = 86_400_000;
const PRESETS = [
  { label: "Hoje", days: 0 },
  { label: "Amanhã", days: 1 },
  { label: "Em 3 dias", days: 3 },
  { label: "Próx. semana", days: 7 },
] as const;
const OPTIONS_OF: Record<TaskParentType, OptionsType> = { deal: "deals", lead: "leads", contact: "contacts", company: "companies" };
const PARENT_ICON = { deal: FaHandshake, lead: FaUserPlus, contact: FaUser, company: FaBuilding } as const;

/**
 * Tarefa: o que fazer, tipo, data/hora, responsável (qualquer usuário do painel), vínculo
 * (negociação, lead, contato, empresa ou avulsa), repetição e lembrete. Vai para o histórico do vínculo.
 */
export default function TaskModal({ basePath, deal, admins, currentUid, onClose, onCreated, task = null, defaultDate = null }: TaskModalProps) {
  const [today] = useState(() => Date.now());
  const fixedParent = Boolean(deal) || Boolean(task);
  const [parentLabel, setParentLabel] = useState<string | null>(task?.parent?.label ?? deal?.title ?? null);
  const [form, setForm] = useState<TaskForm>(() => ({
    deal_id: deal?.id ?? "",
    parent_type: task?.parent?.type ?? (deal ? "deal" : ""),
    parent_id: task?.parent?.id ?? deal?.id ?? "",
    title: task?.title ?? "",
    type: task?.type ?? "follow_up",
    due_date: task ? brazilDate(Date.parse(task.due_at)) : (defaultDate ?? brazilDate(today + DAY)),
    due_time: task ? timeOf(task.due_at) : "09:00",
    assignee_uid: task?.assignee_uid && admins.some((a) => a.uid === task.assignee_uid) ? task.assignee_uid : admins.some((a) => a.uid === currentUid) ? currentUid : (admins[0]?.uid ?? ""),
    notes: task?.notes ?? "",
    recurrence: task?.recurrence?.freq ?? "",
    recurrence_interval: String(task?.recurrence?.interval ?? 2),
    remind_minutes: task ? (task.remind_minutes === null ? "" : String(task.remind_minutes)) : "15",
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const parentType = (form.parent_type || "") as TaskParentType | "";
  const options = useCrmOptions(basePath, parentType ? OPTIONS_OF[parentType] : "contacts");

  const set = <K extends keyof TaskForm>(key: K, value: TaskForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) setErrors((e) => withoutKey(e, key as string));
  };

  const submit = async () => {
    if (saving) return;
    const parsed = validateTaskForm(form, admins.map((a) => a.uid));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    if (parentType && !form.parent_id) {
      setErrors({ parent_id: `Escolha ${parentType === "company" ? "a empresa" : parentType === "deal" ? "a negociação" : `o ${taskParents.label(parentType).toLowerCase()}`} ou marque "Sem vínculo".` });
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      const response = await fetch(task ? `${basePath}/api/crm/tasks/${task.id}` : `${basePath}/api/crm/tasks`, {
        method: task ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: form }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; fields?: FieldErrors };
        if (data.fields) setErrors(data.fields);
        setServerError(
          response.status === 401
            ? "Sua sessão expirou. Entre de novo no painel."
            : data.error === "parent_not_found"
              ? "O vínculo escolhido não existe mais."
              : response.status === 404
                ? "Esta tarefa não existe mais."
                : response.status === 400
                  ? "Confira os campos destacados."
                  : "Não foi possível salvar a tarefa. Tente de novo.",
        );
        return;
      }
      onCreated(((await response.json()) as { task: TaskRow }).task);
    } catch {
      setServerError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const ParentIcon = parentType ? PARENT_ICON[parentType] : null;

  return (
    <Modal
      title={task ? "Editar tarefa" : "Criar tarefa"}
      description={fixedParent && parentLabel ? `Ligada a “${parentLabel}”. Fica registrada no histórico.` : "Ligue a uma negociação, lead, contato ou empresa — ou deixe avulsa."}
      onClose={() => !saving && onClose()}
      widthClass="max-w-[640px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col gap-3">
          {serverError && (
            <p role="alert" className="text-sm font-medium text-admin-danger">
              {serverError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Salvando..." : task ? "Salvar tarefa" : "Criar tarefa"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="O que fazer" required error={errors.title}>
          {(p) => <TextInput {...p} autoFocus maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Ligar para apresentar a proposta" />}
        </Field>

        {/* Vínculo */}
        {!fixedParent && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-admin-text-label">Ligada a</span>
            <div role="radiogroup" aria-label="Vínculo da tarefa" className="flex flex-wrap gap-2">
              {[{ value: "", label: "Sem vínculo" }, ...taskParents.options].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={form.parent_type === o.value}
                  onClick={() => {
                    setForm((f) => ({ ...f, parent_type: o.value, parent_id: "" }));
                    setParentLabel(null);
                    setErrors((e) => withoutKey(e, "parent_id"));
                  }}
                  className="h-8 rounded-full px-3 text-xs font-semibold text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-card aria-checked:bg-admin-tip aria-checked:text-admin-tip-title aria-checked:outline-admin-accent/50"
                >
                  {o.label}
                </button>
              ))}
            </div>
            {parentType &&
              (form.parent_id && parentLabel ? (
                <div className="flex h-11 items-center justify-between gap-2 rounded-lg bg-admin-tip px-3.5 outline outline-1 -outline-offset-1 outline-admin-accent/40">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-admin-tip-title">
                    {ParentIcon && <ParentIcon aria-hidden className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{parentLabel}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      set("parent_id", "");
                      setParentLabel(null);
                    }}
                    aria-label="Trocar vínculo"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-admin-tip-text hover:bg-admin-card"
                  >
                    <FaXmark aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Combobox
                  options={options.options ?? []}
                  placeholder={options.options ? `Buscar ${taskParents.label(parentType).toLowerCase()}` : "Carregando..."}
                  ariaLabel={`Buscar ${taskParents.label(parentType).toLowerCase()}`}
                  onSelect={(o) => {
                    set("parent_id", o.id);
                    setParentLabel(o.label);
                  }}
                  emptyText={options.error ? "Não foi possível carregar." : options.options ? "Nada encontrado." : "Carregando..."}
                />
              ))}
            {errors.parent_id && <p className="text-xs font-medium text-admin-danger">{errors.parent_id}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" error={errors.type}>
            {(p) => <Select {...p} options={taskTypes.options} value={form.type} onChange={(e) => set("type", e.target.value)} />}
          </Field>
          <Field label="Responsável" required error={errors.assignee_uid} hint={form.assignee_uid !== currentUid ? "A tarefa vai aparecer no “Meu dia” dessa pessoa." : undefined}>
            {(p) => <Select {...p} options={admins.map((a) => ({ value: a.uid, label: a.uid === currentUid ? `${a.name} (você)` : a.name }))} value={form.assignee_uid} onChange={(e) => set("assignee_uid", e.target.value)} />}
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_130px] gap-4">
            <Field label="Data" required error={errors.due_date}>
              {(p) => <input {...p} type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} className={`${inputClass} h-11`} />}
            </Field>
            <Field label="Hora" error={errors.due_time}>
              {(p) => <input {...p} type="time" value={form.due_time} onChange={(e) => set("due_time", e.target.value)} className={`${inputClass} h-11`} />}
            </Field>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Atalhos de data">
            {PRESETS.map((preset) => {
              const value = brazilDate(today + preset.days * DAY);
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => set("due_date", value)}
                  aria-pressed={form.due_date === value}
                  className="h-8 rounded-full px-3 text-xs font-semibold text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-card-border transition-colors hover:bg-admin-card aria-pressed:bg-admin-tip aria-pressed:text-admin-tip-title aria-pressed:outline-admin-accent/50"
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr]">
          <Field label="Repetir" error={errors.recurrence}>
            {(p) => <Select {...p} placeholder="Não repete" options={taskRecurrences.options} value={form.recurrence ?? ""} onChange={(e) => set("recurrence", e.target.value)} />}
          </Field>
          {form.recurrence === "every_n_days" ? (
            <Field label="A cada quantos dias" error={errors.recurrence_interval}>
              {(p) => <TextInput {...p} inputMode="numeric" value={form.recurrence_interval ?? ""} onChange={(e) => set("recurrence_interval", e.target.value.replace(/\D/g, "").slice(0, 3))} />}
            </Field>
          ) : (
            <Field label="Lembrete" error={errors.remind_minutes} hint="Avisa no painel (e no navegador, se permitido).">
              {(p) => <Select {...p} placeholder="Sem lembrete" options={taskReminders.options} value={form.remind_minutes ?? ""} onChange={(e) => set("remind_minutes", e.target.value)} />}
            </Field>
          )}
        </div>
        {form.recurrence === "every_n_days" && (
          <Field label="Lembrete" error={errors.remind_minutes}>
            {(p) => <Select {...p} placeholder="Sem lembrete" options={taskReminders.options} value={form.remind_minutes ?? ""} onChange={(e) => set("remind_minutes", e.target.value)} />}
          </Field>
        )}
        {form.recurrence && <p className="-mt-2 text-xs text-admin-text-hint">Ao concluir, a próxima tarefa é criada sozinha no mesmo horário.</p>}

        <Field label="Observações" error={errors.notes}>
          {(p) => <TextArea {...p} maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Detalhes para quem vai fazer (opcional)" />}
        </Field>
      </form>
    </Modal>
  );
}
