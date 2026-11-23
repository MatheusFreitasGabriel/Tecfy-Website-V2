"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaPlus } from "react-icons/fa6";
import type { DealRow, Pipeline, PipelineStage } from "@/lib/admin/crm/types";
import DealCard from "./DealCard";
import { formatMoneyCompact, sumValues, useStableCallback } from "./dealVisuals";

interface DealsKanbanProps {
  pipeline: Pipeline;
  /** Negociações deste funil (já filtradas). */
  deals: DealRow[];
  now: number | null;
  highlightId: string | null;
  onMove: (deal: DealRow, stageId: string, position: number) => void;
  onOpen: (deal: DealRow) => void;
  onAddTask: (deal: DealRow) => void;
  onAddDeal: (stageId: string) => void;
  /** Clicar numa estrela muda a qualificação da negociação. */
  onQualify: (deal: DealRow, stars: number) => void;
}

type Columns = Record<string, string[]>;

const byPosition = (a: DealRow, b: DealRow) => a.position - b.position || (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.id.localeCompare(b.id);

/** Posição entre os vizinhos (fracionária): grava só a negociação arrastada. */
function positionBetween(prev: number | undefined, next: number | undefined): number {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1024;
  if (next !== undefined) return next - 1024;
  return 0;
}

const integer = new Intl.NumberFormat("pt-BR");

/** Quadro Kanban do funil: colunas = etapas (máx. 6); arrastar move a negociação de etapa/ordem. */
export default function DealsKanban({ pipeline, deals, now, highlightId, onMove, onOpen, onAddTask, onAddDeal, onQualify }: DealsKanbanProps) {
  const byId = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const base = useMemo(() => {
    const cols: Columns = Object.fromEntries(pipeline.stages.map((s) => [s.id, [] as string[]]));
    for (const d of [...deals].sort(byPosition)) (cols[d.stage_id ?? ""] ?? cols[pipeline.stages[0].id]).push(d.id);
    return cols;
  }, [deals, pipeline.stages]);

  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  // Funções estáveis para os cards memorizados (só redesenha o card que mudou).
  const open = useStableCallback(onOpen);
  const addTask = useStableCallback(onAddTask);
  const qualify = useStableCallback(onQualify);
  const advance = useStableCallback((d: DealRow) => {
    const i = pipeline.stages.findIndex((s) => s.id === d.stage_id);
    const next = i >= 0 ? pipeline.stages[i + 1] : undefined;
    if (next) onMove(d, next.id, positionBetween(undefined, byId.get(base[next.id]?.[0] ?? "")?.position));
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const columns = dragColumns ?? base;

  const sensors = useSensors(
    // Arrastar só depois de 6px: duplo clique e botões do card continuam funcionando.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Teclado: Espaço pega/solta, setas movem, Esc cancela (Enter fica para abrir a negociação).
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const stageName = (id: string) => pipeline.stages.find((s) => s.id === id)?.name ?? "etapa";
  const containerOf = (id: string, cols: Columns): string | undefined => (id in cols ? id : Object.keys(cols).find((k) => cols[k].includes(id)));
  const nextStage = (deal: DealRow): PipelineStage | null => {
    const i = pipeline.stages.findIndex((s) => s.id === deal.stage_id);
    return i >= 0 && i < pipeline.stages.length - 1 ? pipeline.stages[i + 1] : null;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setDragColumns(base);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDragColumns((cols) => {
      if (!cols) return cols;
      const from = containerOf(String(active.id), cols);
      const to = containerOf(String(over.id), cols);
      if (!from || !to || from === to) return cols;
      const target = cols[to];
      const overIndex = target.indexOf(String(over.id));
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...cols,
        [from]: cols[from].filter((id) => id !== active.id),
        [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
      };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const cols = dragColumns;
    setActiveId(null);
    setDragColumns(null);
    const deal = byId.get(String(active.id));
    if (!cols || !over || !deal) return;
    const stageId = containerOf(String(active.id), cols);
    if (!stageId) return;
    let list = cols[stageId];
    const overIndex = list.indexOf(String(over.id));
    const activeIndex = list.indexOf(deal.id);
    if (overIndex >= 0 && overIndex !== activeIndex) list = arrayMove(list, activeIndex, overIndex);
    const index = list.indexOf(deal.id);
    const original = base[deal.stage_id ?? ""] ?? [];
    if (stageId === deal.stage_id && original.indexOf(deal.id) === index) return; // não mudou nada
    const prev = list[index - 1] ? byId.get(list[index - 1])?.position : undefined;
    const next = list[index + 1] ? byId.get(list[index + 1])?.position : undefined;
    onMove(deal, stageId, positionBetween(prev, next));
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Negociação “${byId.get(String(active.id))?.title}” selecionada. Use as setas para mover e Espaço para soltar.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `“${byId.get(String(active.id))?.title}” fora de uma etapa.`;
      const stage = containerOf(String(over.id), columns);
      return stage ? `Sobre a etapa ${stageName(stage)}.` : "";
    },
    onDragEnd: ({ active, over }) => {
      const stage = over ? containerOf(String(over.id), columns) : undefined;
      return stage ? `“${byId.get(String(active.id))?.title}” solta em ${stageName(stage)}.` : "Movimento cancelado.";
    },
    onDragCancel: () => "Movimento cancelado. A negociação voltou para o lugar.",
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      id="deals-kanban"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setDragColumns(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "Para mover: pressione Espaço, use as setas e Espaço de novo para soltar. Esc cancela. Enter abre a negociação.",
        },
      }}
    >
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-3" role="list" aria-label={`Etapas do funil ${pipeline.name}`}>
        {pipeline.stages.map((stage) => {
          const ids = columns[stage.id] ?? [];
          const stageDeals = ids.map((id) => byId.get(id)).filter((d): d is DealRow => Boolean(d));
          return (
            <Column key={stage.id} stage={stage} deals={stageDeals} pipeline={pipeline} onAddDeal={() => onAddDeal(stage.id)}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {stageDeals.map((deal) => {
                  const next = nextStage(deal);
                  return (
                    <SortableCard key={deal.id} id={deal.id} onEnter={() => open(deal)}>
                      <DealCard
                        deal={deal}
                        now={now}
                        onOpen={open}
                        onAddTask={addTask}
                        onQualify={qualify}
                        onNextStage={next ? advance : null}
                        nextStageName={next?.name ?? null}
                        dragging={deal.id === activeId}
                        highlight={deal.id === highlightId}
                      />
                    </SortableCard>
                  );
                })}
              </SortableContext>
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
        {active ? <DealCard deal={active} now={now} onOpen={() => {}} onAddTask={() => {}} onNextStage={null} nextStageName={null} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ stage, deals, pipeline, onAddDeal, children }: { stage: PipelineStage; deals: DealRow[]; pipeline: Pipeline; onAddDeal: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const { total, weighted } = sumValues(deals, pipeline);
  return (
    <section
      role="listitem"
      aria-label={`${stage.name}: ${deals.length} negociações`}
      className={`flex w-[288px] min-w-[288px] flex-1 flex-col rounded-2xl bg-admin-column outline outline-1 -outline-offset-1 outline-admin-column-border ${
        isOver ? "outline-admin-accent/60" : ""
      }`}
    >
      <header className="flex flex-col gap-1 px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="truncate">{stage.name}</span>
          </h2>
          <span className="flex h-6 min-w-[28px] items-center justify-center rounded-md bg-admin-badge px-2 text-xs font-semibold text-admin-badge-text">{integer.format(deals.length)}</span>
        </div>
        <p className="flex items-baseline justify-between gap-2 text-xs font-medium text-admin-text-description">
          <span className="font-semibold text-admin-text-label">{formatMoneyCompact(total)}</span>
          <span title={`Valor ponderado: valor × ${stage.probability}% de chance nesta etapa`}>
            {stage.probability}% · {formatMoneyCompact(weighted)}
          </span>
        </p>
      </header>
      <div ref={setNodeRef} className="flex max-h-[calc(100vh-420px)] min-h-[120px] flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2">
        {children}
        {!deals.length && <p className="px-2 py-6 text-center text-xs font-medium text-admin-text-hint">Arraste uma negociação para cá.</p>}
      </div>
      <div className="px-2.5 pb-2.5">
        <button
          type="button"
          onClick={onAddDeal}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-admin-text-description transition-colors hover:bg-admin-card hover:text-text-primary focus-visible:outline-2 focus-visible:outline-admin-primary"
        >
          <FaPlus aria-hidden className="h-2.5 w-2.5" />
          Adicionar negociação
        </button>
      </div>
    </section>
  );
}

function SortableCard({ id, onEnter, children }: { id: string; onEnter: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          onEnter();
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary"
    >
      {children}
    </div>
  );
}
