"use client";

import { useRef, useState } from "react";
import { FaCloudArrowUp, FaDownload, FaFileExcel, FaFilePdf, FaFilePowerpoint, FaFileWord, FaLock } from "react-icons/fa6";
import { DEAL_FILE_MAX_BYTES, DEAL_FILE_TYPES } from "@/lib/admin/crm/options";
import type { DealFileRow } from "@/lib/admin/crm/types";
import { formatDateTime } from "../leads/leadVisuals";
import { apiErrorMessage, callApi } from "./dealApi";

interface FilesTabProps {
  basePath: string;
  dealId: string;
  files: DealFileRow[];
  configured: boolean;
  onUploaded: (file: DealFileRow) => void;
  onDownloaded: () => void;
  onError: (text: string) => void;
}

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(Object.entries(DEAL_FILE_TYPES).map(([mime, t]) => [t.ext, mime]));
const ACCEPT = Object.entries(DEAL_FILE_TYPES)
  .flatMap(([mime, t]) => [mime, `.${t.ext}`])
  .join(",");
const ICON: Record<string, { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; tone: string }> = {
  pdf: { icon: FaFilePdf, tone: "text-admin-danger" },
  docx: { icon: FaFileWord, tone: "text-admin-stage-blue" },
  pptx: { icon: FaFilePowerpoint, tone: "text-admin-stage-orange" },
  xlsx: { icon: FaFileExcel, tone: "text-admin-success" },
};
const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** PUT direto no Storage pela URL assinada, com progresso. */
function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/** Arquivos e propostas: só documentos (PDF, Word, PowerPoint, Excel), guardados de forma privada. */
export default function FilesTab({ basePath, dealId, files, configured, onUploaded, onDownloaded, onError }: FilesTabProps) {
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"proposta" | "arquivo">("proposta");
  const [progress, setProgress] = useState<{ name: string; pct: number; step: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const upload = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = DEAL_FILE_TYPES[file.type] ? file.type : EXT_TO_MIME[ext];
    if (!mime) return onError("Tipo não aceito. Envie PDF, Word (.docx), PowerPoint (.pptx) ou Excel (.xlsx).");
    if (file.size > DEAL_FILE_MAX_BYTES) return onError("Arquivo maior que 25 MB.");
    if (!file.size) return onError("O arquivo está vazio.");
    const base = `${basePath}/api/crm/deals/${dealId}/files`;
    try {
      setProgress({ name: file.name, pct: 0, step: "Preparando..." });
      const start = await callApi<{ file_id: string; url: string; headers: Record<string, string> }>(base, "POST", { name: file.name, size: file.size, mime, kind });
      if (!start.ok) throw new Error(apiErrorMessage(start.status, start.data.error));
      setProgress({ name: file.name, pct: 0, step: "Enviando..." });
      await putWithProgress(start.data.url, file, start.data.headers, (pct) => setProgress({ name: file.name, pct, step: "Enviando..." }));
      setProgress({ name: file.name, pct: 100, step: "Conferindo o arquivo..." });
      const done = await callApi<{ file: DealFileRow }>(`${base}/${start.data.file_id}`, "POST", {});
      if (!done.ok) throw new Error(done.data.error === "duplicate_file" ? `Este arquivo já está anexado (“${done.data.existing}”).` : apiErrorMessage(done.status, done.data.error));
      onUploaded(done.data.file);
    } catch (error) {
      onError(error instanceof Error && !/^upload|network$/.test(error.message) ? error.message : "O envio falhou. Confira a conexão e tente de novo.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  const download = async (file: DealFileRow) => {
    setDownloading(file.id);
    try {
      const { ok, status, data } = await callApi<{ url: string }>(`${basePath}/api/crm/deals/${dealId}/files/${file.id}`, "GET");
      if (!ok) throw new Error(apiErrorMessage(status, data.error));
      const a = document.createElement("a");
      a.href = data.url;
      a.rel = "noopener";
      a.click();
      onDownloaded();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível baixar.");
    } finally {
      setDownloading(null);
    }
  };

  if (!configured) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl bg-admin-tip p-6 text-sm text-admin-tip-text">
        <h2 className="flex items-center gap-2 text-base font-semibold text-admin-tip-title">
          <FaLock aria-hidden className="h-3.5 w-3.5" /> Armazenamento de arquivos ainda não configurado
        </h2>
        <p>Para anexar propostas e arquivos, ative o Firebase Storage e informe o bucket:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>No console do Firebase, ative o plano Blaze e abra Storage → Começar.</li>
          <li>Copie o nome do bucket (ex.: seu-projeto.firebasestorage.app) para FIREBASE_STORAGE_BUCKET no .env.local e na Vercel.</li>
          <li>Rode uma vez: node --env-file=.env.local scripts/storage-setup.mjs (libera o envio pelo painel e bloqueia o acesso direto).</li>
        </ol>
      </section>
    );
  }

  const groups = [
    { id: "proposta", label: "Propostas", items: files.filter((f) => f.kind === "proposta") },
    { id: "arquivo", label: "Arquivos", items: files.filter((f) => f.kind === "arquivo") },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="flex flex-col gap-4 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border" aria-label="Anexar">
        <h2 className="text-base font-medium text-text-primary">Anexar</h2>
        <div role="radiogroup" aria-label="Tipo do anexo" className="grid grid-cols-2 rounded-lg bg-admin-input p-1">
          {(
            [
              ["proposta", "Proposta"],
              ["arquivo", "Outro arquivo"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)} className="h-8 rounded-md text-xs font-semibold text-admin-text-description aria-checked:bg-admin-card aria-checked:text-text-primary">
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={Boolean(progress)}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file && !progress) upload(file);
          }}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${dragOver ? "border-admin-accent bg-admin-tip" : "border-admin-card-border hover:border-admin-accent/60"} disabled:cursor-wait`}
        >
          <FaCloudArrowUp aria-hidden className="h-6 w-6 text-admin-accent" />
          <span className="text-sm font-semibold text-text-primary">{progress ? progress.step : "Arraste aqui ou clique para escolher"}</span>
          <span className="text-xs text-admin-text-hint">PDF, Word, PowerPoint ou Excel · até 25 MB</span>
        </button>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {progress && (
          <div role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Enviando ${progress.name}`} className="flex flex-col gap-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-admin-card">
              <div className="h-full rounded-full bg-admin-primary transition-[width]" style={{ width: `${progress.pct}%` }} />
            </div>
            <span className="truncate text-xs text-admin-text-description">
              {progress.name} · {progress.pct}%
            </span>
          </div>
        )}
        <p className="flex items-start gap-2 text-xs text-admin-text-hint">
          <FaLock aria-hidden className="mt-0.5 h-3 w-3 shrink-0" /> Guardado de forma privada. O conteúdo é conferido no servidor e cada download gera um link de 5 minutos, registrado no histórico.
        </p>
      </section>

      <section className="flex flex-col gap-5 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border" aria-label="Anexos">
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-admin-text-description">
              {g.label} · {g.items.length}
            </h2>
            {g.items.length ? (
              <ul className="flex flex-col gap-2">
                {g.items.map((f) => {
                  const ext = DEAL_FILE_TYPES[f.mime]?.ext ?? "pdf";
                  const { icon: Icon, tone } = ICON[ext] ?? ICON.pdf;
                  return (
                    <li key={f.id} className="flex items-center gap-3 rounded-xl bg-admin-drawer-card px-4 py-3">
                      <Icon aria-hidden className={`h-6 w-6 shrink-0 ${tone}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">{f.name}</p>
                        <p className="text-xs text-admin-text-description">
                          {size(f.size)} · {formatDateTime(f.created_at)} · {f.uploaded_by_name ?? "—"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => download(f)}
                        disabled={downloading === f.id}
                        aria-label={`Baixar ${f.name}`}
                        className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-admin-accent hover:bg-admin-card disabled:opacity-50"
                      >
                        <FaDownload aria-hidden className="h-3 w-3" /> {downloading === f.id ? "Gerando..." : "Baixar"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-admin-text-hint">{g.id === "proposta" ? "Nenhuma proposta anexada." : "Nenhum arquivo anexado."}</p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
