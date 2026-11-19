interface KpiCardProps {
  label: string;
  value: string;
  /** Texto de apoio opcional abaixo do número (ex.: estado vazio ou erro). */
  hint?: string;
  /** Ilustração opcional à direita do número. */
  illustration?: React.ReactNode;
}

/** Card de indicador do dashboard (rótulo cinza + número grande). */
export default function KpiCard({ label, value, hint, illustration }: KpiCardProps) {
  return (
    <div className="flex min-h-[112px] min-w-0 items-center justify-between gap-6 rounded-xl bg-background-kpi p-6 outline outline-1 -outline-offset-1 outline-text-disabled">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="truncate text-base font-medium leading-4 text-text-kpi-label">{label}</p>
        <p className="truncate text-[32px] font-medium leading-8 text-text-primary">{value}</p>
        {hint && <p className="text-xs leading-4 text-text-kpi-label">{hint}</p>}
      </div>
      {illustration}
    </div>
  );
}
