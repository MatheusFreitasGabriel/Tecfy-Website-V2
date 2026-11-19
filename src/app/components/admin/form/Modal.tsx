"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { FaXmark } from "react-icons/fa6";
import { useModalBehavior } from "./useModalBehavior";

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  /** Largura máxima do painel (classe Tailwind), ex.: "max-w-[1120px]". */
  widthClass: string;
  /** "accent" = X roxo sem fundo (modal principal); "boxed" = X branco em caixa (sub-modais). */
  closeStyle?: "accent" | "boxed";
  /** Tamanho do título: 26px (principal) ou 24px (sub-modais). */
  titleSize?: "lg" | "md";
  footer: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Modal de cadastro do painel: abre centralizado por cima de tudo, trava o scroll da página,
 * prende o foco e fecha no Esc/X. Pode empilhar (sub-modal por cima de outro modal).
 * Clicar fora NÃO fecha, para não perder o que foi preenchido.
 */
export default function Modal({
  title,
  description,
  onClose,
  widthClass,
  closeStyle = "accent",
  titleSize = "lg",
  footer,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useModalBehavior(panelRef, onClose);

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return createPortal(
    <div className="admin-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`admin-modal-panel flex max-h-[calc(100vh-32px)] w-full ${widthClass} flex-col overflow-hidden rounded-2xl bg-background-kpi shadow-2xl outline outline-1 -outline-offset-1 outline-border-input focus:outline-border-input`}
      >
        <header className="flex shrink-0 items-start justify-between gap-6 border-b border-admin-divider px-6 py-6 sm:px-8">
          <div className="flex min-w-0 flex-col gap-2">
            <h2
              id={titleId}
              className={`font-semibold text-text-primary ${titleSize === "lg" ? "text-[26px] leading-8" : "text-2xl leading-[30px]"}`}
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className={`font-medium text-admin-text-description ${titleSize === "lg" ? "text-sm leading-5" : "text-[13px] leading-[19px]"}`}
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] transition-colors ${
              closeStyle === "accent"
                ? "text-admin-accent hover:bg-admin-card"
                : "bg-admin-card text-text-primary outline outline-1 -outline-offset-1 outline-admin-button-border hover:bg-admin-badge"
            }`}
          >
            <FaXmark aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div data-modal-body className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {children}
        </div>

        <footer className="shrink-0 border-t border-admin-divider px-6 py-5 sm:px-8">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}
