"use client";

import { useEffect, useId, useRef, type RefObject } from "react";

/** Pilha de camadas abertas (modal, painel, confirmação): só a do topo responde ao Esc e prende o foco. */
const stack: string[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamento comum das camadas sobrepostas do painel:
 * trava o scroll da página, foca o primeiro campo de `[data-modal-body]` (ou o próprio painel),
 * prende o Tab dentro do painel, fecha no Esc e devolve o foco ao fechar. Empilhável.
 */
export function useModalBehavior(panelRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const id = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    stack.push(id);
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const first = panel?.querySelector("[data-modal-body]")?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id || !panelRef.current) return;
      // Um campo (ex.: lista da busca aberta) já tratou o Esc → não fecha a camada.
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = stack.lastIndexOf(id);
      if (index >= 0) stack.splice(index, 1);
      if (stack.length === 0) document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [id, panelRef]);

  return id;
}
