"use client";

import { LeadInsertResponseData } from "@/services/types";
import { SCHEDULE_MEETING_URL } from "@/services/api/apiConfig";

interface ApiFeedbackModalProps {
  isOpen: boolean;
  type: "success" | "error" | "conflict" | "rate_limit";
  responseData: LeadInsertResponseData | null;
  errorMessage: string;
  onClose: () => void;
}

export default function ApiFeedbackModal({
  isOpen,
  type,
  responseData,
  errorMessage,
  onClose
}: ApiFeedbackModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-xl border border-[#252525] bg-[#0a0a0a] p-6 text-white">
        <h3 className="mb-4 text-xl font-semibold uppercase">
          {type === "success"
            ? "Resposta da API"
            : type === "conflict"
            ? "Email ja cadastrado"
            : type === "rate_limit"
            ? "Muitas requisicoes"
            : "Erro ao enviar"}
        </h3>

        {type === "success" ? (
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap wrap-break-word rounded border border-[#252525] bg-black p-3 text-sm">
            {JSON.stringify(responseData, null, 2)}
          </pre>
        ) : type === "conflict" ? (
          <p className="text-sm text-yellow-500">
            Este email ja esta sendo utilizado e houve conflito de dados. Clique no botao abaixo para marcar uma reuniao com a nossa equipe.
          </p>
        ) : type === "rate_limit" ? (
          <p className="text-sm text-yellow-500">
            Voce fez muitas requisicoes em pouco tempo. Aguarde alguns instantes e tente novamente.
          </p>
        ) : (
          <p className="text-sm text-red-400">{errorMessage}</p>
        )}

        {type === "conflict" ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a
              href={SCHEDULE_MEETING_URL}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 w-full items-center justify-center bg-white font-semibold uppercase text-black transition hover:bg-gray-200"
            >
              Marcar reuniao
            </a>
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full border border-[#252525] font-semibold uppercase text-white transition hover:bg-[#151515]"
            >
              Fechar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="mt-5 h-11 w-full bg-white font-semibold uppercase text-black transition hover:bg-gray-200"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}
