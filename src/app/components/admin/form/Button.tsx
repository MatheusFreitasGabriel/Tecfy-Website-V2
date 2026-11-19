import type { IconType } from "react-icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-admin-primary text-text-primary hover:bg-admin-primary-hover",
  danger: "bg-admin-danger-strong text-text-primary hover:bg-admin-danger-strong-hover",
  secondary:
    "bg-admin-card text-text-primary outline outline-1 -outline-offset-1 outline-admin-button-border hover:bg-admin-badge",
  ghost: "text-admin-accent hover:bg-admin-card",
};

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: Variant;
  icon?: IconType;
  /** Ocupa a largura toda. */
  block?: boolean;
  className?: string;
};

/** Botões do painel (44px de altura, raio 10, texto 14/600). */
export default function Button({ variant = "primary", icon: Icon, block, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-6 text-sm font-semibold leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        variants[variant]
      } ${block ? "w-full" : ""} ${className ?? ""}`}
    >
      {Icon && <Icon aria-hidden className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
