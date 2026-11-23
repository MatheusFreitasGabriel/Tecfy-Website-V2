import { FaGlobe, FaTag } from "react-icons/fa6";
import { PRODUCT_ICONS } from "@/app/components/public/home/plans/planIcons";
import type { Product } from "@/lib/admin/crm/types";
import { basePrice, priceAt, promoStatus, type PriceAt, type PromoInfo } from "@/lib/site/plans";
import { productBillings, type ProductBilling, type ProductIcon, type StageColor } from "@/lib/admin/crm/options";

export { PRODUCT_ICONS };

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

// ── Preço vigente / promoção / site ─────────────────────────────────────────

/** Preço vigente (promoção ativa, reajuste que já começou) de um produto. */
export function livePrice(p: Pick<Product, "billing" | "monthly_price" | "one_time_price" | "promo" | "price_change">, now: number): PriceAt {
  return priceAt({ price: basePrice(p), promo: p.promo, price_change: p.price_change }, now);
}

/** Situação da promoção do produto no instante (null = sem promoção ou já acabou). */
export function promoState(p: Pick<Product, "promo">, now: number): { promo: PromoInfo; status: "active" | "scheduled" } | null {
  if (!p.promo) return null;
  const status = promoStatus(p.promo, now);
  return status === "ended" ? null : { promo: p.promo, status };
}

/** "termina em 3 dias" / "começa em 2 dias" / "sem data para acabar". */
export function promoCountdown(promo: PromoInfo, status: "active" | "scheduled", now: number): string {
  const target = status === "scheduled" ? Date.parse(promo.starts_at) : promo.ends_at ? Date.parse(promo.ends_at) : null;
  if (target === null) return "sem data para acabar";
  const hours = Math.max(0, (target - now) / 3_600_000);
  const when = hours < 1 ? "em menos de 1 hora" : hours < 24 ? `em ${Math.ceil(hours)} h` : `em ${Math.ceil(hours / 24)} dias`;
  return `${status === "scheduled" ? "começa" : "termina"} ${when}`;
}

export function PromoChip({ promo, status }: { promo: PromoInfo; status: "active" | "scheduled" }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide ${
        status === "active" ? "bg-admin-qual-hot text-admin-qual-hot-text" : "bg-admin-badge text-admin-badge-text"
      }`}
    >
      <FaTag aria-hidden className="h-2.5 w-2.5" /> {status === "active" ? promo.name : `${promo.name} · agendada`}
    </span>
  );
}

export function SiteChip({ visible, active }: { visible: boolean; active: boolean }) {
  const on = visible && active;
  return (
    <span
      title={on ? "Aparece na seção de planos do site (depois de publicar)." : "Não aparece no site."}
      className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide ${on ? "bg-admin-tip text-admin-tip-title" : "bg-admin-badge text-admin-text-hint"}`}
    >
      <FaGlobe aria-hidden className="h-2.5 w-2.5" /> {on ? "No site" : "Fora do site"}
    </span>
  );
}

/** Barra de progresso da meta mensal. */
export function GoalBar({ value, goal }: { value: number; goal: number }) {
  const ratio = goal > 0 ? value / goal : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[11px] font-medium text-admin-text-hint">
        <span className="uppercase tracking-wide">Meta mensal</span>
        <span>
          <span className="font-semibold text-text-primary">{percent.format(ratio)}</span> de {money(goal)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-admin-badge" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, ratio) * 100)} aria-label="Meta mensal">
        <div className={`h-full rounded-full ${ratio >= 1 ? "bg-admin-success" : "bg-(--pc)"}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
      </div>
    </div>
  );
}
