import type { IconType } from "react-icons";

interface ComingSoonProps {
  title: string;
  icon: IconType;
}

/** Tela provisória para seções do painel que ainda não foram construídas. */
export default function ComingSoon({ title, icon: Icon }: ComingSoonProps) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-border-input bg-background-surface">
        <Icon aria-hidden className="h-6 w-6 text-text-muted" />
      </span>
      <h1 className="text-2xl font-medium text-text-primary">{title}</h1>
      <p className="text-sm text-text-tertiary">Em breve.</p>
    </div>
  );
}
