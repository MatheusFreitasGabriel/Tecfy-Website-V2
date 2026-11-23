/**
 * Etiqueta do painel na identidade do site: fundo preto, borda fina, texto pequeno em caixa alta.
 * O significado por cor vai só numa bolinha (`dot`, qualquer cor CSS), para a etiqueta continuar sóbria.
 */
interface TagProps {
  children: React.ReactNode;
  /** muted = cinza; live = borda mais clara e texto branco; solid = branca com texto preto (destaque/promoção). */
  tone?: "muted" | "live" | "solid";
  /** Cor da bolinha (ex.: "var(--admin-success)"). Sem ela, sem bolinha. */
  dot?: string;
  title?: string;
  className?: string;
}

export default function Tag({ children, tone = "live", dot, title, className }: TagProps) {
  const style =
    tone === "solid" ? "border-white bg-white text-background" : tone === "live" ? "border-border-secondary text-white/90" : "border-border-card text-white/55";
  return (
    <span title={title} className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap border px-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${style} ${className ?? ""}`}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}
