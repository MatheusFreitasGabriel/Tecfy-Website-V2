"use client";

import { useMemo, useState } from "react";
import { FaBolt, FaChartLine, FaFire, FaSackDollar, FaUserPlus } from "react-icons/fa6";
import type { IconType } from "react-icons";
import type { LeadRow } from "@/lib/admin/crm/types";
import Tooltip from "../form/Tooltip";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Leads que ainda estão no jogo (não perdidos, convertidos ou arquivados). */
const isActive = (l: LeadRow) => l.status !== "perdido" && l.status !== "convertido" && l.status !== "arquivado" && l.stage !== "perdido";

function Kpi({ icon: Icon, label, value, hint }: { icon: IconType; label: string; value: string; hint: string }) {
  return (
    <Tooltip label={label} description={hint}>
      <div
        tabIndex={0}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-xl bg-background-kpi px-5 py-4 outline outline-1 -outline-offset-1 outline-admin-table-border focus-visible:outline-2 focus-visible:outline-admin-accent"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-admin-badge">
          <Icon aria-hidden className="h-4 w-4 text-admin-tip-title" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-xs font-medium text-admin-text-description">{label}</span>
          <span className="truncate text-xl font-semibold leading-6 text-text-primary">{value}</span>
        </span>
      </div>
    </Tooltip>
  );
}

/**
 * Indicadores da carteira de leads.
 * FORA DE USO: saiu da tela de Leads (que fica focada só na lista) e será reaproveitado na
 * futura tela de Análises.
 */
export default function LeadsKpis({ leads }: { leads: LeadRow[] }) {
  // "Agora" fixado ao montar a tela (render puro); recarregar a página atualiza.
  const [now] = useState(() => Date.now());
  const kpis = useMemo(() => {
    const active = leads.filter(isActive);
    const recent = leads.filter((l) => l.created_at && now - new Date(l.created_at).getTime() <= WEEK).length;
    const hot = active.filter((l) => l.qualification === "quente" || l.qualification === "venda_certa").length;
    const pipeline = active.reduce((sum, l) => sum + (l.estimated_value_cents ?? 0), 0);
    const converted = leads.filter((l) => l.deal_id).length;
    return { active: active.length, recent, hot, pipeline, rate: leads.length ? converted / leads.length : 0, converted };
  }, [leads, now]);

  return (
    <section aria-label="Indicadores dos leads" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 [&>span]:flex">
      <Kpi icon={FaBolt} label="Leads ativos" value={integer.format(kpis.active)} hint="Sem contar perdidos, convertidos e arquivados." />
      <Kpi icon={FaUserPlus} label="Novos (7 dias)" value={integer.format(kpis.recent)} hint="Leads que entraram nos últimos 7 dias." />
      <Kpi icon={FaFire} label="Quentes + venda na certa" value={integer.format(kpis.hot)} hint="Leads ativos com maior chance de fechar: priorize estes." />
      <Kpi icon={FaSackDollar} label="Valor em pipeline" value={brl.format(kpis.pipeline / 100)} hint="Soma do valor estimado dos leads ativos." />
      <Kpi
        icon={FaChartLine}
        label="Taxa de conversão"
        value={percent.format(kpis.rate)}
        hint={`${integer.format(kpis.converted)} de ${integer.format(leads.length)} leads viraram negociação.`}
      />
    </section>
  );
}
