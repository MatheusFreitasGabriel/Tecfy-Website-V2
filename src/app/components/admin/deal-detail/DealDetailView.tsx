"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaArrowLeft, FaArrowRightArrowLeft, FaBuilding, FaCheck, FaChevronRight, FaEllipsis, FaPause, FaPen, FaPlay, FaPlus, FaRotateLeft, FaTrash, FaTrophy, FaUser, FaXmark } from "react-icons/fa6";
import { dealOrigins, lostReasons } from "@/lib/admin/crm/options";
import type { AdminUserOption, Board, DealDetail, DealFileRow, DealHistoryRow, MessageTemplate, Pipeline, TaskRow } from "@/lib/admin/crm/types";
import type { DealChanges } from "@/lib/admin/crm/dealValidation";
import Button from "../form/Button";
import ConfirmDialog from "../form/ConfirmDialog";
import EmailComposer from "../leads/EmailComposer";
import TemplatesManager from "../leads/TemplatesManager";
import WhatsAppComposer from "../leads/WhatsAppComposer";
import { formatCalendarDate, formatDate } from "../leads/leadVisuals";
import TaskModal from "../deals/TaskModal";
import { DealStatusBadge, formatMoney, useNow } from "../deals/dealVisuals";
import { EditDealModal, LinkModal, LostModal, MovePipelineModal, PauseModal, WonModal } from "./DealModals";
import FilesTab from "./FilesTab";
import HistoryTab from "./HistoryTab";
import OverviewTab from "./OverviewTab";
import StageStepper from "./StageStepper";
import TasksTab from "./TasksTab";
import { apiErrorMessage, callApi } from "./dealApi";

interface DealDetailViewProps {
  deal: DealDetail;
  history: DealHistoryRow[];
  /** false = a página trouxe só os mais recentes (há mais para carregar). */
  historyComplete: boolean;
  tasks: TaskRow[];
  files: DealFileRow[];
  boards: Board[];
  pipeline: Pipeline;
  /** Funis ativos (para "Mover para outro funil"). */
  pipelines: Pipeline[];
  admins: AdminUserOption[];
  templates: MessageTemplate[];
  basePath: string;
  currentUid: string;
  storageConfigured: boolean;
  emailConfigured: boolean;
}

type Tab = "overview" | "history" | "tasks" | "files";
type ModalState =
  | null
  | { kind: "task" }
  | { kind: "edit" }
  | { kind: "won" }
  | { kind: "lost" }
  | { kind: "reopen" }
  | { kind: "link"; target: "contact" | "company" }
  | { kind: "whatsapp" }
  | { kind: "email"; to: "contact" | "company" }
  | { kind: "templates"; channel: "whatsapp" | "email" }
  | { kind: "pause" }
  | { kind: "movePipeline" }
  | { kind: "delete" }
  | { kind: "editTask"; task: TaskRow };

