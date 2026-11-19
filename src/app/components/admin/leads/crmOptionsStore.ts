"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { PickerOption } from "@/lib/admin/crm/types";

/**
 * Contatos e empresas para as buscas dos modais ("Buscar contato/empresa existente").
 * Carregados SOB DEMANDA (só quando um modal que precisa abre) e uma vez por sessão da tela;
 * requisições simultâneas são unificadas. Depois de criar um contato/empresa, `invalidate`
 * faz a próxima abertura buscar de novo (o servidor responde do cache dele).
 */
export type OptionsType = "contacts" | "companies";

interface Entry {
  options: PickerOption[] | null;
  error: boolean;
}

const state: Record<OptionsType, Entry> = {
  contacts: { options: null, error: false },
  companies: { options: null, error: false },
};
const inflight: Partial<Record<OptionsType, Promise<void>>> = {};
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version += 1;
  for (const listener of listeners) listener();
};

function load(basePath: string, type: OptionsType): Promise<void> {
  if (state[type].options || inflight[type]) return inflight[type] ?? Promise.resolve();
  const request = (async () => {
    try {
      const response = await fetch(`${basePath}/api/crm/options?type=${type}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { options: PickerOption[] };
      state[type] = { options: data.options, error: false };
    } catch {
      state[type] = { options: null, error: true };
    } finally {
      delete inflight[type];
      emit();
    }
  })();
  inflight[type] = request;
  return request;
}

/** Esquece a lista (ex.: depois de criar um contato) — a próxima abertura busca de novo. */
export function invalidateCrmOptions(...types: OptionsType[]): void {
  for (const type of types) state[type] = { options: null, error: false };
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Opções do tipo pedido; dispara o carregamento na primeira vez. `null` = carregando. */
export function useCrmOptions(basePath: string, type: OptionsType): { options: PickerOption[] | null; error: boolean } {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  const entry = state[type];
  // Carrega na primeira vez e de novo se a lista for invalidada com o modal aberto.
  useEffect(() => {
    if (!entry.options && !entry.error) void load(basePath, type);
  }, [basePath, type, entry.options, entry.error]);
  return entry;
}
