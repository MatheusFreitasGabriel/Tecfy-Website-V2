"use client"

import { useState } from "react";
import type { SiteSection } from "@/lib/admin/crm/options";
import type { SitePlan } from "@/lib/site/plans";
import PlansCards from "./PlansCards";
import { useClock } from "./useClock";

type Props = {
    plans: SitePlan[];
    /** Horário da renderização no servidor (ms): base da hidratação; depois o relógio do navegador assume. */
    renderedAt: number;
    /** Prévia no painel: botões não navegam. */
    preview?: boolean;
    /** Instante fixo (prévia "como vai estar em…"); sem isso, usa o relógio. */
    at?: number;
};

export default function PlansCardsGrouping({ plans, renderedAt, preview, at }: Props){
    const clock = useClock(renderedAt);
    const now = at ?? clock;
    const hasOneTime = plans.some((p) => p.section === "oneTime");
    const hasMonthly = plans.some((p) => p.section === "monthly");
    const [chosen, setType] = useState<SiteSection>("monthly");
    // Se uma aba ficou vazia, mostra a outra (o seletor só aparece com as duas).
    const type: SiteSection = !hasMonthly && hasOneTime ? "oneTime" : !hasOneTime ? "monthly" : chosen;

    return (
        <div className="w-full max-w-[1440px] flex flex-col items-center gap-6 px-4 relative lg:gap-12">
            {hasMonthly && hasOneTime && (
            <div className="relative flex flex-row p-1.5 border border-border-secondary">

                {/* Span animado do background */}
                <span
                    className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-0.375rem)] bg-white transition-transform duration-300 ease-out ${
                        type === "monthly" ? "translate-x-0" : "translate-x-full"
                    }`}
                />

                <button
                    className={`relative cursor-pointer z-10 px-6 py-3 text-sm md:text-base font-bold transition-colors duration-200 uppercase ${
                        type === "monthly" ? "text-background" : "text-white/50"
                    }`}
                    onClick={() => setType("monthly")}
                >
                    Planos Mensais
                </button>

                <button
                    className={`relative z-10 cursor-pointer px-6 py-3 text-sm md:text-base font-bold transition-colors duration-200 uppercase ${
                        type === "oneTime" ? "text-background" : "text-white/50"
                    }`}
                    onClick={() => setType("oneTime")}
                >
                    Planos Únicos
                </button>
            </div>
            )}

            <PlansCards type={type} plans={plans} now={now} preview={preview}></PlansCards>
        </div>
    );
}
