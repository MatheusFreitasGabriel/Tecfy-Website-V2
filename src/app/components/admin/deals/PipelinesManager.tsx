"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FaArrowLeft,
  FaBoxArchive,
  FaChevronRight,
  FaFolder,
  FaFolderOpen,
  FaGripVertical,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaRotateLeft,
  FaTableColumns,
  FaTrash,
} from "react-icons/fa6";
import { customFieldTypes } from "@/lib/admin/crm/options";
import { MAX_CUSTOM_FIELDS, MAX_STAGES, type Board, type CustomField, type Pipeline, type PipelineStage } from "@/lib/admin/crm/types";
import { newLocalId, validateBoardForm, validatePipelineForm, type PipelineForm } from "@/lib/admin/crm/dealValidation";
import type { FieldErrors } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import ConfirmDialog from "../form/ConfirmDialog";
import { Field, Select, TextInput, inputClass } from "../form/Field";
import Modal from "../form/Modal";
import { normalizeSearch } from "../shared/ListControls";

interface PipelinesManagerProps {
  basePath: string;
  boards: Board[];
  pipelines: Pipeline[];
  /** pipelineId → stageId → nº de negociações. */
  counts: Record<string, Record<string, number>>;
  initialPipelineId: string | null;
}

type Selection = { kind: "board"; id: string | null } | { kind: "pipeline"; id: string | null; boardId: string };

interface StageDraft extends Omit<PipelineStage, "probability"> {
  probability: string;
}
interface FieldDraft extends Omit<CustomField, "options"> {
  options: string;
}
interface PipelineDraft {
  board_id: string;
  name: string;
  description: string;
  stages: StageDraft[];
  custom_fields: FieldDraft[];
}

const integer = new Intl.NumberFormat("pt-BR");
const total = (c: Record<string, number> | undefined) => Object.values(c ?? {}).reduce((a, n) => a + n, 0);

/** Modelos para começar um funil novo (dá para editar tudo depois). */
const TEMPLATES: { id: string; name: string; description: string; stages: [string, number][] }[] = [
  { id: "vendas", name: "Vendas B2B", description: "Do primeiro contato à assinatura.", stages: [["Qualificação", 10], ["Diagnóstico", 25], ["Proposta enviada", 50], ["Negociação", 75], ["Fechamento", 90]] },
  { id: "pre", name: "Pré-venda", description: "Esquentar o lead antes do comercial.", stages: [["Novo", 5], ["Contato feito", 15], ["Reunião agendada", 30], ["Qualificado", 50]] },
  { id: "pos", name: "Pós-venda", description: "Implantação e relacionamento com o cliente.", stages: [["Onboarding", 90], ["Implantação", 92], ["Acompanhamento", 95], ["Renovação / upsell", 60]] },
  { id: "branco", name: "Em branco", description: "Três etapas simples para você montar do zero.", stages: [["Etapa 1", 20], ["Etapa 2", 50], ["Etapa 3", 80]] },
];

const draftFromTemplate = (boardId: string, t: (typeof TEMPLATES)[number]): PipelineDraft => ({
  board_id: boardId,
  name: t.id === "branco" ? "" : t.name,
  description: t.id === "branco" ? "" : t.description,
  stages: t.stages.map(([name, probability]) => ({ id: newLocalId(), name, color: "slate", probability: String(probability) })),
  custom_fields: [],
});

const toDraft = (p: Pipeline): PipelineDraft => ({
  board_id: p.board_id,
  name: p.name,
  description: p.description ?? "",
  stages: p.stages.map((s) => ({ ...s, probability: String(s.probability) })),
  custom_fields: p.custom_fields.map((f) => ({ ...f, options: f.options.join("\n") })),
});

const toForm = (d: PipelineDraft): PipelineForm => ({
  board_id: d.board_id,
  name: d.name,
  description: d.description,
  stages: d.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, probability: s.probability.trim() === "" ? "" : Number(s.probability) })),
  custom_fields: d.custom_fields.map((f) => ({ id: f.id, label: f.label, type: f.type, required: f.required, options: f.options.split("\n").map((o) => o.trim()).filter(Boolean) })),
});

const NOTCH = 12;
const chevron = (i: number) =>
  i
    ? `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`
    : `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`;

