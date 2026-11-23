"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaArrowLeft, FaChevronDown, FaFileExcel, FaFileImport, FaMagnifyingGlass, FaRotateRight, FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import { IMPORT_LIMITS, columnOf, fold, rowsFromTable, type ImportField, type ImportRow } from "@/lib/admin/crm/leadImport/columns";
import type { CommitRowInput, CommitRowResult } from "@/lib/admin/crm/leadImport/commit";
import { ACTION_LABELS, STATUS_INFO, allowedActions, reviewRows, willFill, type ReviewedRow, type RowAction, type RowChoice, type RowMatch, type RowStatus } from "@/lib/admin/crm/leadImport/review";
import { SheetError, readSpreadsheet } from "@/lib/admin/crm/leadImport/sheet";
import { leadQualifications, leadSources, leadStages, type Option } from "@/lib/admin/crm/options";
import type { AdminUserOption } from "@/lib/admin/crm/types";
import type { ImportHistoryRow } from "@/lib/admin/crm/leadImport/commit";
import Button from "../../form/Button";
import ConfirmDialog from "../../form/ConfirmDialog";
import { inputClass } from "../../form/Field";
import ImportResult, { type ResultLine } from "./ImportResult";
import ImportReviewTable from "./ImportReviewTable";
import ImportRowDrawer from "./ImportRowDrawer";
import ImportUpload from "./ImportUpload";
import { STATUS_ORDER, STATUS_STYLE, downloadCsv, integer, plural } from "./importVisuals";

interface ImportViewProps {
  basePath: string;
  admins: AdminUserOption[];
  currentUid: string;
  history: ImportHistoryRow[];
}

type Step = "upload" | "review" | "importing" | "done";
type Filter = "all" | "import" | RowStatus;

const PAGE_SIZE = 100;
const STEPS: { step: Step; label: string }[] = [
  { step: "upload", label: "Enviar planilha" },
  { step: "review", label: "Revisar" },
  { step: "done", label: "Importar" },
];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
}

const skipReason = (r: ReviewedRow): string =>
  r.status === "erro"
    ? `Com erro: ${Object.values(r.errors)[0] ?? "dados inválidos"}`
    : r.status === "sem_contato"
      ? "Sem e-mail, telefone e site"
      : r.status === "duplicado"
        ? `Lead duplicado (${r.match?.openLeads[0]?.title ?? "existente"})`
        : r.status === "repetido"
          ? `Repetido (igual à linha ${r.repeatOf})`
          : "Pulado na revisão";

function BulkSelect({ label, options, onPick }: { label: string; options: readonly Option[]; onPick: (value: string) => void }) {
  return (
    <div className="relative">
      <select
        value=""
        onChange={(e) => e.target.value && onPick(e.target.value)}
        aria-label={label}
        className="h-10 cursor-pointer appearance-none rounded-lg bg-admin-control pl-3 pr-9 text-[13px] font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-control-border [color-scheme:dark] focus:outline-2 focus:outline-admin-primary"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FaChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-admin-text-hint" />
    </div>
  );
}

