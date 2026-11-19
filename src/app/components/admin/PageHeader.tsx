import type { IconType } from "react-icons";

interface PageHeaderProps {
  /** Ícone da tela (o mesmo da sidebar). */
  icon: IconType;
  /** Nome da tela, mostrado acima do título. */
  section: string;
  title: React.ReactNode;
}

/** Cabeçalho padrão das telas do painel: ícone + nome da tela e, 24px abaixo, o título. */
export default function PageHeader({ icon: Icon, section, title }: PageHeaderProps) {
  return (
    <header className="flex flex-col items-start gap-6">
      <div className="flex items-center gap-3 text-border-input">
        <Icon aria-hidden className="h-4 w-4 shrink-0" />
        <span className="text-base font-medium leading-4">{section}</span>
      </div>
      <h1 className="text-[32px] font-medium leading-8 text-text-primary">{title}</h1>
    </header>
  );
}
