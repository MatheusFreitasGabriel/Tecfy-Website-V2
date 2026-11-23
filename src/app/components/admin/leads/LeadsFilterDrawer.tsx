"use client";

import { useId, useMemo, useState } from "react";
import { FaCheck } from "react-icons/fa6";
import { leadQualifications, leadSources, leadStages, leadStatuses, type Option } from "@/lib/admin/crm/options";
import type { LeadRow } from "@/lib/admin/crm/types";
import { maskCurrencyBRL } from "@/utils/masks";
import Button from "../form/Button";
import Drawer from "../form/Drawer";
import { Select, TextInput } from "../form/Field";
import {
  DEFAULT_FILTERS,
  NO_OWNER,
  applyFilters,
  convertedOptions,
  createdOptions,
  sortOptions,
  viewOptions,
  type LeadFilters,
} from "./leadFilters";

interface LeadsFilterDrawerProps {
  leads: LeadRow[];
  filters: LeadFilters;
  currentUid: string;
  onApply: (filters: LeadFilters) => void;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-b border-admin-table-divider pb-6 last:border-0 last:pb-0">
      <legend className="mb-3 text-sm font-semibold text-text-primary">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Opções em "pílulas" clicáveis (seleção múltipla). */
function Pills({ options, value, onChange }: { options: readonly Option[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return <p className="text-xs text-admin-text-hint">Nada para filtrar ainda.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.hint}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-admin-accent ${
              on
                ? "bg-admin-primary text-admin-primary-text"
                : "bg-admin-drawer-card text-admin-text-label outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-badge"
            }`}
          >
            {on && <FaCheck aria-hidden className="h-2.5 w-2.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-admin-text-label">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-admin-primary [color-scheme:dark]" />
      {label}
    </label>
  );
}

/** Rótulo de um grupo de pílulas (não é um campo único, então usa role="group"). */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-2">
      <p className="text-xs font-medium text-admin-text-description">{label}</p>
      {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-admin-text-description">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Painel lateral com todos os filtros e a ordenação. Edita um rascunho; só aplica em "Mostrar N leads".
 */
export default function LeadsFilterDrawer({ leads, filters, currentUid, onApply, onClose }: LeadsFilterDrawerProps) {
  const [draft, setDraft] = useState<LeadFilters>(filters);
  const set = (patch: Partial<LeadFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const [now] = useState(() => new Date());
  const count = useMemo(() => applyFilters(leads, draft, currentUid, now).length, [leads, draft, currentUid, now]);

  // Opções que dependem dos dados carregados.
  const ownerOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>();
    for (const l of leads) if (l.owner_uid) map.set(l.owner_uid, l.owner_name ?? "Sem nome");
    const list = [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return [...list, { value: NO_OWNER, label: "Sem responsável" }];
  }, [leads]);
  const tagOptions = useMemo<Option[]>(
    () => [...new Set(leads.flatMap((l) => l.tags))].sort((a, b) => a.localeCompare(b, "pt-BR")).map((t) => ({ value: t, label: t })),
    [leads],
  );
  const planOptions = useMemo<Option[]>(
    () => [...new Set(leads.map((l) => l.interest_plan).filter((p): p is string => Boolean(p)))].map((p) => ({ value: p, label: capitalize(p) })),
    [leads],
  );

  return (
    <Drawer
      eyebrow="Leads"
      title="Filtros e ordenação"
      onClose={onClose}
      widthClass="max-w-[480px]"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={() => setDraft({ ...DEFAULT_FILTERS, query: draft.query })}>
            Limpar filtros
          </Button>
          <Button onClick={() => onApply(draft)}>{count === 1 ? "Mostrar 1 lead" : `Mostrar ${count} leads`}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <Section title="Ordenar por">
          <Labeled label="Ordenação">
            {(id) => <Select id={id} options={sortOptions} value={draft.sort} onChange={(e) => set({ sort: e.target.value as LeadFilters["sort"] })} />}
          </Labeled>
        </Section>

        <Section title="Visualização">
          <Pills options={viewOptions} value={[draft.view]} onChange={(v) => set({ view: (v.find((x) => x !== draft.view) ?? "all") as LeadFilters["view"] })} />
        </Section>

        <Section title="Funil">
          <Group label="Etapas"><Pills options={leadStages.options} value={draft.stages} onChange={(stages) => set({ stages })} /></Group>
          <Group label="Qualificações"><Pills options={leadQualifications.options} value={draft.qualifications} onChange={(qualifications) => set({ qualifications })} /></Group>
          <Group label="Status"><Pills options={leadStatuses.options} value={draft.statuses} onChange={(statuses) => set({ statuses })} /></Group>
          <Labeled label="Negociação">
            {(id) => (
              <Select
                id={id}
                options={convertedOptions}
                value={draft.converted}
                onChange={(e) => set({ converted: e.target.value as LeadFilters["converted"] })}
              />
            )}
          </Labeled>
        </Section>

        <Section title="Origem e responsável">
          <Group label="Origem do lead"><Pills options={leadSources.options} value={draft.sources} onChange={(sources) => set({ sources })} /></Group>
          <Group label="Responsável pela captura"><Pills options={ownerOptions} value={draft.owners} onChange={(owners) => set({ owners })} /></Group>
          {planOptions.length > 0 && (
            <Group label="Plano de interesse (site)"><Pills options={planOptions} value={draft.plans} onChange={(plans) => set({ plans })} /></Group>
          )}
        </Section>

        <Section title="Datas">
          <Labeled label="Criado em">
            {(id) => (
              <Select
                id={id}
                options={createdOptions}
                value={draft.created}
                onChange={(e) => set({ created: e.target.value as LeadFilters["created"] })}
              />
            )}
          </Labeled>
          {draft.created === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="De">{(id) => <TextInput id={id} type="date" value={draft.createdFrom} onChange={(e) => set({ createdFrom: e.target.value })} />}</Labeled>
              <Labeled label="Até">{(id) => <TextInput id={id} type="date" value={draft.createdTo} onChange={(e) => set({ createdTo: e.target.value })} />}</Labeled>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Previsão de fechamento: de">
              {(id) => <TextInput id={id} type="date" value={draft.closeFrom} onChange={(e) => set({ closeFrom: e.target.value })} />}
            </Labeled>
            <Labeled label="Até">{(id) => <TextInput id={id} type="date" value={draft.closeTo} onChange={(e) => set({ closeTo: e.target.value })} />}</Labeled>
          </div>
        </Section>

        <Section title="Valor estimado">
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Mínimo">
              {(id) => (
                <TextInput id={id} inputMode="numeric" placeholder="R$ 0,00" value={draft.valueMin} onChange={(e) => set({ valueMin: maskCurrencyBRL(e.target.value) })} />
              )}
            </Labeled>
            <Labeled label="Máximo">
              {(id) => (
                <TextInput id={id} inputMode="numeric" placeholder="Sem limite" value={draft.valueMax} onChange={(e) => set({ valueMax: maskCurrencyBRL(e.target.value) })} />
              )}
            </Labeled>
          </div>
        </Section>

        <Section title="Tags">
          <Pills options={tagOptions} value={draft.tags} onChange={(tags) => set({ tags })} />
        </Section>

        <Section title="Dados de contato">
          <Toggle label="Tem e-mail" checked={draft.hasEmail} onChange={(hasEmail) => set({ hasEmail })} />
          <Toggle label="Tem WhatsApp / telefone" checked={draft.hasPhone} onChange={(hasPhone) => set({ hasPhone })} />
          <Toggle label="Tem empresa vinculada" checked={draft.hasCompany} onChange={(hasCompany) => set({ hasCompany })} />
        </Section>
      </div>
    </Drawer>
  );
}
