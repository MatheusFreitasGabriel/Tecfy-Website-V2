"use client";

import Button from "./Button";
import Modal from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  /** "danger" = botão vermelho (ações destrutivas). */
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmação antes de ações em massa / irreversíveis. */
export default function ConfirmDialog({ title, message, confirmLabel, tone = "primary", busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={() => !busy && onCancel()}
      widthClass="max-w-[480px]"
      closeStyle="boxed"
      titleSize="md"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={tone} onClick={onConfirm} disabled={busy}>
            {busy ? "Aguarde..." : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-sm font-medium leading-5 text-admin-text-label">{message}</div>
    </Modal>
  );
}
