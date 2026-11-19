"use client";

import { useId, useMemo, useRef, useState } from "react";
import { FaChevronDown, FaMagnifyingGlass } from "react-icons/fa6";
import type { PickerOption } from "@/lib/admin/crm/types";

interface ComboboxProps {
  options: PickerOption[];
  placeholder: string;
  /** Rótulo para leitores de tela. */
  ariaLabel: string;
  onSelect: (option: PickerOption) => void;
  emptyText?: string;
}

/** Minúsculas e sem acentos. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const MAX_RESULTS = 50;

/** Busca de registro existente (contato/empresa): digita, filtra e escolhe com mouse ou teclado. */
export default function Combobox({ options, placeholder, ariaLabel, onSelect, emptyText = "Nada encontrado." }: ComboboxProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return options
      .filter((option) => {
        const haystack = normalize(`${option.label} ${option.hint ?? ""}`);
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, MAX_RESULTS);
  }, [options, query]);

  const choose = (option: PickerOption) => {
    onSelect(option);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (results.length) setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && open && results.length) {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault(); // fecha só a lista, não o modal
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <FaMagnifyingGlass
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-hint"
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-11 w-full min-w-0 rounded-lg bg-admin-picker pl-9 pr-10 text-[13px] font-medium leading-[19px] text-admin-text-input outline outline-1 -outline-offset-1 outline-admin-picker-border placeholder:text-admin-text-hint focus:outline-2 focus:outline-admin-primary"
      />
      <FaChevronDown
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-hint"
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 max-h-60 overflow-y-auto rounded-lg bg-admin-card p-1.5 shadow-2xl outline outline-1 -outline-offset-1 outline-admin-button-border"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-center text-[13px] text-admin-text-hint">{emptyText}</li>
          ) : (
            results.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // mousedown (antes do blur do input) para o clique não se perder.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseMove={() => setActive(index)}
                className={`flex cursor-pointer flex-col rounded-md px-3 py-2 ${index === active ? "bg-admin-badge" : ""}`}
              >
                <span className="truncate text-[13px] font-medium text-text-primary">{option.label}</span>
                {option.hint && <span className="truncate text-xs text-admin-text-hint">{option.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
