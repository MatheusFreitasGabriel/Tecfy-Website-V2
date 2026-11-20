"use client";

import { useState } from "react";
import { taskTypes } from "@/lib/admin/crm/options";
import type { AdminUserOption, TaskRow } from "@/lib/admin/crm/types";
import { validateTaskForm, type TaskForm } from "@/lib/admin/crm/dealValidation";
import { withoutKey, type FieldErrors } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import { Field, Select, TextArea, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import { brazilDate } from "./dealVisuals";

interface TaskModalProps {
  basePath: string;
  deal: { id: string; title: string } | null;
  admins: AdminUserOption[];
  currentUid: string;
  onClose: () => void;
  onCreated: (task: TaskRow) => void;
  /** Editar/reagendar esta tarefa (em vez de criar). */
  task?: TaskRow | null;
}

const timeOf = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

const DAY = 86_400_000;
const PRESETS = [
  { label: "Hoje", days: 0 },
  { label: "Amanhã", days: 1 },
  { label: "Em 3 dias", days: 3 },
  { label: "Próx. semana", days: 7 },
] as const;

/** Nova tarefa (follow-up, ligação, reunião...) com data, hora e responsável. Vai para o histórico. */
export default function TaskModal({ basePath, deal, admins, currentUid, onClose, onCreated, task = null }: TaskModalProps) {
  const [today] = useState(() => Date.now());
  const [form, setForm] = useState<TaskForm>(() =>
    task
      ? {
          deal_id: deal?.id ?? "",
          title: task.title,
          type: task.type,
          due_date: brazilDate(Date.parse(task.due_at)),
          due_time: timeOf(task.due_at),
          assignee_uid: task.assignee_uid && admins.some((a) => a.uid === task.assignee_uid) ? task.assignee_uid : currentUid,
          notes: task.notes ?? "",
        }
      : {
          deal_id: deal?.id ?? "",
          title: "",
          type: "follow_up",
          due_date: brazilDate(today + DAY),
          due_time: "09:00",
          assignee_uid: admins.some((a) => a.uid === currentUid) ? currentUid : (admins[0]?.uid ?? ""),
          notes: "",
        },
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = <K extends keyof TaskForm>(key: K, value: TaskForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => withoutKey(e, key));
  };

  const submit = async () => {
    if (saving) return;
    const parsed = validateTaskForm(form, admins.map((a) => a.uid));
    if (!parsed.ok) {
      setErrors(parsed.errors);
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
        setServerError(
          response.status === 401 ? "Sua sessão expirou. Entre de novo no painel." : response.status === 404 ? (task ? "Esta tarefa não existe mais." : "Esta negociação não existe mais.") : "Não foi possível salvar a tarefa. Tente de novo.",
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

  return (
    <Modal
      title={task ? "Editar tarefa" : "Criar tarefa"}
      description={deal ? `Na negociação “${deal.title}”. Fica registrada no histórico.` : "Tarefa avulsa."}
      onClose={() => !saving && onClose()}
      widthClass="max-w-[560px]"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" error={errors.type}>
            {(p) => <Select {...p} options={taskTypes.options} value={form.type} onChange={(e) => set("type", e.target.value)} />}
          </Field>
          <Field label="Responsável" required error={errors.assignee_uid}>
            {(p) => <Select {...p} options={admins.map((a) => ({ value: a.uid, label: a.name }))} value={form.assignee_uid} onChange={(e) => set("assignee_uid", e.target.value)} />}
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
        <Field label="Observações" error={errors.notes}>
          {(p) => <TextArea {...p} maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Detalhes para quem vai fazer (opcional)" />}
        </Field>
      </form>
    </Modal>
  );
}