/** Tela "Importar lista": planilha → revisão (erros, duplicados, dados novos) → confirmação → gravação em lotes. */
export default function ImportView({ basePath, admins, currentUid, history }: ImportViewProps) {
  const api = `${basePath}/api/crm/leads/import`;
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetNotice, setSheetNotice] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [matches, setMatches] = useState<Map<number, RowMatch>>(new Map());
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Map<number, RowChoice>>(new Map());
  const [defaultOwner, setDefaultOwner] = useState(admins.some((a) => a.uid === currentUid) ? currentUid : (admins[0]?.uid ?? ""));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [results, setResults] = useState<ResultLine[]>([]);
  const [skippedRows, setSkippedRows] = useState<{ line: number; title: string; reason: string }[]>([]);
  const importIdRef = useRef<string>("");
  const historyStartedRef = useRef(false);

  const owners = useMemo(() => admins.map((a) => ({ uid: a.uid, name: a.name })), [admins]);
  const ownerNames = useMemo(() => new Map(admins.map((a) => [a.uid, a.name])), [admins]);
  const defaultOwnerName = ownerNames.get(defaultOwner) ?? "—";

  // ── Análise (servidor, só leitura) ─────────────────────────────────────────
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const queueRef = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyze = useCallback(
    async (lines: number[]): Promise<Map<number, RowMatch> | null> => {
      const wanted = new Set(lines);
      const payload = rowsRef.current.filter((r) => wanted.has(r.line));
      if (!payload.length) return new Map();
      try {
        const { matches: list } = await postJson<{ matches: RowMatch[] }>(`${api}/analyze`, { rows: payload, default_owner_uid: defaultOwner });
        const fresh = new Map(list.map((m) => [m.line, m]));
        setMatches((prev) => {
          const next = new Map(prev);
          for (const line of lines) {
            if (queueRef.current.has(line)) continue; // editada de novo: a próxima análise atualiza
            const match = fresh.get(line);
            if (match) next.set(line, match);
            else next.delete(line);
          }
          return next;
        });
        setAnalyzeError(null);
        return fresh;
      } catch {
        setAnalyzeError("Não consegui comparar com o CRM agora. Os duplicados podem não aparecer — tente analisar de novo.");
        return null;
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          for (const line of lines) if (!queueRef.current.has(line)) next.delete(line);
          return next;
        });
      }
    },
    [api, defaultOwner],
  );

  const flush = useCallback(() => {
    const lines = [...queueRef.current];
    queueRef.current.clear();
    if (lines.length) void analyze(lines);
  }, [analyze]);

  /** Linha editada: compara de novo com o CRM (com espera, para não chamar a cada tecla). */
  const markDirty = useCallback(
    (lines: number[]) => {
      for (const line of lines) queueRef.current.add(line);
      setPending((prev) => new Set([...prev, ...lines]));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 700);
    },
    [flush],
  );
  useEffect(() => () => void (timerRef.current && clearTimeout(timerRef.current)), []);

  // ── Arquivo ────────────────────────────────────────────────────────────────
  const onFile = async (file: File) => {
    setUploadError(null);
    if (file.size > IMPORT_LIMITS.fileBytes) return setUploadError("Arquivo grande demais (máximo 5 MB).");
    setLoading(true);
    try {
      const table = await readSpreadsheet(file);
      const parsed = rowsFromTable(table);
      if (parsed.missing.includes("title")) {
        setUploadError('Não encontrei a coluna "Nome do lead" na primeira linha. Confira o cabeçalho ou baixe o modelo.');
        return;
      }
      if (!parsed.rows.length) return setUploadError("A planilha não tem nenhuma linha preenchida abaixo do cabeçalho.");
      if (parsed.rows.length > IMPORT_LIMITS.rows) return setUploadError(`A planilha tem ${integer.format(parsed.rows.length)} linhas. O máximo por importação é ${IMPORT_LIMITS.rows}.`);

      const notice: string[] = [];
      if (parsed.unknown.length) notice.push(`Colunas ignoradas (nome não reconhecido): ${parsed.unknown.join(", ")}.`);
      const important: ImportField[] = ["lead_phone", "lead_email", "contact_name", "trade_name", "website"];
      const absent = important.filter((f) => parsed.missing.includes(f)).map((f) => columnOf(f).header);
      if (absent.length) notice.push(`Colunas ausentes: ${absent.join(", ")}.`);

      rowsRef.current = parsed.rows;
      setRows(parsed.rows);
      setFileName(file.name);
      setSheetNotice(notice);
      setChoices(new Map());
      setSelected(new Set());
      setMatches(new Map());
      setFilter("all");
      setQuery("");
      setPage(0);
      const lines = parsed.rows.map((r) => r.line);
      setPending(new Set(lines));
      await analyze(lines);
      setStep("review");
    } catch (error) {
      setUploadError(error instanceof SheetError ? error.message : "Não consegui ler esta planilha. Salve de novo como .xlsx ou .csv e tente outra vez.");
    } finally {
      setLoading(false);
    }
  };

  // ── Revisão ────────────────────────────────────────────────────────────────
  const reviewed = useMemo(() => reviewRows(rows, matches, choices, owners, defaultOwner), [rows, matches, choices, owners, defaultOwner]);
  const byLine = useMemo(() => new Map(reviewed.map((r) => [r.line, r])), [reviewed]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<RowStatus, number>;
    for (const r of reviewed) c[r.status]++;
    return c;
  }, [reviewed]);
  const toCreate = reviewed.filter((r) => r.action === "create").length;
  const toUpdate = reviewed.filter((r) => r.action === "update").length;
  const toFill = reviewed.filter(willFill).length;
  const toSkip = reviewed.length - toCreate - toUpdate;

  const visible = useMemo(() => {
    const q = fold(query);
    const qDigits = query.replace(/\D/g, "");
    return reviewed.filter((r) => {
      if (filter === "import" ? r.action === "skip" : filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      const v = r.values;
      if ([v.title, v.contact_name, v.trade_name, v.lead_email, v.contact_email, v.website, v.city].some((t) => fold(t).includes(q))) return true;
      return qDigits.length >= 4 && [v.lead_phone, v.contact_phone, v.company_phone, v.cnpj].some((t) => t.replace(/\D/g, "").includes(qDigits));
    });
  }, [reviewed, filter, query]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const setChoice = (lines: number[], patch: RowChoice) =>
    setChoices((prev) => {
      const next = new Map(prev);
      for (const line of lines) next.set(line, { ...next.get(line), ...patch });
      return next;
    });

  const setValues = (lines: number[], field: ImportField, value: string) => {
    const wanted = new Set(lines);
    setRows((prev) => prev.map((r) => (wanted.has(r.line) ? { ...r, values: { ...r.values, [field]: value } } : r)));
    // Campos que mudam a comparação com o CRM ou a validade → analisa de novo.
    markDirty(lines);
  };

  const applyBulkAction = (action: RowAction) => {
    const lines = [...selected].filter((line) => {
      const r = byLine.get(line);
      return r && allowedActions(r.status).includes(action);
    });
    setChoice(lines, { action });
  };

  // ── Gravação ───────────────────────────────────────────────────────────────
  const toCommitRow = (r: ReviewedRow, match: RowMatch | null): CommitRowInput => ({
    line: r.line,
    values: r.values,
    action: r.action === "update" ? "update" : "create",
    fill: r.fill,
    company_id: match?.company?.id ?? null,
    contact_id: match?.contact?.id ?? null,
    lead_id: r.action === "update" ? r.targetLeadId : null,
  });

  const runCommit = async (targets: ReviewedRow[], skippedCount: number) => {
    const meta = { import_id: importIdRef.current, file_name: fileName, rows_total: reviewed.length, skipped: skippedCount };
    const out: ResultLine[] = [];
    // Linhas "repetidas" vão por último e são analisadas de novo: a empresa/contato criados pela
    // primeira linha passam a existir e são reaproveitados (não duplica).
    const phases = [targets.filter((r) => r.status !== "repetido"), targets.filter((r) => r.status === "repetido")];
    for (const [phaseIndex, phase] of phases.entries()) {
      if (!phase.length) continue;
      const fresh = phaseIndex === 1 ? await analyze(phase.map((r) => r.line)) : null;
      for (let i = 0; i < phase.length; i += IMPORT_LIMITS.commitChunk) {
        const chunk = phase.slice(i, i + IMPORT_LIMITS.commitChunk);
        try {
          const { results: res } = await postJson<{ results: CommitRowResult[] }>(`${api}/commit`, {
            meta,
            // Primeiro lote gravado com sucesso abre o registro no histórico (data/autor).
            first: !historyStartedRef.current,
            default_owner_uid: defaultOwner,
            rows: chunk.map((r) => toCommitRow(r, fresh ? (fresh.get(r.line) ?? null) : r.match)),
          });
          historyStartedRef.current = true;
          out.push(...res.map((x) => ({ ...x, title: byLine.get(x.line)?.values.title ?? "" })));
        } catch {
          out.push(...chunk.map((r) => ({ line: r.line, outcome: "failed" as const, lead_id: null, filled: [], message: "Falha de conexão ao gravar.", title: r.values.title })));
        }
        setProgress((p) => ({ ...p, done: p.done + chunk.length }));
      }
    }
    return out;
  };

  const startImport = async () => {
    setConfirming(false);
    setOpenLine(null);
    const targets = reviewed.filter((r) => r.action !== "skip");
    const skipped = reviewed.filter((r) => r.action === "skip").map((r) => ({ line: r.line, title: r.values.title, reason: skipReason(r) }));
    importIdRef.current = crypto.randomUUID();
    historyStartedRef.current = false;
    setSkippedRows(skipped);
    setProgress({ done: 0, total: targets.length });
    setStep("importing");
    const out = await runCommit(targets, skipped.length);
    setResults(out);
    setStep("done");
  };

  const retryFailed = async () => {
    const failedLines = new Set(results.filter((r) => r.outcome === "failed").map((r) => r.line));
    const targets = reviewed.filter((r) => failedLines.has(r.line));
    setProgress({ done: 0, total: targets.length });
    setStep("importing");
    const out = await runCommit(targets, skippedRows.length);
    const byRetry = new Map(out.map((r) => [r.line, r]));
    setResults((prev) => prev.map((r) => byRetry.get(r.line) ?? r));
    setStep("done");
  };

  const downloadReport = () => {
    const resultByLine = new Map(results.map((r) => [r.line, r]));
    const label: Record<CommitRowResult["outcome"], string> = { created: "Lead criado", updated: "Lead existente atualizado", already: "Já importado", failed: "Falhou" };
    downloadCsv(`relatorio-${fileName.replace(/\.[^.]+$/, "")}.csv`, [
      ["Linha", "Lead", "Contato", "Empresa", "Situação na revisão", "Ação", "Resultado", "Detalhes"],
      ...reviewed.map((r) => {
        const res = resultByLine.get(r.line);
        return [
          r.line,
          r.values.title,
          r.values.contact_name,
          r.values.trade_name,
          STATUS_INFO[r.status].label,
          ACTION_LABELS[r.action],
          res ? label[res.outcome] : "Pulado",
          res ? [res.filled.length ? `Completado: ${res.filled.join(", ")}` : "", res.message ?? ""].filter(Boolean).join(" · ") : skipReason(r),
        ];
      }),
    ]);
  };

  const reset = () => {
    setStep("upload");
    setRows([]);
    setMatches(new Map());
    setChoices(new Map());
    setResults([]);
    setSkippedRows([]);
    setSelected(new Set());
    setUploadError(null);
    setAnalyzeError(null);
  };

  // Não perder a revisão/importação por fechar a aba sem querer.
  useEffect(() => {
    if (step !== "review" && step !== "importing") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [step]);

  const openIndex = openLine === null ? -1 : visible.findIndex((r) => r.line === openLine);
  const openRow = openLine === null ? null : (byLine.get(openLine) ?? null);
  const stepIndex = step === "upload" ? 0 : step === "review" ? 1 : 2;

  const chip = (key: Filter, label: string, count: number, className?: string, Icon?: (typeof STATUS_STYLE)[RowStatus]["icon"]) => (
    <button
      key={key}
      type="button"
      aria-pressed={filter === key}
      onClick={() => {
        setFilter(filter === key ? "all" : key);
        setPage(0);
      }}
      className={`flex min-w-[132px] flex-1 flex-col items-start gap-1 rounded-2xl p-4 text-left outline outline-1 -outline-offset-1 transition-colors ${
        filter === key ? "bg-admin-tip outline-admin-accent" : "bg-background-kpi outline-admin-card-border hover:bg-admin-card"
      } ${count === 0 && key !== "all" && key !== "import" ? "opacity-50" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium leading-4 text-admin-text-description">
        {Icon && <Icon aria-hidden className={`h-3 w-3 ${className}`} />}
        {label}
      </span>
      <span className="text-2xl font-semibold leading-8 text-text-primary">{integer.format(count)}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Topo */}
      <header className="flex flex-col gap-5">
        <Link href={`${basePath}/leads`} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-admin-text-description hover:text-text-primary">
          <FaArrowLeft aria-hidden className="h-3 w-3" /> Leads
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2.5">
            <h1 className="flex items-center gap-3 text-[32px] font-semibold leading-[38px] text-text-primary">
              <FaFileImport aria-hidden className="h-6 w-6 text-admin-accent" /> Importar lista
            </h1>
            <p className="text-sm font-medium leading-5 text-admin-text-description">Suba a planilha, confira linha a linha e só depois confirme. Nada é cadastrado antes disso.</p>
          </div>
          <ol className="flex items-center gap-2" aria-label="Etapas">
            {STEPS.map((s, i) => (
              <li key={s.step} className="flex items-center gap-2">
                <span
                  aria-current={i === stepIndex ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    i === stepIndex ? "bg-admin-primary text-admin-primary-text" : i < stepIndex ? "bg-admin-tip text-admin-tip-title" : "bg-admin-badge text-admin-text-hint"
                  }`}
                >
                  <span className="tabular-nums">{i + 1}</span> {s.label}
                </span>
                {i < STEPS.length - 1 && <span aria-hidden className="h-px w-5 bg-admin-divider" />}
              </li>
            ))}
          </ol>
        </div>
      </header>

      {step === "upload" && <ImportUpload loading={loading} error={uploadError} history={history} onFile={onFile} />}

      {step === "review" && (
        <>
          {/* Arquivo + responsável padrão */}
          <section className="flex flex-col gap-4 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-admin-qual-sure text-admin-qual-sure-text">
                <FaFileExcel aria-hidden className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-5 text-text-primary">{fileName}</p>
                <p className="text-xs font-medium leading-[18px] text-admin-table-subtext">{plural(reviewed.length, "linha lida", "linhas lidas")}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium leading-[18px] text-admin-text-description">Responsável padrão</span>
                <div className="relative">
                  <select
                    value={defaultOwner}
                    onChange={(e) => setDefaultOwner(e.target.value)}
                    className={`${inputClass} h-10 min-w-[220px] cursor-pointer appearance-none pr-9`}
                  >
                    {admins.map((a) => (
                      <option key={a.uid} value={a.uid}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <FaChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-admin-text-hint" />
                </div>
              </label>
              <Button variant="secondary" icon={FaFileImport} onClick={reset} className="!h-10">
                Trocar arquivo
              </Button>
            </div>
          </section>

          {(sheetNotice.length > 0 || analyzeError) && (
            <div className="flex flex-col gap-2 rounded-xl bg-admin-qual-hot/40 p-4 outline outline-1 -outline-offset-1 outline-admin-warning/30">
              {[...sheetNotice, ...(analyzeError ? [analyzeError] : [])].map((n) => (
                <p key={n} className="flex items-start gap-2 text-sm font-medium leading-5 text-admin-qual-hot-text">
                  <FaTriangleExclamation aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n}
                </p>
              ))}
              {analyzeError && (
                <Button variant="secondary" icon={FaRotateRight} className="!h-10 w-fit" onClick={() => void analyze(rows.map((r) => r.line))}>
                  Analisar de novo
                </Button>
              )}
            </div>
          )}

          {/* Contadores = filtros */}
          <div className="flex flex-wrap gap-3">
            {chip("all", "Todas as linhas", reviewed.length)}
            {STATUS_ORDER.map((s) => chip(s, STATUS_INFO[s].label, counts[s], STATUS_STYLE[s].className.split(" ").find((c) => c.startsWith("text-")), STATUS_STYLE[s].icon))}
          </div>

          <section className="flex flex-col overflow-hidden rounded-2xl bg-background-kpi outline outline-1 -outline-offset-1 outline-admin-card-border">
            {/* Busca + seleção */}
            <div className="flex flex-col gap-3 border-b border-admin-table-border p-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block w-full lg:max-w-[360px]">
                <span className="sr-only">Buscar na planilha</span>
                <FaMagnifyingGlass aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-text-hint" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Buscar por lead, contato, empresa, telefone..."
                  className={`${inputClass} h-10 pl-10`}
                />
              </label>
              {selected.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[13px] font-semibold text-admin-accent">{plural(selected.size, "selecionada", "selecionadas")}</span>
                  <BulkSelect
                    label="Ação"
                    options={(["create", "update", "skip"] as RowAction[]).map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
                    onPick={(v) => applyBulkAction(v as RowAction)}
                  />
                  <BulkSelect
                    label="Responsável"
                    options={admins.map((a) => ({ value: a.uid, label: a.name }))}
                    onPick={(uid) => setValues([...selected], "owner", ownerNames.get(uid) ?? "")}
                  />
                  <BulkSelect label="Etapa" options={leadStages.options} onPick={(v) => setValues([...selected], "stage", v)} />
                  <BulkSelect label="Qualificação" options={leadQualifications.options} onPick={(v) => setValues([...selected], "qualification", v)} />
                  <BulkSelect label="Origem" options={leadSources.options} onPick={(v) => setValues([...selected], "source", v)} />
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    aria-label="Limpar seleção"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-admin-text-hint hover:bg-admin-card hover:text-text-primary"
                  >
                    <FaXmark aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="text-xs font-medium leading-[18px] text-admin-text-hint">Selecione linhas para mudar ação, responsável, etapa, qualificação ou origem de várias de uma vez.</p>
              )}
            </div>

            {visible.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm font-medium text-admin-text-description">Nenhuma linha neste filtro.</p>
            ) : (
              <ImportReviewTable
                rows={pageRows}
                ownerNames={ownerNames}
                selected={selected}
                pending={pending}
                onToggle={(line) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(line)) next.delete(line);
                    else next.add(line);
                    return next;
                  })
                }
                onToggleAll={(select) => setSelected(select ? new Set(visible.map((r) => r.line)) : new Set())}
                onAction={(line, action) => setChoice([line], { action })}
                onOpen={setOpenLine}
              />
            )}

            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-admin-table-border px-5 py-3 text-xs font-medium text-admin-text-description">
                <span>
                  {page * PAGE_SIZE + 1}–{Math.min(visible.length, (page + 1) * PAGE_SIZE)} de {integer.format(visible.length)}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" className="!h-9 !px-4" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Anterior
                  </Button>
                  <Button variant="secondary" className="!h-9 !px-4" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Barra de confirmação */}
          <div className="sticky bottom-0 z-30 -mx-8 -mb-8 border-t border-admin-divider bg-background-kpi/95 backdrop-blur">
            <div className="flex flex-col gap-3 px-8 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-medium leading-5 text-admin-text-label">
                <span className="font-semibold text-admin-success">{plural(toCreate, "lead novo", "leads novos")}</span>
                {toUpdate > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-admin-accent">{plural(toUpdate, "atualização", "atualizações")}</span>
                  </>
                )}
                {toFill > 0 && <> · {plural(toFill, "cadastro completado", "cadastros completados")}</>}
                {" · "}
                {plural(toSkip, "pulada", "puladas")}
                {counts.erro > 0 && (
                  <button type="button" onClick={() => setFilter("erro")} className="ml-2 font-semibold text-admin-danger hover:underline">
                    ({plural(counts.erro, "linha com erro", "linhas com erro")})
                  </button>
                )}
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={reset}>
                  Cancelar
                </Button>
                <Button icon={FaFileImport} disabled={toCreate + toUpdate === 0 || pending.size > 0} onClick={() => setConfirming(true)}>
                  {pending.size > 0 ? "Analisando..." : `Importar ${integer.format(toCreate + toUpdate)}`}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {step === "importing" && (
        <section className="flex flex-col items-center gap-5 rounded-2xl bg-background-kpi px-6 py-16 text-center outline outline-1 -outline-offset-1 outline-admin-card-border">
          <p className="text-lg font-semibold text-text-primary">Importando...</p>
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-admin-badge" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full rounded-full bg-admin-primary transition-[width] duration-300" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="text-sm font-medium text-admin-text-description">
            {integer.format(progress.done)} de {integer.format(progress.total)} linhas · não feche esta aba
          </p>
        </section>
      )}

      {step === "done" && (
        <ImportResult
          results={results}
          skipped={skippedRows}
          basePath={basePath}
          onRetryFailed={results.some((r) => r.outcome === "failed") ? () => void retryFailed() : null}
          onDownloadReport={downloadReport}
          onNew={reset}
        />
      )}

      {openRow && step === "review" && (
        <ImportRowDrawer
          row={openRow}
          basePath={basePath}
          admins={owners}
          defaultOwnerName={defaultOwnerName}
          position={{ index: Math.max(openIndex, 0), total: visible.length }}
          onPrev={() => openIndex > 0 && setOpenLine(visible[openIndex - 1].line)}
          onNext={() => openIndex >= 0 && openIndex < visible.length - 1 && setOpenLine(visible[openIndex + 1].line)}
          onChange={(field, value) => setValues([openRow.line], field, value)}
          onAction={(action) => setChoice([openRow.line], { action })}
          onFill={(fill) => setChoice([openRow.line], { fill })}
          onTargetLead={(leadId) => setChoice([openRow.line], { leadId })}
          onClose={() => setOpenLine(null)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Confirmar importação"
          confirmLabel={`Importar ${integer.format(toCreate + toUpdate)}`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void startImport()}
          message={
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1.5">
                <li>
                  <strong className="text-admin-success">{plural(toCreate, "lead será criado", "leads serão criados")}</strong>, com {defaultOwnerName} como responsável padrão.
                </li>
                {toUpdate > 0 && <li>{plural(toUpdate, "lead existente recebe", "leads existentes recebem")} um registro na timeline.</li>}
                {toFill > 0 && <li>{plural(toFill, "contato/empresa existente terá", "contatos/empresas existentes terão")} campos vazios completados.</li>}
                <li>{plural(toSkip, "linha será pulada", "linhas serão puladas")}.</li>
              </ul>
              <p className="text-admin-text-hint">Reenviar a mesma importação não duplica leads.</p>
            </div>
          }
        />
      )}
    </div>
  );
}
