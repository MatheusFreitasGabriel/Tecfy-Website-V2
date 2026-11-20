"use client";

import type { DealDetail, Pipeline } from "@/lib/admin/crm/types";

interface StageStepperProps {
  deal: DealDetail;
  pipeline: Pipeline;
  now: number | null;
  disabled: boolean;
  /** Etapa em gravação (mostra "Movendo..."). */
  pendingStage: string | null;
  onChange: (stageId: string) => void;
}

const DAY = 86_400_000;
const daysLabel = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
const NOTCH = 14;
// Placa apontando para a direita; da 2ª em diante, com o encaixe à esquerda.
const FIRST = `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`;
const MIDDLE = `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`;

/**
 * Etapas do funil em "placas" (setas para a direita). Mostra quantos dias a negociação está na etapa
 * atual (0 dias = acabou de entrar) e quanto tempo ficou nas etapas por onde já passou.
 * Clicar numa etapa move a negociação.
 */
export default function StageStepper({ deal, pipeline, now, disabled, pendingStage, onChange }: StageStepperProps) {
  const current = Math.max(0, pipeline.stages.findIndex((s) => s.id === deal.stage_id));

  const daysFor = (stageId: string, index: number): string | null => {
    if (index === current) {
      if (now === null || !deal.stage_entered_at) return null;
      return daysLabel(Math.max(0, Math.floor((now - Date.parse(deal.stage_entered_at)) / DAY)));
    }
    const ms = deal.stage_time[stageId];
    return typeof ms === "number" ? daysLabel(Math.floor(ms / DAY)) : null;
  };

  return (
    <ol aria-label="Etapas do funil" className="flex w-full overflow-x-auto pb-1">
      {pipeline.stages.map((stage, i) => {
        const state = i < current ? "done" : i === current ? "current" : "next";
        const days = daysFor(stage.id, i);
        const pending = pendingStage === stage.id;
        return (
          <li key={stage.id} className={`min-w-[150px] flex-1 ${i ? "-ml-2" : ""}`}>
            <button
              type="button"
              disabled={disabled || state === "current"}
              onClick={() => onChange(stage.id)}
              aria-current={state === "current" ? "step" : undefined}
              aria-label={`${stage.name}${days ? `, ${days}` : ""}${state === "current" ? ", etapa atual" : ""}`}
              title={state === "current" ? "Etapa atual" : disabled ? undefined : `Mover para ${stage.name}`}
              style={{ clipPath: i ? MIDDLE : FIRST }}
              className={`group flex h-14 w-full flex-col items-center justify-center gap-0.5 px-6 text-center transition-[filter,background-color] focus-visible:brightness-150 ${
                state === "current"
                  ? "bg-admin-primary text-text-primary"
                  : state === "done"
                    ? "bg-admin-tip text-admin-tip-title hover:brightness-125"
                    : "bg-admin-card text-admin-text-description hover:bg-admin-badge hover:text-text-primary"
              } ${pending ? "animate-pulse" : ""} disabled:cursor-default`}
            >
              <span className="max-w-full truncate text-[13px] font-semibold leading-4">{stage.name}</span>
              {(days || pending) && (
                <span className={`text-[11px] font-medium leading-3 ${state === "current" ? "text-text-primary/80" : "opacity-80"}`}>{pending ? "Movendo..." : days}</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
