"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FaRotate } from "react-icons/fa6";
import { callApi } from "../deal-detail/dealApi";

/**
 * Limpa o cache do painel inteiro e recarrega a tela. Para quando algo mudou direto no banco
 * (fora do painel) e as listas ainda mostram o dado antigo.
 */
export default function RefreshDataButton({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");

  const run = async () => {
    setBusy(true);
    setStatus("idle");
    try {
      const { ok } = await callApi(`${basePath}/api/crm/cache`, "POST", {});
      if (!ok) throw new Error("falhou");
      setStatus("done");
      startRefresh(() => router.refresh());
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  const working = busy || refreshing;
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={working}
      title="Busca tudo de novo no banco de dados (use se algo foi alterado fora do painel)."
      className="inline-flex h-10 items-center gap-2 border border-admin-button-border px-4 text-[13px] font-semibold text-white transition-colors hover:border-white/60 hover:bg-white/5 disabled:opacity-60"
    >
      <FaRotate aria-hidden className={`h-3 w-3 ${working ? "animate-spin" : ""}`} />
      {working ? "Recarregando..." : status === "done" ? "Dados atualizados" : status === "error" ? "Tentar de novo" : "Recarregar dados"}
    </button>
  );
}
