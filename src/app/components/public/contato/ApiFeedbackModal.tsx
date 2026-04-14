"use client";

import { useEffect, useMemo } from "react";
import { LeadInsertResponseData } from "@/services/types";
import { getCalApi } from "@calcom/embed-react";

interface ApiFeedbackModalProps {
  isOpen: boolean;
  type: "success" | "error" | "conflict" | "rate_limit";
  responseData: LeadInsertResponseData | null;
  errorMessage: string;
  onClose: () => void;
  email: string | null;
  name: string | null;
}

export default function ApiFeedbackModal({
  isOpen,
  type,
  responseData,
  errorMessage,
  onClose,
}: ApiFeedbackModalProps) {
  
  // Configuração do Cal.com (memoizada para evitar re-renders desnecessários)
  const calConfigJson = useMemo(() => {
    if (!responseData) return "{}";
    return JSON.stringify({
      layout: "month_view",
      theme: "dark",
      name: responseData.name || "", // Ajuste conforme a estrutura do seu LeadInsertResponseData
      email: responseData.email || "",
    });
  }, [responseData]);

  // Inicializa o Cal.com quando o modal de sucesso ou conflito abrir
  useEffect(() => {
    if (!isOpen || (type !== "success" && type !== "conflict")) return;

    (async function initCal() {
      const cal = await getCalApi({ namespace: "30min" });
      cal("ui", {
        theme: "dark",
        styles: { branding: { brandColor: "#000000" } },
        hideEventTypeDetails: false,
        layout: "month_view",
      });
    })();
  }, [isOpen, type]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-xl border border-[#252525] bg-[#0a0a0a] p-8 text-white shadow-2xl">
        
        {/* Título Dinâmico */}
        <h3 className="mb-4 text-2xl font-semibold uppercase leading-tight">
          {type === "success"
            ? "Obrigado por escolher a Tecfy!"
            : type === "conflict"
            ? "E-mail já cadastrado"
            : type === "rate_limit"
            ? "Muitas requisições"
            : "Erro ao enviar"}
        </h3>

        {/* Conteúdo Dinâmico */}
        <div className="mb-8">
          {type === "success" ? (
            <p className="text-gray-400">
              Nossa equipe entrará em contato com você logo, logo; ou, se preferir, já pode ir marcando um horário para uma reunião abaixo.
            </p>
          ) : type === "conflict" ? (
            <p className="text-yellow-500/90">
              Este e-mail já está sendo utilizado. Você pode tentar novamente com outro e-mail ou já agendar sua reunião com nosso time agora mesmo.
            </p>
          ) : type === "rate_limit" ? (
            <p className="text-yellow-500/90">
              Você fez muitas requisições em pouco tempo. Aguarde alguns instantes e tente novamente.
            </p>
          ) : (
            <p className="text-red-400">{errorMessage}</p>
          )}
        </div>

        {/* Ações (Botões) */}
        <div className="flex flex-col gap-3">
          {(type === "success" || type === "conflict") && (
            <button
              type="button"
              data-cal-namespace="30min"
              data-cal-link="tecfydev/briefing-sem-modestia"
              data-cal-config={calConfigJson}
              className="flex h-12 w-full items-center justify-center bg-white font-semibold uppercase text-black transition hover:bg-gray-200"
            >
              Agendar reunião agora
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className={`h-12 w-full font-semibold uppercase transition ${
              type === "success" || type === "conflict"
                ? "border border-[#252525] text-white hover:bg-[#151515]"
                : "bg-white text-black hover:bg-gray-200"
            }`}
          >
            {type === "success" ? "Voltar" : "Fechar"}
          </button>
        </div>
      </div>
    </div>
  );
}