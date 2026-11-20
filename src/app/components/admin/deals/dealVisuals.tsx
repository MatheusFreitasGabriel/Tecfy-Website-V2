"use client";

import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { FaStar } from "react-icons/fa6";
import { dealQualifications, dealStatuses, type DealStatus } from "@/lib/admin/crm/options";
import type { DealRow, Pipeline } from "@/lib/admin/crm/types";

/**
 * Função com referência estável que sempre chama a versão mais recente.
 * Usada nos cards do Kanban (memorizados): sem ela, cada render criava funções novas
 * e TODOS os cards redesenhavam a cada arrasto/estrela.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

// ── Status ──

export const dealStatusStyle: Record<DealStatus, string> = {
  em_andamento: "bg-admin-deal-progress text-admin-deal-progress-text",
  pausada: "bg-admin-deal-paused text-admin-deal-paused-text",
  perdida: "bg-admin-deal-lost text-admin-deal-lost-text",
  vendida: "bg-admin-deal-won text-admin-deal-won-text",
};

const statusDot: Record<DealStatus, string> = {
  em_andamento: "bg-admin-deal-progress-text",
  pausada: "bg-admin-deal-paused-text",
  perdida: "bg-admin-deal-lost-text",
  vendida: "bg-admin-deal-won-text",
};

/** Selo colorido do status (azul claro, cinza, vermelho, verde). */
export function DealStatusBadge({ status, className = "" }: { status: DealStatus; className?: string }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold leading-none ${dealStatusStyle[status]} ${className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${statusDot[status]}`} />
      {dealStatuses.label(status)}
    </span>
  );
}

// ── Estrelas ──

interface StarsProps {
  value: number;
  /** Com onChange vira um seletor (teclado: setas). */
  onChange?: (value: number) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Texto ao lado (Frio, Quente...). */
  showHint?: boolean;
}

/** Qualificação em estrelas: 1 = mais baixa, 5 = mais alta. */
export function Stars({ value, onChange, size = "sm", disabled, showHint = true }: StarsProps) {
  const icon = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const hint = dealQualifications.hint(String(value));
  if (!onChange) {
    return (
      <span role="img" aria-label={`Qualificação: ${value} de 5 estrelas (${hint})`} title={`${value}/5 · ${hint}`} className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <FaStar key={n} aria-hidden className={`${icon} ${n <= value ? "text-admin-star" : "text-admin-card-border"}`} />
        ))}
      </span>
    );
  }
  return (
    // Dentro do card arrastável: clique/teclado nas estrelas não iniciam o arrastar.
    <div role="radiogroup" aria-label="Qualificação" className="inline-flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"} — ${dealQualifications.hint(String(n))}`}
          title={dealQualifications.hint(String(n))}
          disabled={disabled}
          tabIndex={n === value ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            if (n !== value) onChange(n);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange(Math.min(5, value + 1));
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.max(1, value - 1));
            }
          }}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-admin-primary disabled:opacity-50"
        >
          <FaStar aria-hidden className={`${icon} ${n <= value ? "text-admin-star" : "text-admin-card-border"}`} />
        </button>
      ))}
      {showHint && <span className="ml-1.5 text-xs font-medium text-admin-text-description">{hint}</span>}
    </div>
  );
}

// ── Valores ──

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

export const formatMoney = (cents: number | null) => (cents === null ? "—" : brl.format(cents / 100));
/** "R$ 12,5 mil" para cabeçalhos de coluna e indicadores. */
export const formatMoneyCompact = (cents: number) => (Math.abs(cents) >= 1_000_000 ? brlCompact.format(cents / 100) : brl.format(cents / 100));

/** Soma dos valores e valor ponderado (valor × % de chance da etapa). */
export function sumValues(deals: DealRow[], pipeline: Pipeline | null): { total: number; weighted: number } {
  const chance = new Map(pipeline?.stages.map((s) => [s.id, s.probability]) ?? []);
  let total = 0;
  let weighted = 0;
  for (const d of deals) {
    if (d.value_cents === null || d.status === "perdida") continue;
    total += d.value_cents;
    weighted += d.status === "vendida" ? d.value_cents : Math.round((d.value_cents * (chance.get(d.stage_id ?? "") ?? 0)) / 100);
  }
  return { total, weighted };
}

// ── Tempo ("agora" compartilhado, atualiza a cada minuto) ──

let nowValue = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeNow(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    nowValue = Date.now();
    timer = setInterval(() => {
      nowValue = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
    queueMicrotask(() => listeners.forEach((l) => l()));
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Hora atual (ms) no cliente; null durante a renderização no servidor (evita diferença de hidratação). */
export function useNow(): number | null {
  const value = useSyncExternalStore(
    subscribeNow,
    () => nowValue || null,
    () => null,
  );
  return value;
}

const brazilDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
/** "2026-11-19" no horário de Brasília. */
export const brazilDate = (ms: number) => brazilDay.format(new Date(ms));

/** Tarefas de hoje (ainda no horário) e atrasadas (vencidas e abertas). */
export function taskCounts(deals: DealRow[], now: number | null): { today: number; overdue: number } {
  if (now === null) return { today: 0, overdue: 0 };
  const today = brazilDate(now);
  let t = 0;
  let o = 0;
  for (const d of deals) {
    for (const due of d.task_due) {
      const ms = Date.parse(due);
      if (ms < now) o++;
      else if (brazilDate(ms) === today) t++;
    }
  }
  return { today: t, overdue: o };
}

/** Dias parada na etapa para virar alerta. */
export const STALE_DAYS = 7;
const DAY = 86_400_000;

export interface DealAlerts {
  overdue: boolean;
  noTask: boolean;
  stale: number | null;
  lateClose: boolean;
  any: boolean;
}

/** O que precisa de atenção (só para negociações abertas). */
export function dealAlerts(deal: DealRow, now: number | null): DealAlerts {
  const none = { overdue: false, noTask: false, stale: null, lateClose: false, any: false };
  if (now === null || deal.status === "vendida" || deal.status === "perdida") return none;
  const overdue = deal.task_due.some((d) => Date.parse(d) < now);
  const noTask = deal.status === "em_andamento" && deal.task_due.length === 0;
  const since = deal.stage_entered_at ? Math.floor((now - Date.parse(deal.stage_entered_at)) / DAY) : 0;
  const stale = deal.status === "em_andamento" && since >= STALE_DAYS ? since : null;
  const lateClose = Boolean(deal.expected_close_date && deal.expected_close_date < brazilDate(now));
  return { overdue, noTask, stale, lateClose, any: overdue || noTask || stale !== null || lateClose };
}
