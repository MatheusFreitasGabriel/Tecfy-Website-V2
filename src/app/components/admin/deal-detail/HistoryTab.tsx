"use client";

import { useMemo, useState } from "react";
import {
  FaArrowRightArrowLeft,
  FaCalendarCheck,
  FaCircleCheck,
  FaCircleXmark,
  FaDownload,
  FaEnvelope,
  FaFileLines,
  FaFlag,
  FaLink,
  FaNoteSticky,
  FaPen,
  FaPhone,
  FaTrophy,
  FaUserTie,
  FaWhatsapp,
} from "react-icons/fa6";
import type { DealDetail, DealHistoryRow, Pipeline } from "@/lib/admin/crm/types";
import Button from "../form/Button";
import { formatDateTime } from "../leads/leadVisuals";
import { downloadCsv } from "../deals/exportDealsCsv";

interface HistoryTabProps {
  deal: DealDetail;
  pipeline: Pipeline;
  history: DealHistoryRow[];
  /** false = há registros mais antigos ainda não carregados. */
  complete: boolean;
  /** Carrega o histórico inteiro (devolve null se falhar). */
  onLoadAll: () => Promise<DealHistoryRow[] | null>;
  onLog: (kind: "note" | "call", text: string) => Promise<boolean>;
}

const ICONS: Record<string, { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; tone: string }> = {
  created: { icon: FaFlag, tone: "text-admin-accent" },
  stage: { icon: FaArrowRightArrowLeft, tone: "text-admin-accent" },
  pipeline: { icon: FaArrowRightArrowLeft, tone: "text-admin-accent" },
  status: { icon: FaArrowRightArrowLeft, tone: "text-admin-text-label" },
  field: { icon: FaPen, tone: "text-admin-text-label" },
  owner: { icon: FaUserTie, tone: "text-admin-text-label" },
  link: { icon: FaLink, tone: "text-admin-text-label" },
  task: { icon: FaCalendarCheck, tone: "text-admin-stage-blue" },
  whatsapp: { icon: FaWhatsapp, tone: "text-admin-whatsapp" },
  email: { icon: FaEnvelope, tone: "text-admin-stage-blue" },
  call: { icon: FaPhone, tone: "text-admin-stage-blue" },
  note: { icon: FaNoteSticky, tone: "text-admin-star" },
  file: { icon: FaFileLines, tone: "text-admin-accent" },
  download: { icon: FaDownload, tone: "text-admin-text-label" },
  won: { icon: FaTrophy, tone: "text-admin-deal-won-text" },
  lost: { icon: FaCircleXmark, tone: "text-admin-danger" },
};

const FILTERS = [
  { value: "", label: "Tudo", types: null },
  { value: "contato", label: "Contatos", types: ["whatsapp", "email", "call"] },
  { value: "notas", label: "Observações", types: ["note"] },
  { value: "etapas", label: "Etapas e status", types: ["stage", "pipeline", "status", "won", "lost", "created"] },
  { value: "tarefas", label: "Tarefas", types: ["task"] },
  { value: "arquivos", label: "Arquivos", types: ["file", "download"] },
  { value: "alteracoes", label: "Alterações", types: ["field", "owner", "link"] },
] as const;

