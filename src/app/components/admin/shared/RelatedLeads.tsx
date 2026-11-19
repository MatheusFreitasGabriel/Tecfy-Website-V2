"use client";

import Link from "next/link";
import { leadQualifications, leadStages } from "@/lib/admin/crm/options";
import type { LeadSummary } from "@/lib/admin/crm/types";
import { LeadStatusIcon, formatDate, qualificationColors } from "../leads/leadVisuals";

/** Leads ligados a um contato/empresa. Clicar abre o lead no painel da tela de Leads. */
export default function RelatedLeads({ leads, basePath, emptyText }: { leads: LeadSummary[]; basePath: string; emptyText: string }) {
  if (!leads.length) return <p className="mt-3 text-sm text-admin-text-hint">{emptyText}</p>;
  return (
    <ul className="mt-4 flex flex-col divide-y divide-admin-table-divider overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-admin-table-border">
      {leads.map((lead) => (
        <li key={lead.id} className="flex items-center gap-3 bg-admin-table px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link href={`${basePath}/leads?lead=${encodeURIComponent(lead.id)}`} className="block truncate text-sm font-semibold text-text-primary hover:underline">
              {lead.title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-admin-table-subtext">
              {leadStages.label(lead.stage)} · {formatDate(lead.created_at)}
              {lead.owner_name ? ` · ${lead.owner_name}` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-[7px] px-2.5 py-1 text-xs font-medium ${qualificationColors[lead.qualification]}`}>
            {leadQualifications.label(lead.qualification)}
          </span>
          <LeadStatusIcon status={lead.status} />
        </li>
      ))}
    </ul>
  );
}
