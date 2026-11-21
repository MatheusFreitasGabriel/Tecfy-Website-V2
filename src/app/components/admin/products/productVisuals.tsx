import type { IconType } from "react-icons";
import {
  FaBoxOpen,
  FaCartShopping,
  FaChartLine,
  FaCode,
  FaGem,
  FaGlobe,
  FaHandshake,
  FaHeadset,
  FaLayerGroup,
  FaMobileScreen,
  FaRobot,
  FaRocket,
} from "react-icons/fa6";
import { productBillings, type ProductBilling, type ProductIcon, type StageColor } from "@/lib/admin/crm/options";

export const PRODUCT_ICONS: Record<ProductIcon, IconType> = {
  rocket: FaRocket,
  code: FaCode,
  globe: FaGlobe,
  layers: FaLayerGroup,
  mobile: FaMobileScreen,
  cart: FaCartShopping,
  chart: FaChartLine,
  robot: FaRobot,
  headset: FaHeadset,
  handshake: FaHandshake,
  gem: FaGem,
  box: FaBoxOpen,
};

/** Cor do produto = variável CSS da paleta das etapas (`--admin-stage-*`). Use com `text-(--pc)`, `bg-(--pc)/15`. */
export const colorVar = (color: StageColor) => ({ "--pc": `var(--admin-stage-${color})` }) as React.CSSProperties;

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const integer = new Intl.NumberFormat("pt-BR");
export const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

/** Reais → "R$ 2.709" (sem centavos quando redondo). */
export const money = (value: number) => (Number.isInteger(value) ? brl0.format(value) : brl.format(value));

interface PriceLike {
  billing: ProductBilling;
  monthly_price: number | null;
  one_time_price: number | null;
  setup_fee: number | null;
}

/** Preço como aparece no card: valor grande + sufixo + linha extra (implantação). */
export function priceParts(p: PriceLike): { main: string; suffix: string | null; extra: string | null } {
  const extra = p.setup_fee ? `+ ${money(p.setup_fee)} de implantação` : null;
  if (p.billing === "unico") return { main: p.one_time_price ? money(p.one_time_price) : "—", suffix: "pagamento único", extra: null };
  if (p.billing === "sob_consulta") return { main: "Sob consulta", suffix: null, extra };
  return { main: p.monthly_price ? money(p.monthly_price) : "—", suffix: "/mês", extra };
}

export function BillingBadge({ billing }: { billing: ProductBilling }) {
  const style =
    billing === "unico"
      ? "bg-admin-qual-hot text-admin-qual-hot-text"
      : billing === "sob_consulta"
        ? "bg-admin-qual-warm text-admin-qual-warm-text"
        : "bg-admin-qual-cold text-admin-qual-cold-text";
  return <span className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide ${style}`}>{productBillings.label(billing)}</span>;
}

export function ProductIconBox({ icon, color, size = "md" }: { icon: ProductIcon; color: StageColor; size?: "md" | "lg" }) {
  const Icon = PRODUCT_ICONS[icon];
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : "h-11 w-11 rounded-xl";
  return (
    <span style={colorVar(color)} className={`flex shrink-0 items-center justify-center bg-(--pc)/15 text-(--pc) ${box}`}>
      <Icon aria-hidden className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />
    </span>
  );
}

/** "2027-06" → "jun/2027". */
export function monthLabel(key: string | null): string {
  if (!key) return "—";
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1))).replace(". de ", "/").replace(" de ", "/");
}
