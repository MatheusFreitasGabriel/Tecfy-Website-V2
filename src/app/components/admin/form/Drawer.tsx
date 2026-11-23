"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { FaXmark } from "react-icons/fa6";
import { useModalBehavior } from "./useModalBehavior";

interface DrawerProps {
  title: string;
  /** Texto pequeno acima do título (ex.: "Detalhes do lead"). */
  eyebrow?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Largura máxima (classe Tailwind). */
  widthClass?: string;
}

/** Painel lateral direito (filtros, detalhes...). Esc/X/clique fora fecham; foco preso; empilhável. */
export default function Drawer({ title, eyebrow, onClose, footer, children, widthClass = "max-w-[520px]" }: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const id = useModalBehavior(panelRef, onClose);

  return createPortal(
    <div className="admin-modal-overlay fixed inset-0 z-50 flex justify-end bg-black/75" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className={`admin-drawer-panel flex h-full w-full ${widthClass} flex-col bg-background outline outline-1 -outline-offset-1 outline-border-secondary focus:outline-border-secondary`}
      >
        <header className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-b border-admin-table-border px-7 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">{eyebrow}</p>}
            <h2 id={`${id}-title`} className="truncate text-lg font-bold uppercase leading-6 tracking-tight text-text-primary">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 shrink-0 items-center justify-center border border-admin-button-border text-white/70 hover:border-white/60 hover:text-white"
          >
            <FaXmark aria-hidden className="h-5 w-5" />
          </button>
        </header>
        <div data-modal-body className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          {children}
        </div>
        {footer && <footer className="shrink-0 border-t border-admin-divider px-7 py-5">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