/** Quadros e funis: lateral com busca + editor com prévia, etapas arrastáveis e campos. Nada é excluído: arquiva. */
export default function PipelinesManager({ basePath, boards: initialBoards, pipelines: initialPipelines, counts, initialPipelineId }: PipelinesManagerProps) {
  const [boards, setBoards] = useState(initialBoards);
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [selection, setSelection] = useState<Selection>(() => {
    const p = initialPipelines.find((x) => x.id === initialPipelineId) ?? initialPipelines.find((x) => !x.archived);
    return p ? { kind: "pipeline", id: p.id, boardId: p.board_id } : { kind: "board", id: null };
  });
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Selection | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const select = (next: Selection) => {
    if (dirty) setPending(next);
    else setSelection(next);
  };

  const visible = useMemo(() => {
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
    const match = (text: string) => terms.every((t) => normalizeSearch(text).includes(t));
    return boards
      .filter((b) => showArchived || !b.archived)
      .map((b) => {
        const list = pipelines.filter((p) => p.board_id === b.id && (showArchived || !p.archived));
        const boardHit = !terms.length || match(`${b.name} ${b.description ?? ""}`);
        return { board: b, pipelines: boardHit ? list : list.filter((p) => match(`${p.name} ${p.description ?? ""} ${p.stages.map((s) => s.name).join(" ")}`)), boardHit };
      })
      .filter((g) => g.boardHit || g.pipelines.length);
  }, [boards, pipelines, showArchived, query]);

  const key = selection.kind === "board" ? `b-${selection.id ?? "new"}` : `p-${selection.id ?? `new-${selection.boardId}`}`;
  const activeBoards = boards.filter((b) => !b.archived);

  return (
    <div className="flex flex-col gap-7">
      <nav aria-label="Caminho">
        <Link href={`${basePath}/negociacoes`} className="inline-flex items-center gap-2 text-sm font-semibold text-admin-accent hover:underline">
          <FaArrowLeft aria-hidden className="h-3 w-3" /> Negociações
        </Link>
      </nav>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[32px] font-semibold leading-[38px] text-text-primary">Quadros e funis</h1>
          <p className="max-w-3xl text-sm font-medium leading-5 text-admin-text-description">
            Um <strong className="text-admin-text-label">quadro</strong> reúne funis de um mesmo assunto. Cada <strong className="text-admin-text-label">funil</strong> tem até {MAX_STAGES} etapas (as colunas do
            Kanban) e pode ter campos próprios. Negociações podem ser movidas entre funis sem perder nada.
          </p>
        </div>
        <Button icon={FaPlus} onClick={() => select({ kind: "board", id: null })}>
          Novo quadro
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Lateral */}
        <aside className="flex flex-col gap-3 xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:self-start xl:overflow-y-auto" aria-label="Quadros e funis">
          <div className="relative">
            <FaMagnifyingGlass aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-hint" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar quadro, funil ou etapa" aria-label="Buscar quadro, funil ou etapa" className={`${inputClass} h-10 pl-9`} />
          </div>

          {visible.map(({ board, pipelines: list }) => {
            const boardActive = selection.kind === "board" && selection.id === board.id;
            return (
              <section key={board.id} className={`flex flex-col rounded-2xl bg-background-kpi outline outline-1 -outline-offset-1 ${boardActive ? "outline-admin-accent/60" : "outline-admin-card-border"}`}>
                <div className="flex items-center gap-2 px-3 pt-3">
                  <FaFolderOpen aria-hidden className="h-3.5 w-3.5 shrink-0 text-admin-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-text-primary">
                      {board.name}
                      {board.archived && <span className="rounded bg-admin-badge px-1.5 py-0.5 text-[10px] font-semibold text-admin-text-hint">Arquivado</span>}
                    </p>
                    {board.description && <p className="truncate text-xs text-admin-text-description">{board.description}</p>}
                  </div>
                  <button type="button" onClick={() => select({ kind: "board", id: board.id })} aria-label={`Editar quadro ${board.name}`} title="Editar quadro" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-admin-text-hint hover:bg-admin-card hover:text-text-primary">
                    <FaPen aria-hidden className="h-3 w-3" />
                  </button>
                </div>
                <ul className="flex flex-col gap-0.5 p-2">
                  {list.map((p) => {
                    const active = selection.kind === "pipeline" && selection.id === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => select({ kind: "pipeline", id: p.id, boardId: p.board_id })}
                          aria-current={active ? "true" : undefined}
                          className="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-admin-card aria-[current=true]:bg-admin-tip"
                        >
                          {active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-admin-primary" />}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 truncate text-[13px] font-semibold text-text-primary">
                              {p.name}
                              {p.archived && <span className="text-[10px] font-semibold text-admin-text-hint">Arquivado</span>}
                            </span>
                            <span className="block truncate text-[11px] font-medium text-admin-text-hint">
                              {p.stages.length} etapas · {integer.format(total(counts[p.id]))} negociações
                            </span>
                          </span>
                          <FaChevronRight aria-hidden className="h-2.5 w-2.5 shrink-0 text-admin-text-hint opacity-0 transition-opacity group-hover:opacity-100 group-aria-[current=true]:opacity-100" />
                        </button>
                      </li>
                    );
                  })}
                  {!board.archived && (
                    <li>
                      <button type="button" onClick={() => select({ kind: "pipeline", id: null, boardId: board.id })} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-admin-accent hover:bg-admin-card">
                        <FaPlus aria-hidden className="h-2.5 w-2.5" /> Novo funil neste quadro
                      </button>
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
          {!visible.length && <p className="px-1 py-4 text-center text-sm text-admin-text-hint">Nada encontrado.</p>}

          <label className="flex cursor-pointer items-center gap-2 px-1 text-xs font-medium text-admin-text-description">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 accent-admin-primary" />
            Mostrar arquivados
          </label>
        </aside>

        {/* Editor */}
        <div key={key} className="min-w-0">
          {selection.kind === "board" ? (
            <BoardEditor
              basePath={basePath}
              board={boards.find((b) => b.id === selection.id) ?? null}
              pipelines={pipelines.filter((p) => p.board_id === selection.id)}
              counts={counts}
              onDirty={setDirty}
              onOpenPipeline={(p) => select({ kind: "pipeline", id: p.id, boardId: p.board_id })}
              onNewPipeline={(boardId) => select({ kind: "pipeline", id: null, boardId })}
              onSaved={(board, created) => {
                setDirty(false);
                setBoards((all) => (created ? [...all, board] : all.map((b) => (b.id === board.id ? board : b))));
                if (created) setSelection({ kind: "pipeline", id: null, boardId: board.id });
                else setSelection({ kind: "board", id: board.id });
                setNotice(created ? `Quadro “${board.name}” criado. Agora crie o primeiro funil dele.` : `Quadro “${board.name}” salvo.`);
              }}
            />
          ) : (
            <PipelineEditor
              basePath={basePath}
              boards={activeBoards}
              pipeline={pipelines.find((p) => p.id === selection.id) ?? null}
              boardId={selection.boardId}
              counts={selection.id ? (counts[selection.id] ?? {}) : {}}
              onDirty={setDirty}
              onSaved={(pipeline, created, moved) => {
                setDirty(false);
                setPipelines((all) => (created ? [...all, pipeline] : all.map((p) => (p.id === pipeline.id ? pipeline : p))));
                setSelection({ kind: "pipeline", id: pipeline.id, boardId: pipeline.board_id });
                setNotice(`${created ? "Funil criado" : pipeline.archived ? "Funil arquivado" : "Funil salvo"}: “${pipeline.name}”.${moved ? ` ${moved} negociação(ões) mudaram de etapa.` : ""}`);
              }}
            />
          )}
        </div>
      </div>

      {notice && (
        <div role="status" className="fixed bottom-6 right-6 z-40 flex max-w-md items-center gap-3 rounded-xl bg-admin-card px-4 py-3 text-sm font-medium text-text-primary shadow-2xl outline outline-1 -outline-offset-1 outline-admin-card-border">
          <span className="flex-1">{notice}</span>
          {selection.kind === "pipeline" && selection.id && (
            <Link href={`${basePath}/negociacoes?funil=${selection.id}`} className="font-semibold text-admin-accent hover:underline">
              Ver no Kanban
            </Link>
          )}
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="text-admin-text-hint hover:text-text-primary">
            ×
          </button>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title="Descartar alterações?"
          message="Você mudou este item e não salvou. Se sair agora, as alterações se perdem."
          confirmLabel="Descartar"
          tone="danger"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setDirty(false);
            setSelection(pending);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}

// ── Quadro ──

function BoardEditor({
  basePath,
  board,
  pipelines,
  counts,
  onDirty,
  onOpenPipeline,
  onNewPipeline,
  onSaved,
}: {
  basePath: string;
  board: Board | null;
  pipelines: Pipeline[];
  counts: Record<string, Record<string, number>>;
  onDirty: (d: boolean) => void;
  onOpenPipeline: (p: Pipeline) => void;
  onNewPipeline: (boardId: string) => void;
  onSaved: (b: Board, created: boolean) => void;
}) {
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const mark = () => {
    setChanged(true);
    onDirty(true);
  };

  const save = async (archived?: boolean) => {
    if (saving) return;
    const parsed = validateBoardForm({ name, description });
    if (archived === undefined && !parsed.ok) return setErrors(parsed.errors);
    setSaving(true);
    setServerError(null);
    try {
      const response = await fetch(board ? `${basePath}/api/crm/boards/${board.id}` : `${basePath}/api/crm/pipelines`, {
        method: board ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(board && archived !== undefined ? { archived } : { board: { name, description } }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setServerError(response.status === 401 ? "Sua sessão expirou. Entre de novo no painel." : response.status === 403 ? "Requisição bloqueada (origem não permitida)." : "Não foi possível salvar. Tente de novo.");
        return;
      }
      setChanged(false);
      if (board) onSaved({ ...board, ...(archived !== undefined ? { archived } : parsed.ok ? parsed.value : {}) }, false);
      else onSaved(((await response.json()) as { board: Board }).board, true);
    } catch {
      setServerError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl bg-background-kpi outline outline-1 -outline-offset-1 outline-admin-card-border">
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-admin-tip">
              <FaFolder aria-hidden className="h-4 w-4 text-admin-accent" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-admin-text-hint">{board ? "Quadro" : "Novo quadro"}</p>
              <h2 className="text-xl font-semibold text-text-primary">{name || "Sem nome"}</h2>
            </div>
          </div>
          {board &&
            (board.archived ? (
              <Button variant="secondary" icon={FaRotateLeft} onClick={() => save(false)} disabled={saving}>
                Restaurar
              </Button>
            ) : (
              <Button variant="secondary" icon={FaBoxArchive} onClick={() => save(true)} disabled={saving} title="Os funis deste quadro somem do Kanban até restaurar.">
                Arquivar
              </Button>
            ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.4fr]">
          <Field label="Nome do quadro" required error={errors.name}>
            {(p) => (
              <TextInput
                {...p}
                autoFocus={!board}
                maxLength={60}
                value={name}
                placeholder="Ex.: Comercial"
                onChange={(e) => {
                  setName(e.target.value);
                  mark();
                }}
              />
            )}
          </Field>
          <Field label="Descrição" error={errors.description} hint="Aparece na lista à esquerda.">
            {(p) => (
              <TextInput
                {...p}
                maxLength={300}
                value={description}
                placeholder="Para que serve este quadro"
                onChange={(e) => {
                  setDescription(e.target.value);
                  mark();
                }}
              />
            )}
          </Field>
        </div>

        {board && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Funis deste quadro</h3>
              {!board.archived && (
                <Button variant="ghost" icon={FaPlus} onClick={() => onNewPipeline(board.id)} className="h-9 px-3 text-[13px]">
                  Novo funil
                </Button>
              )}
            </div>
            {pipelines.length ? (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {pipelines.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => onOpenPipeline(p)} className="flex w-full flex-col gap-3 rounded-xl bg-admin-card p-4 text-left outline outline-1 -outline-offset-1 outline-admin-card-border transition-colors hover:outline-admin-accent/50">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-text-primary">{p.name}</span>
                        <span className="text-[11px] font-medium text-admin-text-hint">{integer.format(total(counts[p.id]))} neg.</span>
                      </span>
                      <ChevronPreview names={p.stages.map((s) => s.name)} compact />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-admin-card px-4 py-6 text-center text-sm text-admin-text-hint">Nenhum funil ainda.</p>
            )}
          </div>
        )}
      </div>
      <SaveBar dirty={changed || !board} saving={saving} serverError={serverError} label={board ? "Salvar quadro" : "Criar quadro"} onSave={() => save()} />
    </section>
  );
}

// ── Funil ──

function PipelineEditor({
  basePath,
  boards,
  pipeline,
  boardId,
  counts,
  onDirty,
  onSaved,
}: {
  basePath: string;
  boards: Board[];
  pipeline: Pipeline | null;
  boardId: string;
  counts: Record<string, number>;
  onDirty: (d: boolean) => void;
  onSaved: (p: Pipeline, created: boolean, moved: number) => void;
}) {
  const [draft, setDraft] = useState<PipelineDraft | null>(() => (pipeline ? toDraft(pipeline) : null));
  const [tab, setTab] = useState<"stages" | "fields">("stages");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [moves, setMoves] = useState<Record<string, string> | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const removedWithDeals = useMemo(() => {
    if (!draft) return [];
    const kept = new Set(draft.stages.map((s) => s.id));
    return (pipeline?.stages ?? []).filter((s) => !kept.has(s.id) && (counts[s.id] ?? 0) > 0);
  }, [draft, pipeline, counts]);

  // Funil novo: escolher um modelo primeiro.
  if (!draft) {
    const board = boards.find((b) => b.id === boardId);
    return (
      <section className="flex flex-col gap-5 rounded-2xl bg-background-kpi p-6 outline outline-1 -outline-offset-1 outline-admin-card-border">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-text-hint">Novo funil{board ? ` · ${board.name}` : ""}</p>
          <h2 className="text-xl font-semibold text-text-primary">Comece por um modelo</h2>
          <p className="text-[13px] text-admin-text-description">Escolha o mais parecido com o que você precisa. Etapas, nomes e % dá para mudar tudo depois.</p>
        </div>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  setDraft(draftFromTemplate(boardId, t));
                  setChanged(true);
                  onDirty(true);
                }}
                className="flex h-full w-full flex-col gap-3 rounded-xl bg-admin-card p-4 text-left outline outline-1 -outline-offset-1 outline-admin-card-border transition-colors hover:outline-admin-accent/60 focus-visible:outline-2 focus-visible:outline-admin-primary"
              >
                <span>
                  <span className="block text-sm font-semibold text-text-primary">{t.name}</span>
                  <span className="block text-xs text-admin-text-description">{t.description}</span>
                </span>
                <ChevronPreview names={t.stages.map(([n]) => n)} compact />
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const update = (fn: (d: PipelineDraft) => PipelineDraft) => {
    setDraft((d) => (d ? fn(d) : d));
    setChanged(true);
    onDirty(true);
  };
  const setStage = (id: string, patch: Partial<StageDraft>) => update((d) => ({ ...d, stages: d.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const setField = (id: string, patch: Partial<FieldDraft>) => update((d) => ({ ...d, custom_fields: d.custom_fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const reorder =
    (list: "stages" | "custom_fields") =>
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      update((d) => {
        const items = d[list] as { id: string }[];
        return { ...d, [list]: arrayMove(items, items.findIndex((x) => x.id === active.id), items.findIndex((x) => x.id === over.id)) };
      });
    };

  const send = async (body: Record<string, unknown>) => {
    setSaving(true);
    setServerError(null);
    try {
      const response = await fetch(pipeline ? `${basePath}/api/crm/pipelines/${pipeline.id}` : `${basePath}/api/crm/pipelines`, {
        method: pipeline ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => ({}))) as { pipeline?: Pipeline; moved?: number; archived?: boolean; fields?: FieldErrors };
      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        setServerError(response.status === 401 ? "Sua sessão expirou. Entre de novo no painel." : response.status === 400 ? "Confira os campos destacados." : "Não foi possível salvar. Tente de novo.");
        return;
      }
      setChanged(false);
      if (typeof data.archived === "boolean" && pipeline) onSaved({ ...pipeline, archived: data.archived }, false, 0);
      else if (data.pipeline) onSaved(data.pipeline, !pipeline, data.moved ?? 0);
    } catch {
      setServerError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSaving(false);
      setMoves(null);
    }
  };

  const save = (stageMoves?: Record<string, string>) => {
    if (saving) return;
    const form = toForm(draft);
    const parsed = validatePipelineForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      if (Object.keys(parsed.errors).some((k) => k.startsWith("field_"))) setTab("fields");
      else if (Object.keys(parsed.errors).some((k) => k.startsWith("stage"))) setTab("stages");
      return;
    }
    setErrors({});
    if (removedWithDeals.length && !stageMoves) {
      setMoves(Object.fromEntries(removedWithDeals.map((s) => [s.id, draft.stages[0].id])));
      return;
    }
    send({ pipeline: form, stage_moves: stageMoves ?? {} });
  };

  const discard = () => {
    setDraft(pipeline ? toDraft(pipeline) : null);
    setErrors({});
    setChanged(false);
    onDirty(false);
  };

  const dealsTotal = total(counts);
  const board = boards.find((b) => b.id === draft.board_id);
  const stageError = Object.entries(errors).find(([k]) => k.startsWith("stage_"))?.[1];

  return (
    <>
      <section className="flex flex-col overflow-hidden rounded-2xl bg-background-kpi outline outline-1 -outline-offset-1 outline-admin-card-border">
        <div className="flex flex-col gap-6 p-6">
          {/* Cabeçalho */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-admin-text-hint">
                {board?.name ?? "Quadro"} › {pipeline ? "Funil" : "Novo funil"}
              </p>
              <h2 className="truncate text-xl font-semibold text-text-primary">{draft.name || "Sem nome"}</h2>
              <p className="text-xs font-medium text-admin-text-description">
                {draft.stages.length}/{MAX_STAGES} etapas · {draft.custom_fields.length} campo(s) · {integer.format(dealsTotal)} negociação(ões)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pipeline && !pipeline.archived && (
                <Link href={`${basePath}/negociacoes?funil=${pipeline.id}`} className="inline-flex h-11 items-center gap-2 rounded-[10px] px-4 text-[13px] font-semibold text-admin-accent outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-card">
                  <FaTableColumns aria-hidden className="h-3.5 w-3.5" /> Ver no Kanban
                </Link>
              )}
              {pipeline &&
                (pipeline.archived ? (
                  <Button variant="secondary" icon={FaRotateLeft} onClick={() => send({ archived: false })} disabled={saving}>
                    Restaurar
                  </Button>
                ) : (
                  <Button variant="secondary" icon={FaBoxArchive} onClick={() => setConfirmArchive(true)} disabled={saving}>
                    Arquivar
                  </Button>
                ))}
            </div>
          </div>

          {/* Detalhes */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Nome do funil" required error={errors.name}>
              {(p) => <TextInput {...p} autoFocus={!pipeline} maxLength={60} value={draft.name} placeholder="Ex.: Pré-venda" onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} />}
            </Field>
            <Field label="Quadro" required error={errors.board_id}>
              {(p) => <Select {...p} options={boards.map((b) => ({ value: b.id, label: b.name }))} value={draft.board_id} onChange={(e) => update((d) => ({ ...d, board_id: e.target.value }))} />}
            </Field>
            <Field label="Descrição" error={errors.description}>
              {(p) => <TextInput {...p} maxLength={300} value={draft.description} placeholder="Quando usar este funil" onChange={(e) => update((d) => ({ ...d, description: e.target.value }))} />}
            </Field>
          </div>

          {/* Prévia */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-admin-text-hint">Prévia do funil</span>
            <ChevronPreview names={draft.stages.map((s) => s.name || "Sem nome")} details={draft.stages.map((s) => `${s.probability || 0}% · ${integer.format(counts[s.id] ?? 0)} neg.`)} />
          </div>

          {/* Abas */}
          <div role="tablist" aria-label="Configuração do funil" className="flex gap-1 border-b border-admin-divider">
            {(
              [
                ["stages", `Etapas (${draft.stages.length}/${MAX_STAGES})`],
                ["fields", `Campos da negociação (${draft.custom_fields.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className="-mb-px h-10 border-b-2 border-transparent px-4 text-sm font-semibold text-admin-text-description hover:text-text-primary aria-selected:border-admin-primary aria-selected:text-text-primary"
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "stages" ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-admin-text-description">Arraste pela alça para reordenar. A % é a chance de fechar a partir da etapa e entra no valor ponderado do Kanban.</p>
              {errors.stages && <p className="text-xs font-medium text-admin-danger">{errors.stages}</p>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder("stages")}>
                <SortableContext items={draft.stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <ol className="flex flex-col gap-2">
                    {draft.stages.map((stage, i) => {
                      const pct = Math.min(100, Number(stage.probability) || 0);
                      return (
                        <SortableRow key={stage.id} id={stage.id} label={`Etapa ${stage.name || i + 1}`}>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-admin-badge text-xs font-semibold text-admin-text-label">{i + 1}</span>
                          <input
                            aria-label={`Nome da etapa ${i + 1}`}
                            aria-invalid={Boolean(errors[`stage_${i}`])}
                            maxLength={40}
                            value={stage.name}
                            placeholder="Nome da etapa"
                            onChange={(e) => setStage(stage.id, { name: e.target.value })}
                            className={`${inputClass} h-10 min-w-0 flex-1`}
                          />
                          <div className="flex w-[150px] shrink-0 items-center gap-2" title="Chance de fechar a partir desta etapa">
                            <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-admin-badge">
                              <div className="h-full rounded-full bg-admin-accent" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="relative w-[64px]">
                              <input
                                aria-label={`Chance de fechar na etapa ${i + 1} (%)`}
                                aria-invalid={Boolean(errors[`stage_${i}_probability`])}
                                inputMode="numeric"
                                value={stage.probability}
                                onChange={(e) => setStage(stage.id, { probability: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                                className={`${inputClass} h-10 pr-6 text-right`}
                              />
                              <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-admin-text-hint">
                                %
                              </span>
                            </span>
                          </div>
                          <span className="hidden w-16 shrink-0 text-right text-[11px] font-medium text-admin-text-hint sm:block" title="Negociações nesta etapa">
                            {integer.format(counts[stage.id] ?? 0)} neg.
                          </span>
                          <button
                            type="button"
                            onClick={() => update((d) => ({ ...d, stages: d.stages.filter((s) => s.id !== stage.id) }))}
                            disabled={draft.stages.length <= 1}
                            aria-label={`Remover etapa ${stage.name || i + 1}`}
                            title={draft.stages.length <= 1 ? "O funil precisa de pelo menos 1 etapa" : "Remover etapa"}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-admin-text-hint hover:bg-admin-badge hover:text-admin-danger disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <FaTrash aria-hidden className="h-3 w-3" />
                          </button>
                        </SortableRow>
                      );
                    })}
                  </ol>
                </SortableContext>
              </DndContext>
              {stageError && <p className="text-xs font-medium text-admin-danger">{stageError}</p>}
              <button
                type="button"
                disabled={draft.stages.length >= MAX_STAGES}
                onClick={() => update((d) => ({ ...d, stages: [...d.stages, { id: newLocalId(), name: "", color: "slate", probability: "50" }] }))}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-admin-card-border text-[13px] font-semibold text-admin-text-description hover:border-admin-accent hover:text-admin-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-admin-card-border disabled:hover:text-admin-text-description"
              >
                <FaPlus aria-hidden className="h-3 w-3" />
                {draft.stages.length >= MAX_STAGES ? `Máximo de ${MAX_STAGES} etapas` : "Adicionar etapa"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-admin-text-description">Informações extras que as negociações deste funil devem ter (ex.: nº de funcionários, sistema atual). Aparecem no cadastro e na página da negociação.</p>
              {errors.custom_fields && <p className="text-xs font-medium text-admin-danger">{errors.custom_fields}</p>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder("custom_fields")}>
                <SortableContext items={draft.custom_fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <ol className="flex flex-col gap-2">
                    {draft.custom_fields.map((field, i) => (
                      <SortableRow key={field.id} id={field.id} label={`Campo ${field.label || i + 1}`} wrap>
                        <input
                          aria-label={`Nome do campo ${i + 1}`}
                          aria-invalid={Boolean(errors[`field_${i}`])}
                          maxLength={40}
                          value={field.label}
                          placeholder="Nome do campo"
                          onChange={(e) => setField(field.id, { label: e.target.value })}
                          className={`${inputClass} h-10 min-w-[160px] flex-1`}
                        />
                        <select aria-label={`Tipo do campo ${i + 1}`} value={field.type} onChange={(e) => setField(field.id, { type: e.target.value as FieldDraft["type"] })} className={`${inputClass} h-10 w-[150px] cursor-pointer`}>
                          {customFieldTypes.options.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-xs font-medium text-admin-text-label">
                          <input type="checkbox" checked={field.required} onChange={(e) => setField(field.id, { required: e.target.checked })} className="h-4 w-4 accent-admin-primary" />
                          Obrigatório
                        </label>
                        <button
                          type="button"
                          onClick={() => update((d) => ({ ...d, custom_fields: d.custom_fields.filter((f) => f.id !== field.id) }))}
                          aria-label={`Remover campo ${field.label || i + 1}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-admin-text-hint hover:bg-admin-badge hover:text-admin-danger"
                        >
                          <FaTrash aria-hidden className="h-3 w-3" />
                        </button>
                        {field.type === "select" && (
                          <textarea
                            aria-label={`Opções do campo ${field.label || i + 1} (uma por linha)`}
                            value={field.options}
                            onChange={(e) => setField(field.id, { options: e.target.value })}
                            placeholder={"Uma opção por linha\nEx.: Até 10\n11 a 50\nMais de 50"}
                            className={`${inputClass} h-20 w-full basis-full resize-y py-2`}
                          />
                        )}
                        {errors[`field_${i}`] && <p className="basis-full text-xs font-medium text-admin-danger">{errors[`field_${i}`]}</p>}
                      </SortableRow>
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
              {!draft.custom_fields.length && <p className="rounded-xl bg-admin-card px-4 py-5 text-center text-sm text-admin-text-hint">Nenhum campo extra. As negociações usam só os campos padrão.</p>}
              <button
                type="button"
                disabled={draft.custom_fields.length >= MAX_CUSTOM_FIELDS}
                onClick={() => update((d) => ({ ...d, custom_fields: [...d.custom_fields, { id: newLocalId(), label: "", type: "text", options: "", required: false }] }))}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-admin-card-border text-[13px] font-semibold text-admin-text-description hover:border-admin-accent hover:text-admin-accent disabled:opacity-40"
              >
                <FaPlus aria-hidden className="h-3 w-3" /> Adicionar campo
              </button>
            </div>
          )}
        </div>
        <SaveBar dirty={changed} saving={saving} serverError={serverError} label={pipeline ? "Salvar funil" : "Criar funil"} onSave={() => save()} onDiscard={pipeline ? discard : undefined} />
      </section>

      {moves && (
        <Modal
          title="Para onde vão as negociações?"
          description="Você removeu etapas que têm negociações. Escolha a etapa que vai recebê-las (fica registrado no histórico de cada uma)."
          onClose={() => !saving && setMoves(null)}
          widthClass="max-w-[560px]"
          closeStyle="boxed"
          titleSize="md"
          footer={
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setMoves(null)} disabled={saving}>
                Voltar
              </Button>
              <Button onClick={() => save(moves)} disabled={saving}>
                {saving ? "Salvando..." : "Mover e salvar"}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            {removedWithDeals.map((s) => (
              <Field key={s.id} label={`“${s.name}” · ${integer.format(counts[s.id] ?? 0)} negociação(ões) vão para`}>
                {(p) => <Select {...p} options={draft.stages.map((d) => ({ value: d.id, label: d.name || "(sem nome)" }))} value={moves[s.id]} onChange={(e) => setMoves((m) => ({ ...m!, [s.id]: e.target.value }))} />}
              </Field>
            ))}
          </div>
        </Modal>
      )}
      {confirmArchive && pipeline && (
        <ConfirmDialog
          title={`Arquivar o funil “${pipeline.name}”?`}
          message={`Ele sai do Kanban e dos seletores. As ${integer.format(dealsTotal)} negociação(ões) continuam guardadas e voltam ao restaurar o funil (ou mova-as antes para outro funil).`}
          confirmLabel="Arquivar"
          busy={saving}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            setConfirmArchive(false);
            send({ archived: true });
          }}
        />
      )}
    </>
  );
}

// ── Peças ──

/** Prévia das etapas em placas (mesmo visual da página da negociação). */
function ChevronPreview({ names, details, compact }: { names: string[]; details?: string[]; compact?: boolean }) {
  return (
    <ol className="flex w-full overflow-hidden" aria-label="Etapas">
      {names.map((name, i) => (
        <li key={`${i}-${name}`} className={`min-w-0 flex-1 ${i ? "-ml-1.5" : ""}`}>
          <span
            style={{ clipPath: chevron(i) }}
            className={`flex w-full flex-col items-center justify-center px-4 text-center ${compact ? "h-8" : "h-14"} ${i === 0 ? "bg-admin-primary text-text-primary" : "bg-admin-badge text-admin-text-label"}`}
          >
            <span className={`max-w-full truncate font-semibold ${compact ? "text-[10px]" : "text-[12px]"}`}>{name}</span>
            {!compact && details?.[i] && <span className="text-[10px] font-medium opacity-75">{details[i]}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Barra de salvar fixa no rodapé do editor ("alterações não salvas"). */
function SaveBar({ dirty, saving, serverError, label, onSave, onDiscard }: { dirty: boolean; saving: boolean; serverError: string | null; label: string; onSave: () => void; onDiscard?: () => void }) {
  return (
    <div className={`sticky bottom-0 flex flex-col gap-2 border-t px-6 py-4 backdrop-blur ${dirty ? "border-admin-accent/40 bg-admin-tip/90" : "border-admin-divider bg-background-kpi/90"}`}>
      {serverError && (
        <p role="alert" className="text-sm font-medium text-admin-danger">
          {serverError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`text-[13px] font-medium ${dirty ? "text-admin-tip-title" : "text-admin-text-hint"}`}>{dirty ? "Alterações não salvas" : "Tudo salvo"}</span>
        <div className="flex gap-2">
          {dirty && onDiscard && (
            <Button variant="secondary" onClick={onDiscard} disabled={saving}>
              Descartar
            </Button>
          )}
          <Button onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Salvando..." : label}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableRow({ id, label, wrap, children }: { id: string; label: string; wrap?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-2.5 rounded-xl bg-admin-card px-2.5 py-2 outline outline-1 -outline-offset-1 outline-admin-card-border ${wrap ? "flex-wrap" : ""} ${isDragging ? "relative z-10 shadow-2xl outline-admin-accent/60" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reordenar: ${label}. Espaço para pegar, setas para mover.`}
        className="inline-flex h-9 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-admin-text-hint hover:bg-admin-badge hover:text-text-primary active:cursor-grabbing"
      >
        <FaGripVertical aria-hidden className="h-3.5 w-3.5" />
      </button>
      {children}
    </li>
  );
}

