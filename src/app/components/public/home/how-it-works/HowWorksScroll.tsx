"use client";

import { useEffect, useRef, useState } from "react";
import {
  InformationCardsHowTheServicesWorks,
  type ServiceWorkflowStep,
} from "./HowWorksSteps";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// Quanto de rolagem (em vh) cada etapa "ocupa" no modo fixado. Maior = mais lento.
const SEGMENT_VH = 80;

/** Cabeçalho da seção (reaproveitado pelos dois modos). */
function SectionHeading() {
  return (
    <div className="flex flex-col gap-3 items-center px-4 text-center">
      <span className="text-[14px] text-secondary font-medium uppercase tracking-wide">
        Como funciona
      </span>

      <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px] uppercase">
        Da ideia ao lançamento
      </h2>

      <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-[16px] uppercase">
        Nossos sistemas são desenvolvidos com base em engenharia, arquitetura{" "}
        <br className="hidden sm:block" />e princípios de segurança
      </p>
    </div>
  );
}

/**
 * Etapa = dois containers:
 *  - esquerda: o card (roxo, gradiente primary) com ícone, título e resumo curto.
 *  - direita: painel de detalhes com o resumo + cada conceito e sua descrição.
 * No desktop ficam lado a lado; no mobile empilham. O painel da direita revela
 * com a classe `hw-open` (dirigida por `open`), com os conceitos em cascata.
 */
function StepPair({
  card,
  index,
  total,
  open,
}: {
  card: ServiceWorkflowStep;
  index: number;
  total: number;
  open: boolean;
}) {
  const Icon = card.iconCard;
  const stepLabel = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  return (
    <div className="w-full flex flex-col lg:flex-row items-stretch justify-center gap-4 lg:gap-6">
      {/* Container esquerdo: o card */}
      <div className="w-full lg:w-[400px] shrink-0 border border-border-primary p-3 shadow-[0_30px_120px_-45px_rgba(55,0,255,0.7)]">
        <div className="h-full bg-gradient-to-b from-primary to-background-secondary px-6 py-9 md:px-8 md:py-11 flex flex-col items-center text-center gap-5">
          <span className="text-white/70 text-[13px] font-medium tracking-[0.25em]">
            {stepLabel}
          </span>

          <div className="w-14 h-14 border border-white/25 flex items-center justify-center">
            <Icon className="w-6 h-6 text-white" />
          </div>

          <h3 className="text-[28px] md:text-[36px] font-semibold uppercase leading-none text-white">
            {card.titleCard}
          </h3>

          <p className="text-white/70 text-[14px] md:text-[15px] max-w-[300px]">
            {card.textCard}
          </p>
        </div>
      </div>

      {/* Container direito: detalhes + conceitos */}
      <div
        className="hw-open w-full lg:w-[480px] border border-border-primary p-3"
        data-open={open}
      >
        <div className="h-full bg-background-secondary px-6 py-9 md:px-8 md:py-11 flex flex-col gap-6 text-left">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 bg-primary" />
            <span className="text-text-secondary text-[12px] uppercase tracking-[0.2em]">
              O que fazemos nesta etapa
            </span>
          </div>

          <p className="text-text-secondary text-[14px] md:text-[15px] leading-relaxed">
            {card.summaryCard}
          </p>

          <ul className="flex flex-col gap-4 pt-1">
            {card.conceptsCard.map((concept, conceptIndex) => (
              <li
                key={concept.title}
                className="hw-concept flex gap-3"
                style={{ transitionDelay: open ? `${0.2 + conceptIndex * 0.09}s` : "0s" }}
              >
                <span className="mt-[6px] w-2 h-2 bg-primary shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-white text-[13px] md:text-[14px] font-semibold uppercase tracking-wide">
                    {concept.title}
                  </h4>
                  <p className="text-text-tertiary text-[12px] md:text-[13px] leading-snug">
                    {concept.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function HowWorksScroll() {
  const cards = InformationCardsHowTheServicesWorks;
  const total = cards.length;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // 0..1 ao longo de toda a seção
  const [enablePin, setEnablePin] = useState(false); // pinning só no desktop + sem reduce-motion

  // Decide o modo (fixado no desktop, empilhado no mobile / reduce-motion).
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compute = () => setEnablePin(desktop.matches && !reduce.matches);
    compute();
    desktop.addEventListener("change", compute);
    reduce.addEventListener("change", compute);
    return () => {
      desktop.removeEventListener("change", compute);
      reduce.removeEventListener("change", compute);
    };
  }, []);

  // Progresso do scroll (só quando fixado).
  useEffect(() => {
    if (!enablePin) return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    let raf = 0;
    const update = () => {
      const rect = wrap.getBoundingClientRect();
      const scrollable = wrap.offsetHeight - window.innerHeight;
      const scrolled = clamp(-rect.top, 0, scrollable);
      setProgress(scrollable > 0 ? scrolled / scrollable : 0);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [enablePin]);

  const activeIndex = clamp(Math.round(progress * total - 0.5), 0, total - 1);

  // Modo empilhado (mobile / reduce-motion): lista normal, sem cortar conteúdo.
  if (!enablePin) {
    return (
      <div className="w-full flex flex-col items-center gap-12 px-4">
        <SectionHeading />
        <div className="w-full max-w-[420px] lg:max-w-[920px] flex flex-col gap-10">
          {cards.map((card, index) => (
            <StepPair key={index} card={card} index={index} total={total} open />
          ))}
        </div>
      </div>
    );
  }

  // Modo fixado (desktop): cards empilhados centralizados, um de cada vez.
  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: `${total * SEGMENT_VH}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col pt-28 pb-10">
        <SectionHeading />

        <div className="relative flex-1 flex items-center justify-center px-6 md:px-10">
          {cards.map((card, index) => {
            const center = (index + 0.5) / total;
            let s = (progress - center) * total; // 0 quando centralizado

            if (index === 0 && s < 0) s = 0;
            if (index === total - 1 && s > 0) s = 0;

            const dist = Math.abs(s);
            const opacity = clamp(1 - dist, 0, 1);
            const translateY = -s * 44;
            const scale = 1 - Math.min(dist, 1) * 0.05;
            const isActive = index === activeIndex;

            return (
              <div
                key={index}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  opacity,
                  transform: `translateY(${translateY}px) scale(${scale})`,
                  pointerEvents: isActive ? "auto" : "none",
                  willChange: "opacity, transform",
                }}
              >
                <div className="w-full max-w-[920px]">
                  <StepPair card={card} index={index} total={total} open={isActive} />
                </div>
              </div>
            );
          })}

          {/* Indicador de progresso vertical, na lateral */}
          <div className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5">
            {cards.map((_, index) => (
              <span
                key={index}
                className="w-[3px] rounded-full transition-all duration-500"
                style={{
                  height: index === activeIndex ? 32 : 10,
                  background:
                    index === activeIndex ? "var(--primary)" : "var(--border-secondary)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
