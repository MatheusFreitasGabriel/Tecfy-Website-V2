import type { IconType } from "react-icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-admin-primary text-admin-primary-text hover:bg-admin-primary-hover",
  danger: "border border-admin-danger/60 text-admin-danger hover:border-admin-danger hover:bg-admin-danger/10",
  secondary:
    "border border-admin-button-border bg-transparent text-text-primary hover:border-white/60 hover:bg-white/5",
  ghost: "text-white/70 hover:bg-white/5 hover:text-white",
};

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: Variant;
  icon?: IconType;
  /** Ocupa a largura toda. */
  block?: boolean;
  className?: string;
};

/** Botões do painel na identidade do site: 44px, cantos retos; principal branco com texto preto (como o CTA da landing). */
export default function Button({ variant = "primary", icon: Icon, block, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-6 text-sm font-semibold leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${
        variants[variant]
      } ${block ? "w-full" : ""} ${className ?? ""}`}
    >
      {Icon && <Icon aria-hidden className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
