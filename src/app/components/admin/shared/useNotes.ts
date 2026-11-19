"use client";

import { useState } from "react";
import type { LeadNoteRow } from "@/lib/admin/crm/types";

/**
 * Timeline de um registro (contato/empresa). As observações já vêm da página (carregadas no
 * servidor junto com os dados — nenhuma requisição extra ao abrir). Depois de uma edição, a página
 * é atualizada e traz a timeline nova; uma observação recém-criada entra na hora com `prepend`.
 */
export function useNotes(initial: LeadNoteRow[]) {
  const [base, setBase] = useState(initial);
  const [notes, setNotes] = useState(initial);
  if (base !== initial) {
    setBase(initial);
    setNotes(initial);
  }
  return {
    notes,
    prepend: (note: LeadNoteRow) => setNotes((list) => [note, ...list]),
  };
}
