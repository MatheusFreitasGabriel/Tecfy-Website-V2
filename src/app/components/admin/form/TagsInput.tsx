"use client";

import { useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { LIMITS, normalizeTags } from "@/lib/admin/crm/validation";

interface TagsInputProps {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Tags em chips: Enter, vírgula ou Tab adicionam; Backspace no campo vazio remove a última. */
export default function TagsInput({ id, value, onChange, placeholder, ...aria }: TagsInputProps) {
  const [draft, setDraft] = useState("");
  const full = value.length >= LIMITS.tags;

  const commit = (text: string) => {
    const parts = text.split(",").map((t) => t.trim().slice(0, LIMITS.tag));
    const next = normalizeTags([...value, ...parts]).slice(0, LIMITS.tags);
    onChange(next);
    setDraft("");
  };

  return (
    <div
      className={`flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg bg-admin-input px-2.5 py-1.5 outline outline-1 -outline-offset-1 focus-within:outline-2 focus-within:outline-admin-primary ${
        aria["aria-invalid"] ? "outline-admin-danger" : "outline-admin-input-border"
      }`}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-admin-badge py-1 pl-2 pr-1 text-xs font-medium text-admin-badge-text"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remover tag ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="flex h-4 w-4 items-center justify-center rounded text-admin-text-hint hover:text-text-primary"
          >
            <FaXmark aria-hidden className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={draft}
        disabled={full}
        autoComplete="off"
        placeholder={value.length ? (full ? "Limite de tags atingido" : "") : placeholder}
        maxLength={LIMITS.tag * 3}
        onChange={(event) => {
          const text = event.target.value;
          if (text.includes(",")) commit(text);
          else setDraft(text);
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === "Tab") && draft.trim()) {
            event.preventDefault();
            commit(draft);
          } else if (event.key === "Enter") {
            event.preventDefault();
          } else if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={aria["aria-describedby"]}
        className="h-8 min-w-[120px] flex-1 bg-transparent px-1 text-sm font-medium leading-5 text-admin-text-input outline-none placeholder:text-admin-text-hint disabled:cursor-not-allowed"
      />
    </div>
  );
}
