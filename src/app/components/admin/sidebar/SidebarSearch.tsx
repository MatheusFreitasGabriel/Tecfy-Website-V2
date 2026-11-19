"use client";

import { useEffect, useState } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import SearchModal from "./SearchModal";

/**
 * Barra de pesquisa da sidebar. Clicar nela ou apertar Ctrl+F (⌘F no Mac)
 * abre o modal de pesquisa de funcionalidades no topo-centro da tela.
 */
export default function SidebarSearch({ basePath }: { basePath: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between rounded-xl bg-background-surface py-3 pl-4 pr-2.5 text-left transition-colors hover:bg-tertiary"
      >
        <span className="flex items-center gap-4">
          <FaMagnifyingGlass aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
          <span className="text-base font-medium leading-4 text-text-muted">Pesquisar</span>
        </span>
        <kbd className="font-sans text-base font-medium leading-4 text-border-input">Ctrl+F</kbd>
      </button>

      {open && <SearchModal basePath={basePath} onClose={() => setOpen(false)} />}
    </>
  );
}
