"use client";

import { useRouter } from "next/navigation";
import { plansCardsData } from "./PlansCardsData";


type Props = {
  type: "monthly" | "oneTime";
};

export default function PlansCards({ type }: Props) {
  const filteredPlans = plansCardsData.filter((plan) => plan.type === type);

  // 1. Definindo as classes do container dinamicamente
  const containerClasses =
  type === "monthly"
    ? "w-full flex flex-row gap-4 overflow-x-auto snap-x snap-mandatory pb-4 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 lg:grid-cols-4"
    : "w-full flex flex-col lg:flex-row gap-4 md:gap-6 justify-center";

    const router = useRouter();
    function handleClick() {
      router.push("/contato")
    };

  return (
    // 2. Aplicando a variável de classes no container
    <div className={containerClasses}>
      {filteredPlans.map((plan) => {
        const isHighlight = plan.highlightPlan;
        const cardBgClass = isHighlight
          ? "bg-gradient-to-b from-primary to-background-secondary"
          : "bg-background-secondary";

        return (
          // 3. Adicionado 'snap-center' para melhor UX no scroll horizontal do mobile
          <div 
            key={plan.namePlan} 
            className="border border-border-primary w-full p-3 snap-center"
          >
            {/* Card */}
            {/* 4. lg:min-w-0 adicionado para evitar que o card quebre o grid no desktop */}
            <div className={`${cardBgClass} py-6 px-4 flex flex-col gap-8 w-full h-full min-w-[280px] md:p-6 lg:min-w-0`}>
              
              {/* Card Header*/}
              <div className="flex flex-col gap-3 ">
                {/* Title Card */}
                <div className="flex flex-row gap-3.5 items-end">
                  <h3 className="text-2xl font-bold">{plan.namePlan.toUpperCase()}</h3>
                  {isHighlight && (
                    <span className="text-[12px] text-secondary font-bold uppercase">Mais assinados</span>
                  )}
                </div>

                {/* Price Card */}
                {plan.pricePlan !== null ? (
                  <div className="flex gap-1 items-start">
                    <span className="text-[16px] font-normal text-white/50">R$</span>
                    <p className="text-4xl font-medium text-white">{plan.pricePlan.toString()}</p>
                    <span className="text-[16px] self-end font-normal text-white/50">/mês</span>
                  </div>
                ) : (
                  <p className="text-4xl font-normal text-white">{plan.priceLabel!}</p>
                )}

                {/* Description Card */}
                <p className="text-[16px] font-normal ">{plan.descriptionPlan}</p>

                {/* Button Card */}
                <button onClick={handleClick} className="bg-white h-9 md:h-10 cursor-pointer  hover:bg-white/80 transition-colors duration-300 ease-in-out">
                  <span className="text-background-secondary font-semibold">Assinar {plan.namePlan}</span>
                </button>
              </div>

              {/* Features Card */}
              <div className="flex flex-col gap-3 mb-9">
                {plan.featuresPlan.map((feature, idx) => {
                  const IconComponent = feature.icon;
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                        <IconComponent className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-[16px] text-white flex-1 min-w-0">
                        {feature.contentText}
                      </span>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
}