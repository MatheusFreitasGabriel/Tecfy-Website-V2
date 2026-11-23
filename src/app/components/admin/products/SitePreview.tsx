"use client";

import { useState } from "react";
import { FaCalendarDay } from "react-icons/fa6";
import PlansCardsGrouping from "@/app/components/public/home/plans/PlansCardsGrouping";
import { brazilDayKey, type SitePlan } from "@/lib/site/plans";
import { inputClass } from "../form/Field";

interface SitePreviewProps {
  plans: SitePlan[];
  renderedAt: number;
  /** Controles extras à esquerda (ex.: Rascunho | Publicado). */
  toolbar?: React.ReactNode;
}

/**
 * A seção de planos exatamente como no site (mesmos componentes da landing), sobre o fundo preto
 * do site. "Ver em" simula outra data (promoções agendadas, reajustes);
 */
export default function SitePreview({ plans, renderedAt, toolbar }: SitePreviewProps) {
  const [day, setDay] = useState("");
  const at = day ? Date.parse(`${day}T12:00:00-03:00`) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-admin-text-description">
              <FaCalendarDay aria-hidden className="h-3 w-3" /> Ver como fica em
            </span>
            <input type="date" value={day} min={brazilDayKey(renderedAt)} onChange={(e) => setDay(e.target.value)} className={`${inputClass} h-10 w-[170px]`} />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl outline outline-1 -outline-offset-1 outline-admin-card-border">
        <div className="flex h-8 items-center gap-1.5 border-b border-admin-card-border bg-admin-card px-3" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-admin-badge" />
          <span className="h-2.5 w-2.5 rounded-full bg-admin-badge" />
          <span className="h-2.5 w-2.5 rounded-full bg-admin-badge" />
          <span className="ml-3 truncate text-[11px] font-medium text-admin-text-hint">tecfy.dev/#prices{day ? ` · em ${day.split("-").reverse().join("/")}` : ""}</span>
        </div>
        <div className="overflow-x-auto bg-background py-12">
          {plans.length === 0 ? (
            <p className="px-6 text-center text-sm font-medium text-text-secondary">Nenhum produto marcado &quot;No site&quot;. A seção de planos ficaria vazia.</p>
          ) : (
            <div className={`mx-auto flex flex-col items-center gap-6 lg:gap-12 min-w-[1100px]`}>
              <div className="flex flex-col items-center gap-4 px-4">
                <span className="text-[14px] font-medium uppercase text-secondary">Planos e valores</span>
                <h2 className="text-center text-[36px] font-semibold uppercase leading-none text-text-primary sm:text-[48px]">Quanto vale uma solução?</h2>
              </div>
              <PlansCardsGrouping plans={plans} renderedAt={renderedAt} at={at} preview />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
