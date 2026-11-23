"use client";

/**
 * Filtro segmentado no estilo do seletor "PLANOS MENSAIS / PLANOS ÚNICOS" do site:
 * moldura de borda fina, opção ativa branca com texto preto, contagem ao lado.
 */
interface FilterTabsProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  className?: string;
}

export default function FilterTabs<T extends string>({ label, value, options, onChange, className }: FilterTabsProps<T>) {
  return (
    <div role="group" aria-label={label} className={`flex w-fit max-w-full overflow-x-auto border border-border-secondary p-1 ${className ?? ""}`}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`flex h-9 shrink-0 items-center gap-2 px-4 text-xs font-bold uppercase tracking-wide transition-colors ${active ? "bg-white text-background" : "text-white/50 hover:text-white"}`}
          >
            {o.label}
            {o.count !== undefined && <span className={`text-[11px] font-semibold ${active ? "text-background/50" : "text-white/30"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
