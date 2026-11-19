"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FaArrowTurnDown, FaMagnifyingGlass } from "react-icons/fa6";
import { adminFeatures, type AdminFeature } from "./SearchData";
import { buildAdminHref } from "./SidebarData";

interface SearchModalProps {
  basePath: string;
  onClose: () => void;
}

/** Minúsculas e sem acentos, para "inicio" encontrar "Início". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function matches(feature: AdminFeature, query: string): boolean {
  if (!query) return true;
  const haystack = normalize([feature.label, feature.description, ...(feature.keywords ?? [])].join(" "));
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

/** Modal de pesquisa de funcionalidades: abre no topo-centro da tela, por cima de tudo. */
export default function SearchModal({ basePath, onClose }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = normalize(query);
    return adminFeatures.filter((feature) => matches(feature, q));
  }, [query]);

  // Foco no campo, trava o scroll da página e devolve o foco ao fechar.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  const open = (feature: AdminFeature) => {
    onClose();
    router.push(buildAdminHref(basePath, feature.href));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      open(results[active]);
    }
  };

  return createPortal(
    <div
      className="admin-search-overlay fixed inset-0 z-50 flex justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pesquisar funcionalidades"
        onKeyDown={onKeyDown}
        className="admin-search-panel flex h-fit max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden rounded-xl border border-border-input bg-background-surface shadow-2xl"
      >
        <div className="flex items-center gap-4 border-b border-border-input py-4 pl-4 pr-2.5">
          <FaMagnifyingGlass aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Pesquisar funcionalidades"
            aria-label="Pesquisar funcionalidades"
            aria-controls="admin-search-results"
            aria-activedescendant={results[active] ? `admin-search-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="w-full min-w-0 bg-transparent text-base font-medium leading-4 text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="shrink-0 rounded-md border border-border-input px-1.5 py-1 font-sans text-xs font-medium leading-3 text-text-tertiary">
            Esc
          </kbd>
        </div>

        <ul id="admin-search-results" role="listbox" className="overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-text-tertiary">
              Nenhuma funcionalidade encontrada para “{query.trim()}”.
            </li>
          ) : (
            results.map((feature, index) => {
              const Icon = feature.icon;
              const isActive = index === active;
              return (
                <li
                  key={feature.href}
                  id={`admin-search-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseMove={() => setActive(index)}
                  onClick={() => open(feature)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    isActive ? "bg-tertiary text-text-primary" : "text-text-secondary"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-input">
                    <Icon aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{feature.label}</span>
                    <span className="truncate text-xs text-text-tertiary">{feature.description}</span>
                  </span>
                  {isActive && <FaArrowTurnDown aria-hidden className="h-3.5 w-3.5 shrink-0 rotate-90 text-text-tertiary" />}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
