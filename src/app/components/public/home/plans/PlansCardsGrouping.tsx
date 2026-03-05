"use client"

import { useState } from "react";
import PlansCards from "./PlansCards"; 

export default function PlansCardsGrouping(){
    const [type, setType] = useState<"monthly" | "oneTime">("monthly");

    return (
        <div className="w-full max-w-[1440px] flex flex-col items-center gap-6 px-4 relative lg:gap-12">
            {/* Toggle btn Container */}
            <div className="relative flex flex-row p-1.5 border border-border-secondary">
                
                {/* Span animado do background */}
                <span 
                    className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-0.375rem)] bg-white transition-transform duration-300 ease-out ${
                        type === "monthly" ? "translate-x-0" : "translate-x-full"
                    }`}
                />

                {/* Botões */}
                <button 
                    className={`relative z-10 px-6 py-3 text-sm md:text-base font-bold transition-colors duration-200 ${
                        type === "monthly" ? "text-background" : "text-white/50"
                    }`} 
                    onClick={() => setType("monthly")}
                >
                    PLANOS MENSAIS
                </button>

                <button 
                    className={`relative z-10 px-6 py-3 text-sm md:text-base font-bold transition-colors duration-200 ${
                        type === "oneTime" ? "text-background" : "text-white/50"
                    }`} 
                    onClick={() => setType("oneTime")}
                >
                    PLANOS ÚNICOS
                </button>
            </div>

            {/* Cards */}
            <PlansCards type={type}></PlansCards>
        </div>
    );
}