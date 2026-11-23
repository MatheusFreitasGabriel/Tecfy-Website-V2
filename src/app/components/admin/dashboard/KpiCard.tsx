interface KpiCardProps {
  label: string;
  value: string;
  /** Texto de apoio opcional abaixo do número (ex.: estado vazio ou erro). */
  hint?: string;
  /** Ilustração opcional à direita do número. */
  illustration?: React.ReactNode;
}

/**
 * Indicador do painel na identidade do site: moldura de borda fina com o card preto dentro
 * (como os cards de planos da landing), rótulo pequeno em caixa alta e número grande.
 */
export default function KpiCard({ label, value, hint, illustration }: KpiCardProps) {
  return (
    <div className="group min-w-0 border border-border-primary p-1.5 transition-colors hover:border-border-secondary">
      <div className="flex h-full min-h-[112px] min-w-0 items-center justify-between gap-6 bg-background-secondary px-5 py-5">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="truncate text-[10px] font-semibold uppercase leading-3 tracking-[0.1em] text-white/45">{label}</p>
          <p className="truncate text-[30px] font-medium leading-8 tracking-tight text-text-primary">{value}</p>
          {hint && <p className="truncate text-xs leading-4 text-white/40">{hint}</p>}
        </div>
        {illustration}
      </div>
    </div>
  );
}
