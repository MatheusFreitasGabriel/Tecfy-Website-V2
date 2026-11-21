"use client";

import Link from "next/link";
import { FaArrowUpRightFromSquare, FaCircleCheck, FaCircleXmark, FaDownload, FaFileImport, FaList, FaRotateRight } from "react-icons/fa6";
import type { CommitRowResult } from "@/lib/admin/crm/leadImport/commit";
import Button from "../../form/Button";
import { integer } from "./importVisuals";

export interface ResultLine extends CommitRowResult {
  title: string;
}

interface ImportResultProps {
  results: ResultLine[];
  skipped: { line: number; title: string; reason: string }[];
  basePath: string;
  onRetryFailed: (() => void) | null;
  onDownloadReport: () => void;
  onNew: () => void;
}

const OUTCOME: Record<CommitRowResult["outcome"], { label: string; className: string }> = {
  created: { label: "Lead criado", className: "text-admin-success" },
  updated: { label: "Lead existente atualizado", className: "text-admin-accent" },
  already: { label: "Já tinha sido importado", className: "text-admin-text-hint" },
  failed: { label: "Falhou", className: "text-admin-danger" },
};

/** Etapa final: o que aconteceu com cada linha. */
export default function ImportResult({ results, skipped, basePath, onRetryFailed, onDownloadReport, onNew }: ImportResultProps) {
  const count = (o: CommitRowResult["outcome"]) => results.filter((r) => r.outcome === o).length;
  const failed = count("failed");
  const filled = results.filter((r) => r.filled.length > 0).length;

  const cards = [
    { label: "Leads criados", value: count("created"), className: "text-admin-success" },
    { label: "Existentes atualizados", value: count("updated"), className: "text-admin-accent" },
    { label: "Cadastros completados", value: filled, className: "text-admin-stage-blue" },
    { label: "Pulados", value: skipped.length + count("already"), className: "text-admin-text-label" },
    { label: "Com falha", value: failed, className: failed ? "text-admin-danger" : "text-admin-text-label" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section
        className={`flex flex-col gap-4 rounded-2xl p-6 outline outline-1 -outline-offset-1 sm:flex-row sm:items-center sm:justify-between ${
          failed ? "bg-admin-deal-lost/40 outline-admin-danger/40" : "bg-admin-qual-sure/40 outline-admin-success/30"
        }`}
      >
        <div className="flex items-center gap-4">
          {failed ? <FaCircleXmark aria-hidden className="h-8 w-8 shrink-0 text-admin-danger" /> : <FaCircleCheck aria-hidden className="h-8 w-8 shrink-0 text-admin-success" />}
          <div>
            <p className="text-lg font-semibold leading-6 text-text-primary">{failed ? "Importação concluída com falhas" : "Importação concluída"}</p>
            <p className="text-sm font-medium leading-5 text-admin-text-description">
              {failed ? "As linhas com falha não foram gravadas. Você pode tentar de novo só elas." : "Os leads já estão na lista de Leads."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {onRetryFailed && (
            <Button variant="secondary" icon={FaRotateRight} onClick={onRetryFailed}>
              Tentar de novo as falhas
            </Button>
          )}
          <Button variant="secondary" icon={FaDownload} onClick={onDownloadReport}>
            Baixar relatório
          </Button>
          <Button variant="secondary" icon={FaFileImport} onClick={onNew}>
            Importar outra lista
          </Button>
          <Link
            href={`${basePath}/leads`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-admin-primary px-6 text-sm font-semibold leading-5 text-text-primary transition-colors hover:bg-admin-primary-hover"
          >
            <FaList aria-hidden className="h-3.5 w-3.5" /> Ver leads
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="flex flex-col gap-1 rounded-2xl bg-background-kpi p-5 outline outline-1 -outline-offset-1 outline-admin-card-border">
            <p className="text-xs font-medium leading-4 text-admin-text-description">{c.label}</p>
            <p className={`text-[28px] font-semibold leading-9 ${c.className}`}>{integer.format(c.value)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl outline outline-1 -outline-offset-1 outline-admin-table-border">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-admin-table-head text-xs font-medium leading-[18px] text-admin-table-head-text">
            <tr>
              <th className="w-16 px-5 py-3 font-medium">Linha</th>
              <th className="px-3 py-3 font-medium">Lead</th>
              <th className="px-3 py-3 font-medium">Resultado</th>
              <th className="px-3 py-3 font-medium">Detalhes</th>
              <th className="w-20 px-5 py-3 font-medium">
                <span className="sr-only">Abrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...results.map((r) => ({ ...r, kind: "result" as const })), ...skipped.map((s) => ({ ...s, kind: "skip" as const }))]
              .sort((a, b) => a.line - b.line)
              .map((r, i) => (
                <tr key={r.line} className={`border-t border-admin-table-divider text-sm ${i % 2 ? "bg-admin-table-alt" : "bg-admin-table"}`}>
                  <td className="px-5 py-3 text-xs font-medium text-admin-table-date">{r.line}</td>
                  <td className="max-w-[320px] truncate px-3 py-3 font-semibold text-text-primary">{r.title || "—"}</td>
                  {r.kind === "result" ? (
                    <>
                      <td className={`px-3 py-3 font-semibold ${OUTCOME[r.outcome].className}`}>{OUTCOME[r.outcome].label}</td>
                      <td className="px-3 py-3 text-xs font-medium leading-4 text-admin-table-subtext">
                        {[r.filled.length ? `Completado: ${r.filled.join(", ")}` : null, r.message].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-5 py-3">
                        {r.lead_id && (
                          <a
                            href={`${basePath}/leads?lead=${r.lead_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-admin-accent hover:underline"
                          >
                            Abrir <FaArrowUpRightFromSquare aria-hidden className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3 font-semibold text-admin-text-hint">Pulado</td>
                      <td className="px-3 py-3 text-xs font-medium leading-4 text-admin-table-subtext">{r.reason}</td>
                      <td />
                    </>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
