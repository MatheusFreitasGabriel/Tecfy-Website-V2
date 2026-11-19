"use client";

import { FaTriangleExclamation } from "react-icons/fa6";

/**
 * Erro inesperado numa tela do painel. A sidebar continua visível (fica no layout);
 * só o conteúdo é trocado por este aviso. Não mostra detalhes técnicos ao usuário.
 */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex min-h-screen w-full flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-border-input bg-background-surface">
        <FaTriangleExclamation aria-hidden className="h-6 w-6 text-text-muted" />
      </span>
      <h1 className="text-2xl font-medium text-text-primary">Algo deu errado</h1>
      <p className="text-sm text-text-tertiary">Não foi possível carregar esta tela.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-border-input bg-background-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-background-kpi"
      >
        Tentar de novo
      </button>
    </div>
  );
}
