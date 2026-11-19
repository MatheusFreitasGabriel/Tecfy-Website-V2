"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  /** Título curto (em negrito). */
  label: string;
  /** Explicação opcional abaixo do título. */
  description?: string;
  /** Um único elemento focável ou com hover (botão, span, select...). */
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}

interface Position {
  left: number;
  top: number;
  placement: "top" | "bottom";
}

/**
 * Balão que aparece acima do elemento ao passar o mouse ou focar com o teclado
 * (some no Esc, ao sair ou ao rolar a página). Ligado ao elemento via aria-describedby.
 */
export default function Tooltip({ label, description, children }: TooltipProps) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const show = useCallback(() => {
    const target = anchorRef.current?.firstElementChild ?? anchorRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const placement = rect.top < 72 ? "bottom" : "top";
    setPosition({
      left: Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120),
      top: placement === "top" ? rect.top - 8 : rect.bottom + 8,
      placement,
    });
  }, []);
  const hide = useCallback(() => setPosition(null), []);

  useEffect(() => {
    if (!position) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [position, hide]);

  const child = isValidElement(children)
    ? cloneElement(children, { "aria-describedby": position ? id : children.props["aria-describedby"] })
    : children;

  return (
    <span ref={anchorRef} className="inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {child}
      {position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ left: position.left, top: position.top }}
            className={`pointer-events-none fixed z-[70] max-w-[240px] -translate-x-1/2 rounded-lg bg-admin-tooltip px-3 py-2 text-center shadow-xl ${
              position.placement === "top" ? "-translate-y-full" : ""
            }`}
          >
            <p className="text-xs font-semibold leading-4 text-admin-tooltip-text">{label}</p>
            {description && <p className="mt-0.5 text-[11px] font-medium leading-[15px] text-admin-tooltip-text/70">{description}</p>}
            <span
              aria-hidden
              className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-admin-tooltip ${
                position.placement === "top" ? "-bottom-1" : "-top-1"
              }`}
            />
          </div>,
          document.body,
        )}
    </span>
  );
}
