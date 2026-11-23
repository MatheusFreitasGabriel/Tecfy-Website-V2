"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FaArrowRightToBracket,
  FaChevronDown,
  FaClock,
  FaDownload,
  FaHandshake,
  FaListUl,
  FaPlus,
  FaSliders,
  FaSquarePollVertical,
  FaTableColumns,
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6";
import { dealQualifications, dealStatuses } from "@/lib/admin/crm/options";
import type { AdminUserOption, Board, DealRow, Pipeline, TaskRow } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import { ReloadButton, SearchInput, matchesSearch } from "../shared/ListControls";
import { formatPhone } from "../leads/leadVisuals";
import DealFormModal from "./DealFormModal";
import DealsKanban from "./DealsKanban";
import DealsList, { type DealBulkAction } from "./DealsList";
import TaskModal from "./TaskModal";
import { dealAlerts, formatMoneyCompact, sumValues, taskCounts, useNow } from "./dealVisuals";
import { exportDealsCsv } from "./exportDealsCsv";

interface DealsViewProps {
  deals: DealRow[];
  truncated: boolean;
  boards: Board[];
  pipelines: Pipeline[];
  admins: AdminUserOption[];
  basePath: string;
  currentUid: string;
  initialPipelineId: string | null;
  initialView: "kanban" | "list";
  /** `?converter=<leadId>` (vindo da tela de Leads): abre a conversão já com o lead. */
  convertLeadId: string | null;
}

type View = "kanban" | "list";
type ModalState = null | { kind: "create"; stageId: string | null } | { kind: "convert"; leadId: string | null } | { kind: "task"; deal: DealRow };

const integer = new Intl.NumberFormat("pt-BR");
const controlClass =
  "h-11 w-full min-w-0 cursor-pointer appearance-none rounded-lg bg-background-kpi pl-3.5 pr-10 text-[13px] font-medium leading-5 text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border focus:outline-2 focus:outline-admin-primary [color-scheme:dark]";

/** Troca parâmetros da URL sem recarregar (funil e visão ficam no link: dá para compartilhar). */
function setUrlParams(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(window.history.state, "", url);
}

