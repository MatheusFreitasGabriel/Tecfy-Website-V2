"use client";

import type { LeadNoteRow, LeadRow } from "@/lib/admin/crm/types";
import NotesTimeline from "../shared/NotesTimeline";

interface LeadNotesTimelineProps {
  lead: LeadRow;
  basePath: string;
  /** Observações já carregadas pela tela (null = carregando). */
  notes: LeadNoteRow[] | null;
  loadError: boolean;
  onRetry: () => void;
  /** Observação gravada: a tela acrescenta na memória (sem buscar de novo). */
  onAdded: (note: LeadNoteRow) => void;
}

/** Timeline de observações do lead (usa a timeline compartilhada com contatos e empresas). */
export default function LeadNotesTimeline({ lead, basePath, notes, loadError, onRetry, onAdded }: LeadNotesTimelineProps) {
  return (
    <NotesTimeline
      postUrl={`${basePath}/api/crm/leads/${lead.id}/notes`}
      initial={lead.notes ? { text: lead.notes, author: lead.created_by_name, created_at: lead.created_at } : null}
      notes={notes}
      loadError={loadError}
      onRetry={onRetry}
      onAdded={onAdded}
      subject="lead"
    />
  );
}
