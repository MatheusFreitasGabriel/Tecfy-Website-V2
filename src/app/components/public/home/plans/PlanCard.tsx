import { isoShortDate, priceAt, type SitePlan } from "@/lib/site/plans";
import { iconOf } from "./planIcons";

/** "647,00" — mesmo formato que o site sempre usou (sem "R$", que fica num span à parte). */
const amount = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PlanCardProps {
  plan: SitePlan;
  /** Instante usado para promoção/reajuste (ms). */
  now: number;
  onSelect?: (planName: string) => void;
  /** Prévia no painel: botão sem ação. */
  preview?: boolean;
}

/** Card de plano da seção "Planos e valores". Usado pela landing e pelas prévias da tela Produtos. */
export default function PlanCard({ plan, now, onSelect, preview }: PlanCardProps) {
  const current = priceAt(plan, now);
  const cardBgClass = plan.highlight ? "bg-gradient-to-b from-primary to-background-secondary" : "bg-background-secondary";
  const off = current.original && current.price !== null ? Math.round((1 - current.price / current.original) * 100) : 0;

  return (
    <div className="border border-border-primary w-full p-3 snap-center">
      <div className={`${cardBgClass} py-6 px-4 flex flex-col gap-8 w-full h-full min-w-[280px] md:p-6 lg:min-w-0`}>
        <div className="flex flex-col gap-3">
          <h3 className="text-2xl font-bold">{plan.name.toUpperCase()}</h3>

          {current.promo && (
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase">
              <span className="bg-white text-background-secondary px-2 py-0.5">{current.promo.name}</span>
              <span className="text-white/70">
                -{off}%{current.promo.ends_at ? ` até ${isoShortDate(current.promo.ends_at)}` : ""}
              </span>
            </p>
          )}

          {current.price !== null ? (
            <div className="flex flex-col gap-1">
              {current.original !== null && (
                <p className="text-[16px] font-normal text-white/50 line-through">
                  R$ {amount(current.original)}
                  {plan.billing === "mensal" ? "/mês" : ""}
                </p>
              )}
              <div className="flex gap-1 items-start">
                <span className="text-[16px] font-normal text-white/50">R$</span>
                <p className="text-4xl font-medium text-white">{amount(current.price)}</p>
                {plan.billing === "mensal" && <span className="text-[16px] self-end font-normal text-white/50">/mês</span>}
              </div>
              {plan.setup_fee ? <p className="text-[14px] font-normal text-white/50">+ R$ {amount(plan.setup_fee)} de implantação</p> : null}
            </div>
          ) : (
            <p className="text-4xl font-normal text-white">{plan.price_label ?? "SOB CONSULTA"}</p>
          )}

          {plan.description && <p className="text-[16px] font-normal">{plan.description}</p>}

          <button
            type="button"
            tabIndex={preview ? -1 : undefined}
            onClick={() => onSelect?.(plan.name)}
            className={`bg-white h-9 md:h-10 transition-colors duration-300 ease-in-out ${preview ? "cursor-default" : "cursor-pointer hover:bg-white/80"}`}
          >
            <span className="text-background-secondary font-semibold">{plan.cta}</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 mb-9">
          {plan.features.map((feature, idx) => {
            const Icon = iconOf(feature.icon);
            return (
              <div key={idx} className="flex items-start gap-3">
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-[16px] text-white flex-1 min-w-0">{feature.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
