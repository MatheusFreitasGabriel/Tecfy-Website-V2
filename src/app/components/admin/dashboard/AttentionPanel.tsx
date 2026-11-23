import Link from "next/link";
import { FaArrowRight, FaCircleCheck, FaClipboardCheck, FaFileSignature, FaHandshake, FaUserClock } from "react-icons/fa6";
import type { AttentionSection } from "@/lib/admin/crm/dashboardMetrics";

const ICONS: Record<AttentionSection["key"], typeof FaHandshake> = {
  tasks: FaClipboardCheck,
  deals: FaHandshake,
  leads: FaUserClock,
  renewals: FaFileSignature,
};

interface AttentionPanelProps {
  basePath: string;
  sections: AttentionSection[];
  /** Fontes que não carregaram (a seção mostra o aviso em vez da lista). */
  unavailable: Partial<Record<AttentionSection["key"], boolean>>;
}

/** "Precisa de atenção": o que pede ação hoje, com link direto para cada item. */
export default function AttentionPanel({ basePath, sections, unavailable }: AttentionPanelProps) {
  const total = sections.reduce((s, x) => s + (unavailable[x.key] ? 0 : x.count), 0);
  const href = (path: string) => `${basePath}${path}`;

  return (
    <section aria-label="Precisa de atenção" className="h-full border border-border-primary p-1.5">
      <div className="flex h-full flex-col bg-background-secondary">
        <header className="flex items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">Hoje</p>
            <h2 className="text-base font-bold uppercase tracking-tight text-white">Precisa de atenção</h2>
          </div>
          <span className={`flex h-7 min-w-7 items-center justify-center px-2 text-xs font-bold ${total ? "bg-white text-background" : "border border-border-secondary text-white/50"}`}>{total}</span>
        </header>

        {total === 0 && sections.every((s) => !unavailable[s.key]) ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
            <FaCircleCheck aria-hidden className="h-6 w-6 text-admin-success" />
            <p className="text-sm font-semibold uppercase tracking-wide text-white">Tudo em dia</p>
            <p className="text-xs text-white/45">Nenhuma tarefa atrasada, negociação parada ou lead esperando.</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col divide-y divide-border-primary overflow-y-auto">
            {sections.map((section) => {
              const Icon = ICONS[section.key];
              if (!unavailable[section.key] && section.count === 0) return null;
              return (
                <div key={section.key} className="flex flex-col gap-1 px-5 py-3">
                  <Link href={href(section.path)} className="group flex items-center justify-between gap-3 py-1">
                    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70 group-hover:text-white">
                      <Icon aria-hidden className="h-3 w-3" /> {section.title}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/45 group-hover:text-white">
                      {unavailable[section.key] ? "—" : section.count}
                      <FaArrowRight aria-hidden className="h-2.5 w-2.5" />
                    </span>
                  </Link>
                  {unavailable[section.key] ? (
                    <p className="text-xs text-white/40">Não foi possível carregar.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {section.rows.map((row) => (
                        <li key={row.id}>
                          <Link href={href(row.path)} className="group flex items-start gap-2.5 py-1.5">
                            <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${row.danger ? "bg-admin-danger" : "bg-[#5B2BFF]"}`} />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-white group-hover:underline">{row.title}</span>
                              <span className={`block truncate text-[11px] ${row.danger ? "text-admin-danger" : "text-white/45"}`}>{row.detail}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                      {section.count > section.rows.length && (
                        <li>
                          <Link href={href(section.path)} className="pl-4 text-[11px] font-semibold text-white/45 hover:text-white">
                            + {section.count - section.rows.length} mais
                          </Link>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
