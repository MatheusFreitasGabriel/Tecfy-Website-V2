"use client";

import { useEffect, useRef } from "react";

/**
 * Blob "ameba" que segue o cursor.
 * - Branco + mix-blend-difference (mesmo efeito do título da hero): inverte o
 *   que estiver atrás dele.
 * - Se deforma e gira sozinho (animação em CSS: blob-morph + blob-spin).
 * - A posição é controlada via left/top (não via transform) DE PROPÓSITO: assim
 *   o transform fica livre para o CSS animar rotação/escala sem conflito, e o
 *   mix-blend-difference continua intacto.
 */
export default function CursorBlob() {
  const blobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Só faz sentido com mouse "fino"; respeita quem prefere menos movimento.
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reduceMotion) return;

    const blob = blobRef.current;
    if (!blob) return;

    // Posição alvo (mouse) e posição atual (suavizada com lerp).
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let visible = false;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!visible) {
        visible = true;
        blob.style.opacity = "1";
      }
    };

    // Quanto maior, mais "grudado" no cursor (1 = sem atraso). 0.35 = leve
    // amortecimento pra continuar orgânico, mas sem rastro perceptível.
    const follow = 0.35;

    const tick = () => {
      // lerp -> segue o cursor com um amortecimento sutil
      x += (targetX - x) * follow;
      y += (targetY - y) * follow;
      blob.style.left = `${x}px`;
      blob.style.top = `${y}px`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={blobRef} className="cursor-blob" aria-hidden="true" />;
}
