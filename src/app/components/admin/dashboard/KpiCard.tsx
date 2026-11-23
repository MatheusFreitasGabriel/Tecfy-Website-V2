import Link from "next/link";
import { FaArrowDown, FaArrowRight, FaArrowUp } from "react-icons/fa6";

interface KpiCardProps {
  label: string;
  value: string;
  /** Texto de apoio opcional abaixo do número (ex.: estado vazio ou erro). */
  hint?: string;
  /** Ilustração opcional à direita do número. */
  illustration?: React.ReactNode;
  /** Variação contra o período anterior (0.12 = +12%). */
  delta?: number | null;
  /** Quando cair é bom (ex.: cancelamentos, tarefas atrasadas). */
  lowerIsBetter?: boolean;
  /** Destaca em vermelho (ex.: há tarefas atrasadas). */
  alert?: boolean;
  /** Leva para a tela de detalhe. */
  href?: string;
}

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });

/**
 * Indicador do painel na identidade do site: moldura de borda fina com o card preto dentro
 * (como os cards de planos da landing), rótulo pequeno em caixa alta e número grande.
 */
export default function KpiCard({ label, value, hint, illustration, delta, lowerIsBetter, alert, href }: KpiCardProps) {
  const good = delta === null || delta === undefined ? null : lowerIsBetter ? delta < 0 : delta > 0;
  const body = (
    <div className="flex h-full min-h-[112px] min-w-0 items-center justify-between gap-6 bg-background-secondary px-5 py-5">
      <div className="flex min-w-0 flex-col gap-3">
        <p className="flex items-center gap-2 truncate text-[10px] font-semibold uppercase leading-3 tracking-[0.1em] text-white/45">
          {label}
          {href && <FaArrowRight aria-hidden className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />}
        </p>
        <p className={`truncate text-[30px] font-medium leading-8 tracking-tight ${alert ? "text-admin-danger" : "text-text-primary"}`}>{value}</p>
        {(hint || (delta !== null && delta !== undefined)) && (
          <p className="flex min-w-0 items-center gap-2 text-xs leading-4 text-white/40">
            {delta !== null && delta !== undefined && delta !== 0 && (
              <span className={`inline-flex shrink-0 items-center gap-1 font-semibold ${good ? "text-admin-success" : "text-admin-danger"}`}>
                {delta > 0 ? <FaArrowUp aria-hidden className="h-2.5 w-2.5" /> : <FaArrowDown aria-hidden className="h-2.5 w-2.5" />}
                {pct.format(delta)}
              </span>
            )}
            {hint && <span className="truncate">{hint}</span>}
          </p>
        )}
      </div>
      {illustration}
    </div>
  );
  const frame = `group block min-w-0 border p-1.5 transition-colors ${alert ? "border-admin-danger/40 hover:border-admin-danger" : "border-border-primary hover:border-border-secondary"}`;
  return href ? (
    <Link href={href} className={frame}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