/** Tela de Negociações: quadros/funis, indicadores, filtros e Kanban ↔ Lista. */
export default function DealsView({ deals, truncated, boards, pipelines, admins, basePath, currentUid, initialPipelineId, initialView, convertLeadId }: DealsViewProps) {
  const router = useRouter();
  const now = useNow();
  const active = useMemo(() => pipelines.filter((p) => !p.archived && p.stages.length && boards.some((b) => b.id === p.board_id && !b.archived)), [pipelines, boards]);
  const [pipelineId, setPipelineId] = useState(() => (active.some((p) => p.id === initialPipelineId) ? initialPipelineId! : (active[0]?.id ?? "")));
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState("");
  const [qualification, setQualification] = useState("");
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(false);
  const [attention, setAttention] = useState(false);
  const [modal, setModal] = useState<ModalState>(() => (convertLeadId ? { kind: "convert", leadId: convertLeadId } : null));
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error"; href?: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloading, startReload] = useTransition();

  // Camada local sobre a lista do servidor (sem recarregar após cada ação).
  const [base, setBase] = useState(deals);
  const [added, setAdded] = useState<DealRow[]>([]);
  const [patches, setPatches] = useState<Record<string, Partial<DealRow>>>({});
  if (base !== deals) {
    setBase(deals);
    setAdded([]);
    setPatches({});
  }
  const rows = useMemo(() => {
    const ids = new Set(deals.map((d) => d.id));
    return [...added.filter((d) => !ids.has(d.id)), ...deals].map((d) => (patches[d.id] ? { ...d, ...patches[d.id] } : d));
  }, [deals, added, patches]);

  const pipeline = active.find((p) => p.id === pipelineId) ?? null;
  const board = boards.find((b) => b.id === pipeline?.board_id) ?? null;
  const boardOptions = boards.filter((b) => !b.archived && active.some((p) => p.board_id === b.id));
  const pipelineRows = useMemo(() => rows.filter((d) => d.pipeline_id === pipelineId), [rows, pipelineId]);

  const filtered = useMemo(
    () =>
      pipelineRows.filter((d) => {
        if (status && d.status !== status) return false;
        if (qualification && d.qualification !== Number(qualification)) return false;
        if (people.startsWith("o:") && d.owner_uid !== people.slice(2)) return false;
        if (people.startsWith("c:") && d.created_by_uid !== people.slice(2)) return false;
        if (mine && d.owner_uid !== currentUid) return false;
        if (attention && !dealAlerts(d, now).any) return false;
        const phone = d.contact?.phone ?? "";
        return matchesSearch(query, d.title, d.contact?.name, d.contact?.email, phone, phone && formatPhone(phone), d.company?.name, d.company?.cnpj, d.owner_name, d.context);
      }),
    [pipelineRows, status, qualification, people, mine, attention, now, query, currentUid],
  );

  // Kanban = só as abertas; vendidas/perdidas ficam na Lista.
  const openDeals = filtered.filter((d) => d.status === "em_andamento" || d.status === "pausada");
  const won = filtered.filter((d) => d.status === "vendida");
  const lost = filtered.filter((d) => d.status === "perdida");
  const values = sumValues(openDeals, pipeline);
  const wonValue = won.reduce((sum, d) => sum + (d.value_cents ?? 0), 0);
  const tasks = taskCounts(filtered, now);
  const filtersOn = Boolean(query || people || qualification || status || mine || attention);

  const flash = (text: string, tone: "ok" | "error" = "ok", href?: string) => setNotice({ text, tone, href });
  const highlight = (id: string) => {
    setHighlightId(id);
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 4000);
  };
  const patch = (id: string, p: Partial<DealRow>) => setPatches((all) => ({ ...all, [id]: { ...all[id], ...p } }));

  const choosePipeline = (id: string) => {
    setPipelineId(id);
    setUrlParams({ funil: id });
  };
  const chooseView = (v: View) => {
    setView(v);
    setUrlParams({ visao: v === "list" ? "lista" : null });
  };
  const openDeal = (deal: DealRow) => router.push(`${basePath}/negociacoes/${deal.id}`);

  const onMove = async (deal: DealRow, stageId: string, position: number) => {
    const before = patches[deal.id];
    const stageChanged = stageId !== deal.stage_id;
    patch(deal.id, { stage_id: stageId, position, updated_at: new Date().toISOString(), ...(stageChanged ? { stage_entered_at: new Date().toISOString() } : {}) });
    try {
      const response = await fetch(`${basePath}/api/crm/deals/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: deal.id, stage_id: stageId, position, version: deal.version }),
        credentials: "same-origin",
      });
      if (!response.ok) throw response;
      const { move } = (await response.json()) as { move: { version: number; updated_at: string; stage_entered_at: string | null } };
      patch(deal.id, { version: move.version, updated_at: move.updated_at, stage_entered_at: move.stage_entered_at });
    } catch (error) {
      setPatches((all) => {
        const next = { ...all };
        if (before) next[deal.id] = before;
        else delete next[deal.id];
        return next;
      });
      const status = error instanceof Response ? error.status : 0;
      flash(
        status === 401
          ? "Sua sessão expirou. Entre de novo no painel."
          : status === 409
            ? "O funil mudou enquanto você arrastava. Atualize a lista."
            : status === 404
              ? "Esta negociação não existe mais."
              : `Não foi possível mover “${deal.title}”. Ela voltou para o lugar.`,
        "error",
      );
    }
  };

  const onBulk = async (action: DealBulkAction, value: string, ids: string[]): Promise<boolean> => {
    if (!ids.length || busy) return false;
    setBusy(true);
    try {
      const response = await fetch(`${basePath}/api/crm/deals/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, value }),
        credentials: "same-origin",
      });
      if (!response.ok) throw response;
      const data = (await response.json()) as { ids: string[]; owner: { uid: string; name: string } | null };
      const stamp = new Date().toISOString();
      const [targetPipeline, targetStage] = value.split(":");
      const change: Partial<DealRow> =
        action === "set_pipeline"
          ? { pipeline_id: targetPipeline, board_id: active.find((p) => p.id === targetPipeline)?.board_id ?? null, stage_id: targetStage, position: -Date.now(), stage_entered_at: stamp }
          : action === "set_stage"
          ? { stage_id: value, position: -Date.now(), stage_entered_at: stamp }
          : action === "set_status"
            ? { status: value as DealRow["status"] }
            : action === "set_owner"
              ? { owner_uid: data.owner?.uid ?? value, owner_name: data.owner?.name ?? null }
              : { qualification: Number(value) };
      setPatches((all) => {
        const next = { ...all };
        for (const id of data.ids) next[id] = { ...next[id], ...change, updated_at: stamp };
        return next;
      });
      flash(
        data.ids.length && action === "set_pipeline"
          ? `${data.ids.length} negociação(ões) movida(s) para “${active.find((p) => p.id === targetPipeline)?.name}”.`
          : data.ids.length
            ? `${data.ids.length} negociação(ões) atualizada(s).` : "Nada para mudar: as selecionadas já estavam assim.");
      return true;
    } catch (error) {
      flash(error instanceof Response && error.status === 401 ? "Sua sessão expirou. Entre de novo no painel." : "Não foi possível aplicar a ação. Tente de novo.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Estrela clicada no card/lista: aplica na hora, grava, e volta se falhar. */
  const onQualify = async (deal: DealRow, stars: number) => {
    const previous = deal.qualification;
    patch(deal.id, { qualification: stars, updated_at: new Date().toISOString() });
    try {
      const response = await fetch(`${basePath}/api/crm/deals/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [deal.id], action: "set_qualification", value: String(stars) }),
        credentials: "same-origin",
      });
      if (!response.ok) throw response;
    } catch (error) {
      patch(deal.id, { qualification: previous });
      flash(error instanceof Response && error.status === 401 ? "Sua sessão expirou. Entre de novo no painel." : `Não foi possível mudar a qualificação de “${deal.title}”.`, "error");
    }
  };

  const onSaved = (deal: DealRow, openKanban: boolean) => {
    const converted = modal?.kind === "convert";
    setAdded((a) => [deal, ...a.filter((d) => d.id !== deal.id)]);
    setModal(null);
    if (convertLeadId) setUrlParams({ converter: null });
    if (openKanban || deal.pipeline_id === pipelineId) {
      if (deal.pipeline_id && deal.pipeline_id !== pipelineId) choosePipeline(deal.pipeline_id);
      if (openKanban) chooseView("kanban");
      highlight(deal.id);
    }
    flash(converted ? `Lead convertido: “${deal.title}” está no funil.` : `Negociação “${deal.title}” criada.`, "ok", `${basePath}/negociacoes/${deal.id}`);
  };

  const onTaskCreated = (task: TaskRow) => {
    if (task.deal_id) {
      const current = rows.find((d) => d.id === task.deal_id);
      if (current) patch(current.id, { task_due: [...current.task_due, task.due_at].sort() });
    }
    setModal(null);
    flash(`Tarefa “${task.title}” criada.`);
  };

  const clearFilters = () => {
    setQuery("");
    setPeople("");
    setQualification("");
    setStatus("");
    setMine(false);
    setAttention(false);
  };

  if (!pipeline) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-background-kpi px-6 py-20 text-center outline outline-1 -outline-offset-1 outline-admin-card-border">
        <FaHandshake aria-hidden className="h-8 w-8 text-admin-accent" />
        <h1 className="text-2xl font-semibold text-text-primary">Nenhum funil ativo</h1>
        <p className="max-w-md text-sm text-admin-text-description">Crie um quadro e um funil (com até 6 etapas) para começar a organizar as negociações.</p>
        <Link href={`${basePath}/negociacoes/funis`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-admin-primary px-6 text-sm font-semibold text-admin-primary-text hover:bg-admin-primary-hover">
          <FaSliders aria-hidden className="h-3.5 w-3.5" /> Gerenciar funis
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Topo */}
      <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-center gap-4">
            <h1 className="text-[32px] font-semibold leading-[38px] text-text-primary">Negociações</h1>
            <span
              aria-label={`${integer.format(pipelineRows.length)} negociações neste funil`}
              className="flex h-7 min-w-[38px] items-center justify-center rounded-lg bg-admin-badge px-2.5 text-sm font-semibold text-admin-badge-text"
            >
              {integer.format(pipelineRows.length)}
            </span>
          </div>
          <p className="text-sm font-medium leading-5 text-admin-text-description">Acompanhe cada negociação pelo funil, das primeiras conversas até a venda.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-4">
          <Button variant="secondary" icon={FaArrowRightToBracket} onClick={() => setModal({ kind: "convert", leadId: null })} className="!bg-background-kpi !outline-admin-picker-border">
            Converter lead
          </Button>
          <Button icon={FaPlus} onClick={() => setModal({ kind: "create", stageId: null })}>
            Criar negociação
          </Button>
        </div>
      </header>

      {/* Quadro / funil / visão */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <PlainSelect label="Quadro" value={board?.id ?? ""} onChange={(id) => choosePipeline(active.find((p) => p.board_id === id)?.id ?? pipelineId)}>
            {boardOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </PlainSelect>
          <PlainSelect label="Funil" value={pipelineId} onChange={choosePipeline}>
            {active
              .filter((p) => p.board_id === board?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </PlainSelect>
          <Link
            href={`${basePath}/negociacoes/funis?funil=${pipelineId}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-admin-accent outline outline-1 -outline-offset-1 outline-admin-picker-border transition-colors hover:bg-admin-card"
          >
            <FaSliders aria-hidden className="h-3.5 w-3.5" /> Gerenciar funis
          </Link>
        </div>
        <div role="tablist" aria-label="Visualização" className="inline-flex h-11 self-start rounded-lg bg-background-kpi p-1 outline outline-1 -outline-offset-1 outline-admin-picker-border lg:self-auto">
          {(
            [
              ["kanban", "Kanban", FaTableColumns],
              ["list", "Lista", FaListUl],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => chooseView(value)}
              className="inline-flex items-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-admin-text-description transition-colors aria-selected:bg-admin-primary aria-selected:text-admin-primary-text hover:text-text-primary"
            >
              <Icon aria-hidden className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi icon={FaHandshake} label="Negociações abertas" value={integer.format(openDeals.length)} detail={`${integer.format(won.length)} vendidas · ${integer.format(lost.length)} perdidas`} />
        <Kpi icon={FaSquarePollVertical} label="Valor em aberto" value={formatMoneyCompact(values.total)} detail={`Ponderado ${formatMoneyCompact(values.weighted)} · Vendido ${formatMoneyCompact(wonValue)}`} />
        <Kpi icon={FaClock} label="Tarefas para hoje" value={now === null ? "—" : integer.format(tasks.today)} detail="Ainda no horário" />
        <Kpi icon={FaTriangleExclamation} label="Tarefas atrasadas" value={now === null ? "—" : integer.format(tasks.overdue)} detail={tasks.overdue ? "Precisam de atenção" : "Tudo em dia"} danger={tasks.overdue > 0} />
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar negociação, contato, empresa, telefone, e-mail ou CNPJ" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:flex xl:w-auto">
            <PlainSelect label="Responsável" hideLabel value={people} onChange={setPeople} className="xl:w-[210px]">
              <option value="">Todos os responsáveis</option>
              <optgroup label="Responsável pela negociação">
                {admins.map((a) => (
                  <option key={a.uid} value={`o:${a.uid}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Criadas por">
                {admins.map((a) => (
                  <option key={a.uid} value={`c:${a.uid}`}>
                    Criadas por {a.name}
                  </option>
                ))}
              </optgroup>
            </PlainSelect>
            <PlainSelect label="Qualificação" hideLabel value={qualification} onChange={setQualification} className="xl:w-[190px]">
              <option value="">Todas as qualificações</option>
              {dealQualifications.options.map((q) => (
                <option key={q.value} value={q.value}>
                  {"★".repeat(Number(q.value))} {q.hint}
                </option>
              ))}
            </PlainSelect>
            <PlainSelect
              label="Status"
              hideLabel
              value={status}
              onChange={(value) => {
                setStatus(value);
                // Vendidas/perdidas não ficam no Kanban: mostra na Lista.
                if ((value === "vendida" || value === "perdida") && view === "kanban") chooseView("list");
              }}
              className="xl:w-[170px]"
            >
              <option value="">Todos os status</option>
              {dealStatuses.options.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </PlainSelect>
          </div>
          <div className="flex gap-3">
            <ReloadButton reloading={reloading} onClick={() => startReload(() => router.refresh())} />
            <button
              type="button"
              onClick={() => exportDealsCsv(filtered, pipeline, `negociacoes-${pipeline.name.toLowerCase().replace(/\s+/g, "-")}.csv`)}
              aria-label="Exportar CSV"
              title="Exportar as negociações filtradas (CSV)"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-background-kpi text-text-primary outline outline-1 -outline-offset-1 outline-admin-picker-border hover:bg-admin-card"
            >
              <FaDownload aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip pressed={mine} onClick={() => setMine((v) => !v)}>
            Minhas negociações
          </Chip>
          <Chip pressed={attention} onClick={() => setAttention((v) => !v)} tone="warning">
            <FaTriangleExclamation aria-hidden className="h-3 w-3" /> Precisam de atenção
          </Chip>
          {filtersOn && (
            <button type="button" onClick={clearFilters} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-admin-text-description hover:text-text-primary">
              <FaXmark aria-hidden className="h-3 w-3" /> Limpar filtros
            </button>
          )}
          {filtersOn && (
            <span className="text-xs font-medium text-admin-text-hint" aria-live="polite">
              {integer.format(filtered.length)} de {integer.format(pipelineRows.length)}
            </span>
          )}
        </div>
      </div>

      {truncated && (
        <p className="rounded-lg bg-admin-tip px-4 py-3 text-sm text-admin-tip-text">Mostrando as negociações mais recentes. As mais antigas não aparecem nesta tela.</p>
      )}

      {view === "kanban" && (won.length > 0 || lost.length > 0) && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-admin-text-description">
          O Kanban mostra só as negociações abertas.
          <span className="text-admin-deal-won-text">{integer.format(won.length)} vendida(s)</span>·
          <span className="text-admin-deal-lost-text">{integer.format(lost.length)} perdida(s)</span>
          neste funil —
          <button type="button" onClick={() => chooseView("list")} className="font-semibold text-admin-accent hover:underline">
            ver na Lista
          </button>
        </p>
      )}

      {view === "kanban" ? (
        <DealsKanban
          pipeline={pipeline}
          deals={openDeals}
          now={now}
          highlightId={highlightId}
          onMove={onMove}
          onOpen={openDeal}
          onAddTask={(deal) => setModal({ kind: "task", deal })}
          onAddDeal={(stageId) => setModal({ kind: "create", stageId })}
          onQualify={onQualify}
        />
      ) : (
        <DealsList
          deals={filtered}
          pipeline={pipeline}
          otherPipelines={active.filter((p) => p.id !== pipeline.id)}
          admins={admins}
          now={now}
          busy={busy}
          onOpen={openDeal}
          onAddTask={(deal) => setModal({ kind: "task", deal })}
          onBulk={onBulk}
          onQualify={onQualify}
          onExport={(list) => exportDealsCsv(list, pipeline, "negociacoes-selecionadas.csv")}
        />
      )}

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`fixed bottom-6 right-6 z-40 flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl outline outline-1 -outline-offset-1 ${
            notice.tone === "error" ? "bg-admin-deal-lost text-admin-deal-lost-text outline-admin-danger/40" : "bg-admin-card text-text-primary outline-admin-card-border"
          }`}
        >
          <span className="flex-1">
            {notice.text}{" "}
            {notice.href && (
              <Link href={notice.href} className="font-semibold text-admin-accent hover:underline">
                Abrir
              </Link>
            )}
          </span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="text-admin-text-hint hover:text-text-primary">
            <FaXmark aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {(modal?.kind === "create" || modal?.kind === "convert") && (
        <DealFormModal
          mode={modal.kind}
          basePath={basePath}
          admins={admins}
          currentUid={currentUid}
          boards={boards}
          pipelines={active}
          initialPipelineId={pipelineId}
          initialStageId={modal.kind === "create" ? modal.stageId : null}
          initialLeadId={modal.kind === "convert" ? modal.leadId : null}
          onClose={() => {
            setModal(null);
            if (convertLeadId) setUrlParams({ converter: null });
          }}
          onSaved={onSaved}
        />
      )}
      {modal?.kind === "task" && (
        <TaskModal basePath={basePath} deal={modal.deal} admins={admins} currentUid={currentUid} onClose={() => setModal(null)} onCreated={onTaskCreated} />
      )}
    </div>
  );
}

function PlainSelect({ label, hideLabel, value, onChange, className = "sm:w-[220px]", children }: { label: string; hideLabel?: boolean; value: string; onChange: (v: string) => void; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className={hideLabel ? "sr-only" : "text-xs font-medium leading-[18px] text-admin-text-description"}>{label}</span>
      <span className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={controlClass}>
          {children}
        </select>
        <FaChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-description" />
      </span>
    </label>
  );
}

function Kpi({ icon: Icon, label, value, detail, danger }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <div role="group" aria-label={label} className={`border p-1.5 transition-colors ${danger ? "border-admin-danger/40" : "border-border-primary hover:border-border-secondary"}`}>
      <div className="flex h-full flex-col gap-3 bg-background-secondary p-5">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
          <Icon aria-hidden className={`h-3 w-3 ${danger ? "text-admin-danger" : "text-white/60"}`} />
          {label}
        </span>
        <span className={`text-[30px] font-medium leading-8 tracking-tight ${danger ? "text-admin-danger" : "text-text-primary"}`}>{value}</span>
        <span className="text-xs text-white/40">{detail}</span>
      </div>
    </div>
  );
}

function Chip({ pressed, onClick, tone, children }: { pressed: boolean; onClick: () => void; tone?: "warning"; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold outline outline-1 -outline-offset-1 transition-colors ${
        pressed
          ? tone === "warning"
            ? "bg-admin-qual-hot text-admin-qual-hot-text outline-admin-qual-hot-text/40"
            : "bg-admin-tip text-admin-tip-title outline-admin-accent/50"
          : "text-admin-text-label outline-admin-card-border hover:bg-admin-card"
      }`}
    >
      {children}
    </button>
  );
}
