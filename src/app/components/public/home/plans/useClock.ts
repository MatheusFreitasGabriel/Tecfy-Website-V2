"use client";

import { useSyncExternalStore } from "react";

/** Relógio de minuto em minuto, compartilhado. Na hidratação usa o horário do servidor (sem mismatch). */
let current = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useClock(serverNow: number): number {
  return useSyncExternalStore(
    subscribe,
    () => current || serverNow,
    () => serverNow,
  );
}
