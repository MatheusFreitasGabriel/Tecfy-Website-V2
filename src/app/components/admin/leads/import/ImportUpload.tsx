"use client";

import { useRef, useState } from "react";
import { FaBuilding, FaCircleInfo, FaClockRotateLeft, FaCloudArrowUp, FaDownload, FaSpinner, FaUser, FaUserTie } from "react-icons/fa6";
import { IMPORT_COLUMNS, IMPORT_LIMITS, templateCsv, type ImportGroup } from "@/lib/admin/crm/leadImport/columns";
import type { ImportHistoryRow } from "@/lib/admin/crm/leadImport/commit";
import Button from "../../form/Button";
import { formatDateTime } from "../leadVisuals";
import { downloadCsv, integer } from "./importVisuals";

interface ImportUploadProps {
  loading: boolean;
  error: string | null;
  history: ImportHistoryRow[];
  onFile: (file: File) => void;
}

const GROUPS: { group: ImportGroup; label: string; icon: typeof FaUser }[] = [
  { group: "lead", label: "Lead", icon: FaUserTie },
  { group: "contact", label: "Contato", icon: FaUser },
  { group: "company", label: "Empresa", icon: FaBuilding },
];

/** Etapa 1: escolher a planilha. A leitura é feita no navegador; nada é gravado ainda. */
export default function ImportUpload({ loading, error, history, onFile }: ImportUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="flex flex-col gap-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!loading) pick(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging ? "border-admin-accent bg-admin-tip" : "border-admin-card-border bg-background-kpi"
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-admin-tip text-admin-accent">
          {loading ? <FaSpinner aria-hidden className="h-6 w-6 animate-spin" /> : <FaCloudArrowUp aria-hidden className="h-6 w-6" />}
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-lg font-semibold leading-6 text-text-primary">{loading ? "Lendo e analisando a planilha..." : "Arraste a planilha aqui"}</p>
          <p className="text-sm font-medium leading-5 text-admin-text-description">
            .xlsx ou .csv · até {integer.format(IMPORT_LIMITS.rows)} linhas · nada é cadastrado antes da sua confirmação
          </p>
        </div>
        <Button icon={FaCloudArrowUp} onClick={() => inputRef.current?.click()} disabled={loading}>
          Escolher arquivo
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className="max-w-xl text-sm font-medium leading-5 text-admin-danger">
            {error}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Modelo de colunas */}
        <section className="flex flex-col gap-5 rounded-2xl bg-background-kpi p-6 outline outline-1 -outline-offset-1 outline-admin-card-border">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-medium leading-6 text-text-primary">Colunas da planilha</h2>
              <p className="text-sm font-medium leading-5 text-admin-text-description">
                Uma linha por lead. A ordem não importa: as colunas são reconhecidas pelo nome. Só <strong className="text-text-primary">Nome do lead</strong> é obrigatório.
              </p>
            </div>
            <Button variant="secondary" icon={FaDownload} onClick={() => downloadCsv("modelo-importacao-leads.csv", templateCsv())}>
              Baixar modelo
            </Button>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {GROUPS.map(({ group, label, icon: Icon }) => (
              <div key={group} className="flex flex-col gap-2.5">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-admin-text-label">
                  <Icon aria-hidden className="h-3 w-3" /> {label}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {IMPORT_COLUMNS.filter((c) => c.group === group).map((c) => (
                    <li
                      key={c.field}
                      title={"hint" in c ? c.hint : undefined}
                      className={`rounded-md px-2 py-1 text-xs font-medium leading-4 ${
                        "required" in c && c.required ? "bg-admin-tip text-admin-tip-title" : "bg-admin-badge text-admin-badge-text"
                      }`}
                    >
                      {c.header}
                      {"required" in c && c.required ? " *" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex gap-3 rounded-xl bg-admin-tip p-4">
            <FaCircleInfo aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-admin-tip-title" />
            <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] font-medium leading-5 text-admin-tip-text">
              <li>Listas (Etapa, Origem, Segmento...) aceitam o texto que aparece no painel, como &quot;Quente&quot; ou &quot;Média empresa&quot;.</li>
              <li>&quot;Responsável&quot; vazio ou &quot;[Responsável]&quot; usa o responsável padrão escolhido na revisão.</li>
              <li>Linhas sem e-mail, telefone e site são marcadas para não cadastrar.</li>
              <li>Empresa, contato ou lead que já existem aparecem como duplicados, com o que tem de novo, antes de qualquer gravação.</li>
            </ul>
          </div>
        </section>

        {/* Histórico */}
        <section className="flex flex-col gap-4 rounded-2xl bg-background-kpi p-6 outline outline-1 -outline-offset-1 outline-admin-card-border">
          <h2 className="flex items-center gap-2 text-base font-medium leading-6 text-text-primary">
            <FaClockRotateLeft aria-hidden className="h-3.5 w-3.5 text-admin-text-hint" /> Últimas importações
          </h2>
          {history.length === 0 ? (
            <p className="text-sm font-medium leading-5 text-admin-text-description">Nenhuma importação feita por esta tela ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-admin-divider">
              {history.map((h) => (
                <li key={h.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <p className="truncate text-sm font-semibold leading-5 text-text-primary" title={h.file_name}>
                    {h.file_name}
                  </p>
                  <p className="text-xs font-medium leading-[18px] text-admin-table-subtext">
                    {formatDateTime(h.created_at)}
                    {h.created_by_name ? ` · ${h.created_by_name}` : ""}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-xs font-medium leading-[18px]">
                    <span className="text-admin-success">{integer.format(h.created)} criados</span>
                    {h.updated > 0 && <span className="text-admin-accent">{integer.format(h.updated)} atualizados</span>}
                    <span className="text-admin-text-hint">{integer.format(h.skipped)} pulados</span>
                    {h.failed > 0 && <span className="text-admin-danger">{integer.format(h.failed)} com falha</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