/** Página da negociação: cabeçalho, etapas, abas (visão geral, histórico, tarefas, arquivos) e ações. */
export default function DealDetailView(props: DealDetailViewProps) {
  const { boards, pipeline, admins, basePath, currentUid, storageConfigured, emailConfigured } = props;
  const router = useRouter();
  const now = useNow();
  const [deal, setDeal] = useState(props.deal);
  const [history, setHistory] = useState(props.history);
  const [historyComplete, setHistoryComplete] = useState(props.historyComplete);
  const [tasks, setTasks] = useState(props.tasks);
  const [files, setFiles] = useState(props.files);
  const [templates, setTemplates] = useState(props.templates);
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  // Dados novos do servidor (router.refresh) substituem os locais.
  const [base, setBase] = useState(props.deal);
  if (base !== props.deal) {
    setBase(props.deal);
    setDeal(props.deal);
    setHistory(props.history);
    setHistoryComplete(props.historyComplete);
    setTasks(props.tasks);
    setFiles(props.files);
  }

  const board = boards.find((b) => b.id === pipeline.board_id);
  const closed = deal.status === "vendida" || deal.status === "perdida";
  const flash = (text: string, tone: "ok" | "error" = "ok") => setNotice({ text, tone });
  const url = (suffix = "") => `${basePath}/api/crm/deals/${deal.id}${suffix}`;

  /** Depois de uma ação: busca só os registros mais recentes e junta com os que já estão na tela. */
  const reloadHistory = async () => {
    try {
      const { ok, data } = await callApi<{ history: DealHistoryRow[] }>(url("/history?limit=15"), "GET");
      if (!ok) return;
      setHistory((current) => {
        const ids = new Set(data.history.map((h) => h.id));
        return [...data.history, ...current.filter((h) => !ids.has(h.id))].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      });
    } catch {
      /* o histórico é recarregado na próxima ação */
    }
  };

  /** Histórico completo (exportar / rolar até o início). */
  const loadFullHistory = async (): Promise<DealHistoryRow[]> => {
    if (historyComplete) return history;
    const { ok, data } = await callApi<{ history: DealHistoryRow[] }>(url("/history?limit=500"), "GET");
    if (!ok) throw new Error("Não foi possível carregar o histórico completo.");
    setHistory(data.history);
    setHistoryComplete(true);
    return data.history;
  };

  /** Envia alterações (com a versão conhecida). Devolve true se salvou. */
  const save = async (changes: DealChanges | Record<string, unknown>, success?: string): Promise<boolean | Record<string, string>> => {
    if (busy) return false;
    setBusy(true);
    try {
      const { ok, status, data } = await callApi<{ deal: DealDetail }>(url(), "PATCH", { version: deal.version, changes });
      if (!ok) {
        if (data.fields) return data.fields;
        flash(apiErrorMessage(status, data.error), "error");
        if (data.error === "stale") router.refresh();
        return false;
      }
      setDeal(data.deal);
      void reloadHistory();
      if (success) flash(success);
      return true;
    } catch {
      flash("Sem conexão com o servidor. Tente de novo.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Venda / perda / reabrir. */
  const close = async (action: "won" | "lost" | "reopen" | "pause" | "resume", body: Record<string, unknown>, success: string): Promise<boolean | Record<string, string>> => {
    setBusy(true);
    try {
      const { ok, status, data } = await callApi<{ deal: DealDetail }>(url(`/${action}`), "POST", body);
      if (!ok) {
        if (data.fields) return data.fields;
        flash(apiErrorMessage(status, data.error), "error");
        return false;
      }
      setDeal(data.deal);
      void reloadHistory();
      flash(success);
      return true;
    } catch {
      flash("Sem conexão com o servidor. Tente de novo.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const logActivity = async (kind: "whatsapp" | "note" | "call", text: string): Promise<boolean> => {
    try {
      const { ok, status, data } = await callApi<{ entry: DealHistoryRow }>(url("/history"), "POST", { kind, text });
      if (!ok) {
        flash(apiErrorMessage(status, data.error), "error");
        return false;
      }
      setHistory((h) => [data.entry, ...h]);
      return true;
    } catch {
      flash("Sem conexão com o servidor. Tente de novo.", "error");
      return false;
    }
  };

  const setTaskDone = async (task: TaskRow, done: boolean) => {
    setTasks((all) => all.map((t) => (t.id === task.id ? { ...t, done_at: done ? new Date().toISOString() : null } : t)));
    try {
      const { ok, status, data } = await callApi<{ task: TaskRow }>(`${basePath}/api/crm/tasks/${task.id}`, "PATCH", { done });
      if (!ok) throw new Error(apiErrorMessage(status, data.error));
      setTasks((all) => all.map((t) => (t.id === task.id ? data.task : t)));
      void reloadHistory();
    } catch (error) {
      setTasks((all) => all.map((t) => (t.id === task.id ? task : t)));
      flash(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa.", "error");
    }
  };

  const movePipeline = async (pipelineId: string, stageId: string) => {
    setBusy(true);
    try {
      const { ok, status, data } = await callApi<{ deal: DealDetail }>(url("/pipeline"), "POST", { pipeline_id: pipelineId, stage_id: stageId, version: deal.version });
      if (!ok) {
        flash(apiErrorMessage(status, data.error), "error");
        if (data.error === "stale") router.refresh();
        return;
      }
      setModal(null);
      setDeal(data.deal);
      flash(`Negociação movida para o funil “${props.pipelines.find((p) => p.id === pipelineId)?.name}”.`);
      // A página recarrega com o funil novo (etapas, caminho e campos).
      router.refresh();
    } catch {
      flash("Sem conexão com o servidor. Tente de novo.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeDeal = async () => {
    setBusy(true);
    try {
      const { ok, status, data } = await callApi(url(), "DELETE", {});
      if (!ok) {
        flash(apiErrorMessage(status, data.error), "error");
        setModal(null);
        return;
      }
      router.push(`${basePath}/negociacoes?funil=${pipeline.id}`);
      router.refresh();
    } catch {
      flash("Sem conexão com o servidor. Tente de novo.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeTask = async (task: TaskRow) => {
    const before = tasks;
    setTasks((all) => all.filter((t) => t.id !== task.id));
    try {
      const { ok, status, data } = await callApi(`${basePath}/api/crm/tasks/${task.id}`, "DELETE", {});
      if (!ok) throw new Error(apiErrorMessage(status, data.error));
      void reloadHistory();
      flash(`Tarefa “${task.title}” excluída.`);
    } catch (error) {
      setTasks(before);
      flash(error instanceof Error ? error.message : "Não foi possível excluir a tarefa.", "error");
    }
  };

  const contact = deal.contact_info;
  const company = deal.company_info;
  const templateContext = { name: contact?.name ?? deal.title, company: company?.name ?? null, plan: deal.interest_plan ? `plano ${deal.interest_plan}` : null, owner: deal.owner_name };
  const openTasks = tasks.filter((t) => !t.done_at);

  return (
    <div className="flex flex-col gap-6">
      {/* Caminho */}
      <nav aria-label="Caminho" className="flex flex-wrap items-center gap-2 text-sm font-medium text-admin-text-description">
        <Link href={`${basePath}/negociacoes?funil=${pipeline.id}`} className="inline-flex items-center gap-2 font-semibold text-admin-accent hover:underline">
          <FaArrowLeft aria-hidden className="h-3 w-3" /> Negociações
        </Link>
        <FaChevronRight aria-hidden className="h-2.5 w-2.5 text-admin-text-hint" />
        <span>{board?.name ?? "Quadro"}</span>
        <FaChevronRight aria-hidden className="h-2.5 w-2.5 text-admin-text-hint" />
        <Link href={`${basePath}/negociacoes?funil=${pipeline.id}`} className="hover:text-text-primary">
          {pipeline.name}
        </Link>
      </nav>

      {/* Cabeçalho */}
      <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <DealStatusBadge status={deal.status} />
            <span className="inline-flex h-6 items-center rounded-md bg-admin-badge px-2 text-[11px] font-semibold text-admin-badge-text">{dealOrigins.label(deal.origin)}</span>
          </div>
          <h1 className="break-words text-[32px] font-semibold leading-[38px] text-text-primary">{deal.title}</h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-admin-text-description">
            {company ? (
              <Link href={`${basePath}/empresas/${company.id}`} className="inline-flex items-center gap-1.5 hover:text-admin-accent">
                <FaBuilding aria-hidden className="h-3 w-3" /> {company.name}
              </Link>
            ) : (
              <button type="button" onClick={() => setModal({ kind: "link", target: "company" })} className="inline-flex items-center gap-1.5 text-admin-accent hover:underline">
                <FaPlus aria-hidden className="h-2.5 w-2.5" /> Vincular empresa
              </button>
            )}
            {contact ? (
              <Link href={`${basePath}/contatos/${contact.id}`} className="inline-flex items-center gap-1.5 hover:text-admin-accent">
                <FaUser aria-hidden className="h-3 w-3" /> {contact.name}
              </Link>
            ) : (
              <button type="button" onClick={() => setModal({ kind: "link", target: "contact" })} className="inline-flex items-center gap-1.5 text-admin-accent hover:underline">
                <FaPlus aria-hidden className="h-2.5 w-2.5" /> Vincular contato
              </button>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Button variant="secondary" icon={FaPlus} onClick={() => setModal({ kind: "task" })}>
            Criar tarefa
          </Button>
          {closed ? (
            <Button variant="secondary" icon={FaRotateLeft} onClick={() => setModal({ kind: "reopen" })} disabled={busy}>
              {deal.status === "vendida" ? "Desfazer venda" : "Reabrir negociação"}
            </Button>
          ) : (
            <>
              {deal.status === "pausada" ? (
                <Button variant="secondary" icon={FaPlay} onClick={() => close("resume", {}, "Negociação retomada.")} disabled={busy}>
                  Retomar
                </Button>
              ) : (
                <Button variant="secondary" icon={FaPause} onClick={() => setModal({ kind: "pause" })} disabled={busy}>
                  Pausar
                </Button>
              )}
              <Button icon={FaTrophy} onClick={() => setModal({ kind: "won" })} disabled={busy} className="!bg-admin-deal-won !text-admin-deal-won-text hover:!brightness-125">
                Marcar como venda
              </Button>
              <Button variant="secondary" icon={FaXmark} onClick={() => setModal({ kind: "lost" })} disabled={busy} className="!text-admin-danger">
                Marcar como perda
              </Button>
            </>
          )}
          <div className="relative">
            <Button variant="secondary" icon={FaEllipsis} aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} className="w-11 !px-0" />
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 z-30 flex w-56 flex-col rounded-xl bg-admin-card p-1.5 shadow-2xl outline outline-1 -outline-offset-1 outline-admin-card-border"
                onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  autoFocus
                  onClick={() => {
                    setMenuOpen(false);
                    setModal({ kind: "edit" });
                  }}
                  className="flex h-10 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-text-primary hover:bg-admin-badge"
                >
                  <FaPen aria-hidden className="h-3 w-3 text-admin-text-hint" /> Editar negociação
                </button>
                {!closed && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setModal({ kind: "movePipeline" });
                    }}
                    className="flex h-10 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-text-primary hover:bg-admin-badge"
                  >
                    <FaArrowRightArrowLeft aria-hidden className="h-3 w-3 text-admin-text-hint" /> Mover para outro funil
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setModal({ kind: "delete" });
                  }}
                  className="flex h-10 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-admin-danger hover:bg-admin-badge"
                >
                  <FaTrash aria-hidden className="h-3 w-3" /> Excluir negociação
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {deal.status === "vendida" && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-admin-deal-won px-4 py-3 text-sm font-medium text-admin-deal-won-text">
          <FaCheck aria-hidden className="h-3.5 w-3.5" />
          Vendida em {formatDate(deal.won_at)}
          {deal.contract && ` · ${deal.contract.product_name} · ${formatMoney(Math.round(deal.contract.monthly_value * 100))}/mês — contrato ativo, empresa é Cliente.`}
        </p>
      )}
      {deal.status === "pausada" && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-admin-deal-paused px-4 py-3 text-sm font-medium text-admin-deal-paused-text">
          <FaPause aria-hidden className="h-3 w-3" />
          Negociação pausada{deal.paused_reason ? ` · ${deal.paused_reason}` : ""}
          {deal.paused_until ? ` · retomar em ${formatCalendarDate(deal.paused_until)}` : ""}
        </p>
      )}
      {deal.status === "perdida" && (
        <p className="rounded-xl bg-admin-deal-lost px-4 py-3 text-sm font-medium text-admin-deal-lost-text">
          Perdida em {formatDate(deal.lost_at)} · Motivo: {lostReasons.label(deal.lost_reason)}
          {deal.lost_detail ? ` — ${deal.lost_detail}` : ""}
        </p>
      )}

      {/* Funil atual + trocar funil */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-admin-text-description">
          Funil <span className="font-semibold text-text-primary">{pipeline.name}</span>
          {board ? <span> · quadro {board.name}</span> : null}
        </p>
        {!closed && props.pipelines.length > 1 && (
          <button type="button" onClick={() => setModal({ kind: "movePipeline" })} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-admin-accent hover:bg-admin-card disabled:opacity-50">
            <FaArrowRightArrowLeft aria-hidden className="h-3 w-3" /> Trocar funil
          </button>
        )}
      </div>

      {/* Etapas do funil em placas, com os dias em cada etapa (clique para mudar) */}
      <StageStepper
        deal={deal}
        pipeline={pipeline}
        now={now}
        disabled={closed || busy}
        pendingStage={pendingStage}
        onChange={async (stageId) => {
          const before = deal;
          setPendingStage(stageId);
          setDeal({ ...deal, stage_id: stageId, stage_entered_at: new Date().toISOString() });
          const result = await save({ stage_id: stageId }, `Etapa alterada para “${pipeline.stages.find((x) => x.id === stageId)?.name}”.`);
          if (result !== true) setDeal(before);
          setPendingStage(null);
        }}
      />

      {/* Abas */}
      <div role="tablist" aria-label="Seções da negociação" className="flex gap-1 overflow-x-auto border-b border-admin-divider">
        {(
          [
            ["overview", "Visão geral", null],
            ["history", "Histórico", history.length],
            ["tasks", "Tarefas", openTasks.length],
            ["files", "Arquivos", files.length],
          ] as const
        ).map(([value, label, n]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className="-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-admin-text-description transition-colors hover:text-text-primary aria-selected:border-admin-primary aria-selected:text-text-primary"
          >
            {label}
            {n !== null && n > 0 && <span className="rounded-md bg-admin-badge px-1.5 py-0.5 text-[11px] text-admin-badge-text">{n}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "overview" && (
          <OverviewTab
            deal={deal}
            pipeline={pipeline}
            tasks={tasks}
            files={files}
            history={history}
            now={now}
            basePath={basePath}
            busy={busy}
            emailConfigured={emailConfigured}
            onQualify={(n) => save({ qualification: n }, "Qualificação atualizada.")}
            onEdit={() => setModal({ kind: "edit" })}
            onTask={() => setModal({ kind: "task" })}
            onWhatsApp={() => setModal({ kind: "whatsapp" })}
            onEmail={(to) => setModal({ kind: "email", to })}
            onLink={(target) => setModal({ kind: "link", target })}
            onTaskDone={(t) => setTaskDone(t, true)}
            onGo={setTab}
          />
        )}
        {tab === "history" && (
          <HistoryTab
            deal={deal}
            pipeline={pipeline}
            history={history}
            complete={historyComplete}
            onLoadAll={async () => {
              try {
                return await loadFullHistory();
              } catch (error) {
                flash(error instanceof Error ? error.message : "Não foi possível carregar o histórico.", "error");
                return null;
              }
            }}
            onLog={logActivity}
          />
        )}
        {tab === "tasks" && (
          <TasksTab tasks={tasks} now={now} onCreate={() => setModal({ kind: "task" })} onToggle={setTaskDone} onEdit={(task) => setModal({ kind: "editTask", task })} onDelete={removeTask} />
        )}
        {tab === "files" && (
          <FilesTab
            basePath={basePath}
            dealId={deal.id}
            files={files}
            configured={storageConfigured}
            onUploaded={(file) => {
              setFiles((all) => [file, ...all]);
              void reloadHistory();
            }}
            onDownloaded={() => void reloadHistory()}
            onError={(text) => flash(text, "error")}
          />
        )}
      </div>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`fixed bottom-6 right-6 z-40 flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl outline outline-1 -outline-offset-1 ${
            notice.tone === "error" ? "bg-admin-deal-lost text-admin-deal-lost-text outline-admin-danger/40" : "bg-admin-card text-text-primary outline-admin-card-border"
          }`}
        >
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="text-admin-text-hint hover:text-text-primary">
            <FaXmark aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {modal?.kind === "task" && (
        <TaskModal
          basePath={basePath}
          deal={{ id: deal.id, title: deal.title }}
          admins={admins}
          currentUid={currentUid}
          onClose={() => setModal(null)}
          onCreated={(task) => {
            setTasks((all) => [...all, task].sort((a, b) => a.due_at.localeCompare(b.due_at)));
            setModal(null);
            void reloadHistory();
            flash(`Tarefa “${task.title}” criada.`);
          }}
        />
      )}
      {modal?.kind === "edit" && (
        <EditDealModal
          deal={deal}
          pipeline={pipeline}
          admins={admins}
          busy={busy}
          onClose={() => setModal(null)}
          onSave={async (changes) => {
            const result = await save(changes, "Negociação atualizada.");
            if (result === true) setModal(null);
            return result;
          }}
        />
      )}
      {modal?.kind === "won" && (
        <WonModal
          basePath={basePath}
          deal={deal}
          busy={busy}
          onClose={() => setModal(null)}
          onLinkCompany={() => setModal({ kind: "link", target: "company" })}
          onConfirm={async (body) => {
            const result = await close("won", body, "Venda registrada! 🎉 O contrato entrou no faturamento.");
            if (result === true) setModal(null);
            return result;
          }}
        />
      )}
      {modal?.kind === "lost" && (
        <LostModal
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={async (body) => {
            const result = await close("lost", body, "Negociação marcada como perdida.");
            if (result === true) setModal(null);
            return result;
          }}
        />
      )}
      {modal?.kind === "pause" && (
        <PauseModal
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={async (body) => {
            const result = await close("pause", body, body.resume_date ? "Negociação pausada. A tarefa de retomada foi criada." : "Negociação pausada.");
            if (result === true) {
              setModal(null);
              if (body.resume_date) {
                const fresh = await callApi<{ tasks: TaskRow[] }>(url("/tasks"), "GET").catch(() => null);
                if (fresh?.ok) setTasks(fresh.data.tasks);
              }
            }
            return result;
          }}
        />
      )}
      {modal?.kind === "movePipeline" && (
        <MovePipelineModal
          boards={boards}
          pipelines={props.pipelines}
          currentPipelineId={pipeline.id}
          currentStageId={deal.stage_id}
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={movePipeline}
        />
      )}
      {modal?.kind === "delete" && (
        <ConfirmDialog
          title={`Excluir “${deal.title}”?`}
          message={
            deal.status === "vendida"
              ? "Negociação vendida não pode ser excluída. Desfaça a venda antes."
              : "A negociação, o histórico, as tarefas e os arquivos dela serão apagados de vez. Contato, empresa e lead continuam (o lead volta a poder ser convertido)."
          }
          confirmLabel={deal.status === "vendida" ? "Entendi" : "Excluir de vez"}
          tone="danger"
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={() => (deal.status === "vendida" ? setModal(null) : removeDeal())}
        />
      )}
      {modal?.kind === "editTask" && (
        <TaskModal
          basePath={basePath}
          deal={{ id: deal.id, title: deal.title }}
          admins={admins}
          currentUid={currentUid}
          task={modal.task}
          onClose={() => setModal(null)}
          onCreated={(task) => {
            setTasks((all) => all.map((t) => (t.id === task.id ? task : t)).sort((a, b) => a.due_at.localeCompare(b.due_at)));
            setModal(null);
            void reloadHistory();
            flash(`Tarefa “${task.title}” atualizada.`);
          }}
        />
      )}
      {modal?.kind === "reopen" && (
        <ConfirmDialog
          title={deal.status === "vendida" ? "Desfazer a venda?" : "Reabrir a negociação?"}
          message={
            deal.status === "vendida"
              ? "O contrato desta venda sai do faturamento e a negociação volta para “Em andamento”. Use quando a venda foi registrada por engano."
              : "A negociação volta para “Em andamento” no funil."
          }
          confirmLabel={deal.status === "vendida" ? "Desfazer venda" : "Reabrir"}
          tone={deal.status === "vendida" ? "danger" : "primary"}
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={async () => {
            if ((await close("reopen", {}, "Negociação reaberta.")) === true) setModal(null);
          }}
        />
      )}
      {modal?.kind === "link" && (
        <LinkModal
          basePath={basePath}
          target={modal.target}
          busy={busy}
          onClose={() => setModal(null)}
          onLink={async (id) => {
            const result = await save(modal.target === "company" ? { company_id: id } : { contact_id: id }, modal.target === "company" ? "Empresa vinculada." : "Contato vinculado.");
            if (result === true) setModal(null);
          }}
        />
      )}
      {modal?.kind === "whatsapp" && (
        <WhatsAppComposer
          phones={[
            ...(contact?.phone ? [{ label: `${contact.name} (contato)`, digits: contact.phone }] : []),
            ...(company?.phone ? [{ label: `${company.name} (empresa)`, digits: company.phone }] : []),
          ]}
          templates={templates.filter((t) => t.channel === "whatsapp")}
          context={templateContext}
          onClose={() => setModal(null)}
          onManageTemplates={() => setModal({ kind: "templates", channel: "whatsapp" })}
          onOpened={(phone, message) => void logActivity("whatsapp", `Conversa aberta com ${phone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}${message ? `:\n${message}` : "."}`)}
        />
      )}
      {modal?.kind === "email" && (
        <EmailComposer
          basePath={basePath}
          leadId={deal.id}
          endpoint={url("/email")}
          recipients={(() => {
            const c = contact?.email ? [{ label: `${contact.name} (contato)`, email: contact.email }] : [];
            const e = company?.email ? [{ label: `${company.name} (empresa)`, email: company.email }] : [];
            // O destinatário do botão clicado vem primeiro.
            return modal.to === "company" ? [...e, ...c] : [...c, ...e];
          })()}
          templates={templates.filter((t) => t.channel === "email")}
          context={templateContext}
          configured={emailConfigured}
          onClose={() => setModal(null)}
          onSent={() => {
            setModal(null);
            void reloadHistory();
            flash("E-mail enviado e registrado no histórico.");
          }}
          onManageTemplates={() => setModal({ kind: "templates", channel: "email" })}
        />
      )}
      {modal?.kind === "templates" && (
        <TemplatesManager basePath={basePath} templates={templates} initialChannel={modal.channel} onChange={setTemplates} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
