import type { IconType } from "react-icons";

interface PageHeaderProps {
  /** Ícone da tela (o mesmo da sidebar). */
  icon: IconType;
  /** Nome da tela, mostrado acima do título. */
  section: string;
  title: React.ReactNode;
}

/**
 * Cabeçalho padrão das telas do painel, na identidade do site: rótulo laranja em caixa alta
 * (como "PLANOS E VALORES" na landing) e título grande em caixa alta.
 */
export default function PageHeader({ icon: Icon, section, title }: PageHeaderProps) {
  return (
    <header className="flex flex-col items-start gap-3">
      <div className="flex items-center gap-2 text-secondary">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[13px] font-medium uppercase leading-4 tracking-[0.06em]">{section}</span>
      </div>
      <h1 className="text-[32px] font-semibold uppercase leading-9 tracking-tight text-text-primary">{title}</h1>
    </header>
  );
}