/** Linha do tempo de tudo o que aconteceu na negociação (só acrescenta), com exportação. */
export default function HistoryTab({ deal, pipeline, history, complete, onLoadAll, onLog }: HistoryTabProps) {
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<"note" | "call">("note");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  const shown = useMemo(() => {
    const types = FILTERS.find((f) => f.value === filter)?.types;
    return types ? history.filter((h) => (types as readonly string[]).includes(h.type)) : history;
  }, [history, filter]);

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    if (await onLog(kind, text.trim())) setText("");
    setSaving(false);
  };

  const loadAll = async () => {
    setLoadingAll(true);
    const all = await onLoadAll();
    setLoadingAll(false);
    return all;
  };

  // Exporta SEMPRE o histórico completo (carrega o que faltar antes).
  const exportCsv = async () => {
    const all = complete ? history : await loadAll();
    if (!all) return;
    downloadCsv(
      ["Data", "Hora", "Ação", "Descrição", "Autor"],
      [...all].reverse().map((h) => {
        const [date, time] = h.created_at ? formatDateTime(h.created_at).split(" às ") : ["", ""];
        return [date, time, h.title, h.description, h.author_name];
      }),
      `historico-${deal.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.csv`,
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex flex-col gap-5 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border" aria-label="Linha do tempo">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium text-text-primary">Linha do tempo</h2>
          <Button variant="secondary" icon={FaDownload} onClick={exportCsv} disabled={!history.length || loadingAll} className="h-9 px-3 text-[13px]">
            Exportar CSV
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar histórico">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className="h-8 rounded-full px-3 text-xs font-semibold text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-card aria-pressed:bg-admin-tip aria-pressed:text-admin-tip-title aria-pressed:outline-admin-accent/50"
            >
              {f.label}
            </button>
          ))}
        </div>
        {shown.length ? (
          <ol className="relative flex flex-col gap-5 border-l border-admin-card-border pl-6">
            {shown.map((h) => {
              const visual = ICONS[h.type] ?? ICONS.note;
              const Icon = visual.icon;
              return (
                <li key={h.id} className="relative">
                  <span aria-hidden className="absolute -left-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-admin-card ring-4 ring-background-kpi">
                    <Icon aria-hidden className={`h-3 w-3 ${visual.tone}`} />
                  </span>
                  <p className="text-sm font-semibold text-text-primary">{h.title}</p>
                  {h.description && <p className="mt-1 whitespace-pre-line break-words text-sm leading-5 text-admin-drawer-notes">{h.description}</p>}
                  <p className="mt-1.5 text-xs font-medium text-admin-text-hint">
                    <time dateTime={h.created_at ?? undefined}>{formatDateTime(h.created_at)}</time> · {h.author_name ?? "Sistema"}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-admin-text-hint">Nada registrado neste filtro.</p>
        )}
        {!complete && (
          <button type="button" onClick={loadAll} disabled={loadingAll} className="self-center rounded-lg px-4 py-2 text-[13px] font-semibold text-admin-accent hover:bg-admin-card disabled:opacity-50">
            {loadingAll ? "Carregando..." : "Carregar registros mais antigos"}
          </button>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border" aria-label="Registrar no histórico">
          <h2 className="text-base font-medium text-text-primary">Registrar</h2>
          <div role="tablist" aria-label="Tipo de registro" className="grid grid-cols-2 rounded-lg bg-admin-input p-1">
            {(
              [
                ["note", "Observação", FaNoteSticky],
                ["call", "Ligação", FaPhone],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={kind === value}
                onClick={() => setKind(value)}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-admin-text-description aria-selected:bg-admin-card aria-selected:text-text-primary"
              >
                <Icon aria-hidden className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            aria-label={kind === "note" ? "Observação" : "Resumo da ligação"}
            placeholder={kind === "note" ? "O que aconteceu, o que o cliente disse..." : "Resumo da ligação: com quem falou, o que ficou combinado"}
            className="h-28 w-full resize-y rounded-lg bg-admin-input px-3.5 py-3 text-sm font-medium text-admin-text-input outline outline-1 -outline-offset-1 outline-admin-input-border placeholder:text-admin-text-hint focus:outline-2 focus:outline-admin-primary"
          />
          <Button icon={FaCircleCheck} onClick={submit} disabled={saving || !text.trim()} className="h-10 text-[13px]">
            {saving ? "Salvando..." : "Registrar"}
          </Button>
          <p className="text-xs text-admin-text-hint">Ctrl+Enter para registrar. Mudanças de etapa, tarefas, e-mails, WhatsApp e arquivos entram sozinhos.</p>
        </section>
        <p className="px-1 text-xs text-admin-text-hint">
          {history.length} registro(s) · funil {pipeline.name}
        </p>
      </aside>
    </div>
  );
}
