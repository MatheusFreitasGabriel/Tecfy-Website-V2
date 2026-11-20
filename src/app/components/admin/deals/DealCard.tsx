"use client";

import { memo } from "react";
import { FaArrowUpRightFromSquare, FaBuilding, FaCalendarXmark, FaChevronRight, FaClock, FaPlus, FaRegCircleUser, FaTriangleExclamation, FaUser } from "react-icons/fa6";
import type { DealRow } from "@/lib/admin/crm/types";
import { formatDateTime } from "../leads/leadVisuals";
import { DealStatusBadge, Stars, dealAlerts, formatMoney } from "./dealVisuals";

interface DealCardProps {
  deal: DealRow;
  now: number | null;
  /** Abre a página da negociação (duplo clique / Enter). */
  onOpen: (deal: DealRow) => void;
  onAddTask: (deal: DealRow) => void;
  /** Clicar numa estrela muda a qualificação (null = só mostra). */
  onQualify?: ((deal: DealRow, stars: number) => void) | null;
  /** Avança para a próxima etapa (null = já está na última). */
  onNextStage: ((deal: DealRow) => void) | null;
  nextStageName: string | null;
  /** Card sendo arrastado (fica "fantasma" no lugar) ou desenhado no overlay. */
  dragging?: boolean;
  overlay?: boolean;
  /** Recém-criado/convertido: pisca para chamar atenção. */
  highlight?: boolean;
}

/** Card de negociação: status, título, empresa/contato, responsável, estrelas, valor, alteração e "+ Tarefa". */
function DealCardBase({ deal, now, onOpen, onAddTask, onQualify, onNextStage, nextStageName, dragging, overlay, highlight }: DealCardProps) {
  const alerts = dealAlerts(deal, now);
  const party = [deal.company?.name, deal.contact?.name].filter(Boolean).join(" · ");
  const daysInStage = now !== null && deal.stage_entered_at ? Math.max(0, Math.floor((now - Date.parse(deal.stage_entered_at)) / 86_400_000)) : null;
  const paused = deal.status === "pausada";

  return (
    <article
      onDoubleClick={() => onOpen(deal)}
      className={`group relative flex flex-col gap-2.5 rounded-xl bg-admin-deal-card p-3.5 outline outline-1 -outline-offset-1 transition-[background-color,outline-color,opacity] ${
        alerts.overdue ? "outline-admin-danger/50" : "outline-admin-card-border"
      } ${dragging ? "opacity-40" : paused ? "opacity-60 hover:opacity-90" : "hover:bg-admin-deal-card-hover"} ${overlay ? "rotate-[1.5deg] cursor-grabbing shadow-2xl shadow-black/60" : "cursor-grab"} ${
        highlight ? "ring-2 ring-admin-accent" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <DealStatusBadge status={deal.status} />
        <div className="flex items-center gap-1.5 text-[11px]">
          {alerts.overdue && (
            <span title="Tem tarefa atrasada" className="text-admin-danger">
              <FaClock aria-hidden className="h-3 w-3" />
              <span className="sr-only">Tarefa atrasada.</span>
            </span>
          )}
          {alerts.noTask && (
            <span title="Sem tarefa agendada" className="text-admin-warning">
              <FaTriangleExclamation aria-hidden className="h-3 w-3" />
              <span className="sr-only">Sem tarefa agendada.</span>
            </span>
          )}
          {alerts.lateClose && (
            <span title="Previsão de fechamento já passou" className="text-admin-danger">
              <FaCalendarXmark aria-hidden className="h-3 w-3" />
              <span className="sr-only">Previsão de fechamento vencida.</span>
            </span>
          )}
          {onNextStage && !overlay && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onNextStage(deal);
              }}
              aria-label={`Avançar “${deal.title}” para ${nextStageName}`}
              title={`Avançar para ${nextStageName}`}
              className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-admin-text-hint opacity-0 transition-opacity hover:bg-admin-card hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
            >
              <FaChevronRight aria-hidden className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="flex items-start justify-between gap-2 break-words text-sm font-semibold leading-5 text-text-primary">
          <span className="line-clamp-2">{deal.title}</span>
          {!overlay && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(deal);
              }}
              aria-label={`Abrir “${deal.title}”`}
              title="Abrir negociação"
              className="mt-0.5 shrink-0 rounded p-0.5 text-admin-text-hint opacity-0 transition-opacity hover:text-admin-accent focus-visible:opacity-100 group-hover:opacity-100"
            >
              <FaArrowUpRightFromSquare aria-hidden className="h-3 w-3" />
            </button>
          )}
        </h3>
        {party && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-admin-text-description">
            {deal.company ? <FaBuilding aria-hidden className="h-2.5 w-2.5 shrink-0" /> : <FaUser aria-hidden className="h-2.5 w-2.5 shrink-0" />}
            <span className="truncate">{party}</span>
          </p>
        )}
      </div>

      <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-admin-text-label">
        <FaRegCircleUser aria-hidden className="h-3 w-3 shrink-0 text-admin-text-hint" />
        <span className="truncate">{deal.owner_name ?? "Sem responsável"}</span>
      </p>

      <div className="flex items-center justify-between gap-2">
        {onQualify && !overlay ? <Stars value={deal.qualification} onChange={(n) => onQualify(deal, n)} showHint={false} /> : <Stars value={deal.qualification} />}
        {deal.value_cents !== null && <span className="text-sm font-semibold text-text-primary">{formatMoney(deal.value_cents)}</span>}
      </div>

      <p className="flex items-center justify-between gap-2 text-[11px] font-medium text-admin-text-hint">
        <span>
          Alterada em <time dateTime={deal.updated_at ?? undefined}>{formatDateTime(deal.updated_at)}</time>
        </span>
        {daysInStage !== null && <span title="Dias nesta etapa" className={alerts.stale !== null ? "font-semibold text-admin-warning" : ""}>{daysInStage}d na etapa</span>}
      </p>

      {!overlay && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAddTask(deal);
          }}
          className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-admin-card-border text-[11px] font-semibold text-admin-text-description transition-colors hover:border-admin-accent hover:text-admin-accent focus-visible:outline-2 focus-visible:outline-admin-primary"
        >
          <FaPlus aria-hidden className="h-2.5 w-2.5" />
          Tarefa
        </button>
      )}
    </article>
  );
}

const DealCard = memo(DealCardBase);
export default DealCard;
