"use client";

import { useEffect, useId, useState } from "react";
import { FaGear, FaPlus } from "react-icons/fa6";
import type { LeadNoteRow, LeadRow } from "@/lib/admin/crm/types";
import { NOTE_MAX_LENGTH, validateNoteText } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import { formatDateTime } from "./leadVisuals";

interface LeadNotesTimelineProps {
  lead: LeadRow;
  basePath: string;
  /** Muda quando algo gera registro automático (atribuição, vínculo), para recarregar. */
  version?: number;
}

type TimelineItem = LeadNoteRow & { initial?: boolean };

const SERVER_ERRORS: Record<number, string> = {
  400: "Escreva a observação (até 2.000 caracteres).",
  401: "Sua sessão expirou. Entre de novo no painel.",
  404: "Este lead não existe mais.",
};

/**
 * Observações do lead em forma de timeline. Só acrescenta: cada observação registra quem escreveu,
 * o dia e a hora. A observação feita no cadastro aparece por último, como ponto de partida.
 */
export default function LeadNotesTimeline({ lead, basePath, version = 0 }: LeadNotesTimelineProps) {
  const fieldId = useId();
  const [notes, setNotes] = useState<LeadNoteRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${basePath}/api/crm/leads/${lead.id}/notes`, { credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { notes: LeadNoteRow[] };
        if (!cancelled) setNotes(data.notes);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basePath, lead.id, version]);

  const add = async () => {
    if (saving) return;
    const parsed = validateNoteText(text);
    if (!parsed.ok) {
      setError(parsed.errors.text);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${basePath}/api/crm/leads/${lead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: parsed.value }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError(SERVER_ERRORS[response.status] ?? "Não foi possível salvar. Tente de novo.");
        return;
      }
      const data = (await response.json()) as { note: LeadNoteRow };
      setNotes((current) => [data.note, ...(current ?? [])]);
      setText("");
    } catch {
      setError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  // Mais recentes no topo; a observação do cadastro é o ponto de partida (fim da lista).
  const items: TimelineItem[] = [
    ...(notes ?? []),
    ...(lead.notes
      ? [{ id: "initial", kind: "note" as const, text: lead.notes, author_name: lead.created_by_name, created_at: lead.created_at, initial: true }]
      : []),
  ];

  return (
    <div className="mt-3 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="sr-only">
          Nova observação
        </label>
        <textarea
          id={fieldId}
          value={text}
          maxLength={NOTE_MAX_LENGTH}
          disabled={saving}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              add();
            }
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={`${fieldId}-hint`}
          placeholder="Escreva uma observação sobre este lead..."
          className="h-24 w-full resize-y rounded-lg bg-admin-input px-3.5 py-3 text-sm font-medium leading-5 text-admin-text-input outline outline-1 -outline-offset-1 outline-admin-input-border placeholder:text-admin-text-hint focus:outline-2 focus:outline-admin-primary disabled:opacity-60 aria-[invalid=true]:outline-admin-danger"
        />
        <div className="flex items-center justify-between gap-3">
          <p id={`${fieldId}-hint`} className={`text-xs font-medium ${error ? "text-admin-danger" : "text-admin-text-hint"}`} role={error ? "alert" : undefined}>
            {error ?? `${text.length}/${NOTE_MAX_LENGTH} · Ctrl+Enter para adicionar`}
          </p>
          <Button icon={FaPlus} onClick={add} disabled={saving || !text.trim()} className="h-9 px-4 text-[13px]">
            {saving ? "Salvando..." : "Adicionar observação"}
          </Button>
        </div>
      </div>

      {loadError ? (
        <p className="text-sm text-admin-text-hint">Não foi possível carregar as observações.</p>
      ) : notes === null ? (
        <p className="text-sm text-admin-text-hint">Carregando observações...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-admin-text-hint">Nenhuma observação ainda. A primeira fica registrada com seu nome e o horário.</p>
      ) : (
        <ol className="relative flex flex-col gap-5 border-l border-admin-card-border pl-5" aria-label="Linha do tempo das observações">
          {items.map((item) => (
            <li key={item.id} className="relative">
              <span
                aria-hidden
                className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background-kpi ${
                  item.initial || item.kind === "system" ? "bg-admin-text-hint" : "bg-admin-primary"
                }`}
              />
              <p className="text-xs font-medium text-admin-text-description">
                <span className="font-semibold text-admin-drawer-value">{item.author_name ?? "Sem autor"}</span>
                {" · "}
                <time dateTime={item.created_at ?? undefined}>{formatDateTime(item.created_at)}</time>
                {item.initial && " · observação do cadastro"}
                {item.kind === "system" && (
                  <span className="ml-1 inline-flex items-center gap-1 text-admin-text-hint">
                    · <FaGear aria-hidden className="h-2.5 w-2.5" /> registro automático
                  </span>
                )}
              </p>
              <p
                className={`mt-1.5 whitespace-pre-line break-words text-sm leading-5 ${
                  item.kind === "system" ? "italic text-admin-text-label" : "font-medium text-admin-drawer-notes"
                }`}
              >
                {item.text}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
