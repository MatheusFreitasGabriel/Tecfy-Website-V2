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
        className="flex h-11 w-full cursor-pointer items-center justify-between border border-border-secondary bg-background-secondary pl-3.5 pr-2.5 text-left transition-colors hover:border-white/50"
      >
        <span className="flex items-center gap-3">
          <FaMagnifyingGlass aria-hidden className="h-3.5 w-3.5 shrink-0 text-white/45" />
          <span className="text-[13px] font-medium leading-4 text-white/45">Pesquisar</span>
        </span>
        <kbd className="border border-border-secondary px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase leading-3 text-white/40">Ctrl+F</kbd>
      </button>

      {open && <SearchModal basePath={basePath} onClose={() => setOpen(false)} />}
    </>
  );
}
