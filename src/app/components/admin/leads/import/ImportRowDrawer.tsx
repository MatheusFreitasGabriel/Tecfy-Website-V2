"use client";

import { FaArrowUpRightFromSquare, FaChevronLeft, FaChevronRight, FaTriangleExclamation } from "react-icons/fa6";
import { IMPORT_COLUMNS, optionValue, type ImportField, type ImportGroup, type OwnerOption } from "@/lib/admin/crm/leadImport/columns";
import { ACTION_LABELS, STATUS_INFO, allowedActions, type FieldDiff, type ReviewedRow, type RowAction } from "@/lib/admin/crm/leadImport/review";
import { leadStages, leadStatuses } from "@/lib/admin/crm/options";
import Button from "../../form/Button";
import Drawer from "../../form/Drawer";
import { Field, Select, TextArea, TextInput } from "../../form/Field";
import { formatDate } from "../leadVisuals";
import { StatusBadge } from "./importVisuals";

interface ImportRowDrawerProps {
  row: ReviewedRow;
  basePath: string;
  admins: OwnerOption[];
  defaultOwnerName: string;
  /** Posição na lista filtrada (navegação anterior/próxima). */
  position: { index: number; total: number };
  onPrev: () => void;
  onNext: () => void;
  onChange: (field: ImportField, value: string) => void;
  onAction: (action: RowAction) => void;
  onFill: (fill: boolean) => void;
  onTargetLead: (leadId: string) => void;
  onClose: () => void;
}

const ACTION_HELP: Record<RowAction, string> = {
  create: "Cria o lead. Empresa e contato já existentes são ligados a ele; os novos são criados.",
  update: "Não cria lead: registra na timeline do lead existente que ele voltou nesta lista (com as observações da planilha).",
  skip: "Esta linha não é cadastrada.",
};

const SECTIONS: { group: ImportGroup; title: string }[] = [
  { group: "lead", title: "Lead" },
  { group: "contact", title: "Contato" },
  { group: "company", title: "Empresa" },
];

function DiffTable({ title, diffs }: { title: string; diffs: FieldDiff[] }) {
  if (!diffs.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-admin-text-label">{title}</p>
      <div className="overflow-hidden rounded-xl outline outline-1 -outline-offset-1 outline-admin-table-border">
        <table className="w-full border-collapse text-left text-[13px] leading-5">
          <thead className="bg-admin-table-head text-xs text-admin-table-head-text">
            <tr>
              <th className="px-3 py-2 font-medium">Campo</th>
              <th className="px-3 py-2 font-medium">Na planilha</th>
              <th className="px-3 py-2 font-medium">No CRM</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.field} className="border-t border-admin-table-divider align-top">
                <td className="px-3 py-2 font-medium text-admin-text-label">
                  {d.label}
                  <span
                    className={`ml-1.5 inline-block rounded px-1.5 text-[10px] font-semibold uppercase leading-4 ${
                      d.kind === "novo" ? "bg-admin-qual-sure text-admin-qual-sure-text" : "bg-admin-qual-hot text-admin-qual-hot-text"
                    }`}
                  >
                    {d.kind === "novo" ? "novo" : "diferente"}
                  </span>
                </td>
                <td className="break-words px-3 py-2 font-medium text-text-primary">{d.sheet}</td>
                <td className="break-words px-3 py-2 font-medium text-admin-table-subtext">{d.crm ?? "vazio"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold leading-5 text-admin-accent hover:underline">
      {children}
      <FaArrowUpRightFromSquare aria-hidden className="h-2.5 w-2.5" />
    </a>
  );
}

/** Painel de uma linha: situação, o que já existe no CRM, comparativo e edição de todos os campos. */
export default function ImportRowDrawer({
  row,
  basePath,
  admins,
  defaultOwnerName,
  position,
  onPrev,
  onNext,
  onChange,
  onAction,
  onFill,
  onTargetLead,
  onClose,
}: ImportRowDrawerProps) {
  const m = row.match;
  const options = allowedActions(row.status);
  const hasNew = Boolean(m?.companyDiff.some((d) => d.kind === "novo") || m?.contactDiff.some((d) => d.kind === "novo"));
  const errorCount = Object.keys(row.errors).length;

  return (
    <Drawer
      title={row.values.title || "Sem nome do lead"}
      eyebrow={`Linha ${row.line} da planilha`}
      onClose={onClose}
      widthClass="max-w-[720px]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={FaChevronLeft} onClick={onPrev} disabled={position.index <= 0} aria-label="Linha anterior" className="!px-4" />
            <span className="text-xs font-medium text-admin-text-hint">
              {position.index + 1} de {position.total}
            </span>
            <Button variant="secondary" icon={FaChevronRight} onClick={onNext} disabled={position.index >= position.total - 1} aria-label="Próxima linha" className="!px-4" />
          </div>
          <Button onClick={onClose}>Concluir</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-7">
        {/* Situação */}
        <section className="flex flex-col gap-3 rounded-xl bg-admin-drawer-card p-4 outline outline-1 -outline-offset-1 outline-admin-drawer-border">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={row.status} />
            <p className="text-sm font-medium leading-5 text-admin-text-label">{STATUS_INFO[row.status].hint}</p>
          </div>
          {row.status === "erro" && (
            <p className="text-sm font-medium leading-5 text-admin-danger">
              {errorCount} campo(s) com problema, marcados em vermelho abaixo. Corrija aqui mesmo (a planilha original não muda) ou deixe a linha de fora.
            </p>
          )}
          {row.status === "repetido" && row.repeatOf && (
            <p className="text-sm font-medium leading-5 text-admin-text-label">A linha {row.repeatOf} tem a mesma empresa, e-mail ou telefone. Só a primeira é importada, a não ser que você escolha criar esta também.</p>
          )}
          {row.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-sm font-medium leading-5 text-admin-warning">
              <FaTriangleExclamation aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
            </p>
          ))}
        </section>

        {/* Ação */}
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-medium leading-6 text-text-primary">O que fazer com esta linha</h3>
          <div role="radiogroup" aria-label="Ação" className="flex flex-col gap-2">
            {options.map((action) => (
              <label
                key={action}
                className={`flex cursor-pointer gap-3 rounded-xl p-3.5 outline outline-1 -outline-offset-1 transition-colors ${
                  row.action === action ? "bg-admin-tip outline-admin-accent" : "bg-admin-drawer-card outline-admin-drawer-border hover:bg-admin-badge"
                }`}
              >
                <input type="radio" name={`action-${row.line}`} checked={row.action === action} onChange={() => onAction(action)} className="mt-1 accent-admin-primary" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold leading-5 text-text-primary">{action === "create" && row.status === "duplicado" ? "Criar mesmo assim" : ACTION_LABELS[action]}</span>
                  <span className="text-[13px] font-medium leading-5 text-admin-text-description">{ACTION_HELP[action]}</span>
                </span>
              </label>
            ))}
          </div>
          {row.action === "update" && m && m.openLeads.length > 1 && (
            <Field label="Lead que recebe a atualização">
              {(a11y) => (
                <Select
                  {...a11y}
                  value={row.targetLeadId ?? ""}
                  onChange={(e) => onTargetLead(e.target.value)}
                  options={m.openLeads.map((l) => ({ value: l.id, label: `${l.title} · ${leadStages.label(l.stage)}` }))}
                />
              )}
            </Field>
          )}
          {hasNew && row.action !== "skip" && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-admin-drawer-card p-3.5 outline outline-1 -outline-offset-1 outline-admin-drawer-border">
              <input type="checkbox" checked={row.fill} onChange={(e) => onFill(e.target.checked)} className="mt-1 h-4 w-4 accent-admin-primary [color-scheme:dark]" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold leading-5 text-text-primary">Completar o cadastro existente com os dados novos</span>
                <span className="text-[13px] font-medium leading-5 text-admin-text-description">
                  Preenche só o que está vazio no CRM (marcado como &quot;novo&quot; abaixo). O que está diferente nunca é sobrescrito, e a alteração fica na timeline.
                </span>
              </span>
            </label>
          )}
        </section>

        {/* Já no CRM */}
        {m && (m.company || m.contact || m.companyMaybe || m.openLeads.length > 0 || m.closedLeads.length > 0) && (
          <section className="flex flex-col gap-4">
            <h3 className="text-base font-medium leading-6 text-text-primary">Já está no CRM</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {m.company && (
                <div className="flex flex-col gap-1 rounded-xl bg-admin-drawer-card p-4">
                  <p className="text-xs font-medium text-admin-drawer-muted">Empresa · encontrada por {m.company.by}</p>
                  <ExternalLink href={`${basePath}/empresas/${m.company.id}`}>{m.company.name}</ExternalLink>
                </div>
              )}
              {m.companyMaybe && (
                <div className="flex flex-col gap-1 rounded-xl bg-admin-drawer-card p-4">
                  <p className="text-xs font-medium text-admin-warning">Empresa com o mesmo telefone (não ligada)</p>
                  <ExternalLink href={`${basePath}/empresas/${m.companyMaybe.id}`}>{m.companyMaybe.name}</ExternalLink>
                </div>
              )}
              {m.contact && (
                <div className="flex flex-col gap-1 rounded-xl bg-admin-drawer-card p-4">
                  <p className="text-xs font-medium text-admin-drawer-muted">Contato · encontrado por {m.contact.by}</p>
                  <ExternalLink href={`${basePath}/contatos/${m.contact.id}`}>{m.contact.name}</ExternalLink>
                  {m.contact.company_name && <p className="text-xs font-medium text-admin-table-subtext">{m.contact.company_name}</p>}
                </div>
              )}
            </div>
            {[...m.openLeads, ...m.closedLeads].length > 0 && (
              <ul className="flex flex-col divide-y divide-admin-divider rounded-xl bg-admin-drawer-card px-4">
                {[...m.openLeads, ...m.closedLeads].map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <ExternalLink href={`${basePath}/leads?lead=${l.id}`}>{l.title}</ExternalLink>
                      <p className="text-xs font-medium leading-[18px] text-admin-table-subtext">
                        {leadStages.label(l.stage)} · {leadStatuses.label(l.status)} · {l.owner_name ?? "sem responsável"} · criado em {formatDate(l.created_at)}
                      </p>
                      <p className="text-xs font-medium leading-[18px] text-admin-text-hint">Por: {l.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <DiffTable title="Empresa: planilha × CRM" diffs={m.companyDiff} />
            <DiffTable title="Contato: planilha × CRM" diffs={m.contactDiff} />
            {!m.companyDiff.length && !m.contactDiff.length && (m.company || m.contact) && (
              <p className="text-sm font-medium leading-5 text-admin-text-description">A planilha não traz nenhum dado novo para o contato/empresa existentes.</p>
            )}
          </section>
        )}

        {/* Edição */}
        {SECTIONS.map(({ group, title }) => (
          <section key={group} className="flex flex-col gap-4">
            <h3 className="text-base font-medium leading-6 text-text-primary">{title}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {IMPORT_COLUMNS.filter((c) => c.group === group).map((c) => {
                const field = c.field as ImportField;
                const value = row.values[field];
                const error = row.errors[field];
                const hint = "hint" in c ? c.hint : undefined;
                const wide = "long" in c && c.long;
                if (field === "owner") {
                  const resolved = row.ownerUid ?? "";
                  return (
                    <Field key={field} label={c.header} error={error} hint={value.trim() && !error ? `Na planilha: ${value}` : `Vazio = padrão (${defaultOwnerName})`}>
                      {(a11y) => (
                        <Select
                          {...a11y}
                          value={value.trim() && !error ? resolved : error ? "__invalid" : ""}
                          onChange={(e) => e.target.value !== "__invalid" && onChange(field, e.target.value ? (admins.find((a) => a.uid === e.target.value)?.name ?? "") : "")}
                          placeholder={`Padrão (${defaultOwnerName})`}
                          options={[...(error ? [{ value: "__invalid", label: `"${value}" (não encontrado)` }] : []), ...admins.map((a) => ({ value: a.uid, label: a.name }))]}
                        />
                      )}
                    </Field>
                  );
                }
                if ("options" in c) {
                  const current = optionValue(c.options, value);
                  const known = c.options.some((o) => o.value === current);
                  return (
                    <Field key={field} label={c.header} error={error} hint={hint}>
                      {(a11y) => (
                        <Select
                          {...a11y}
                          value={value && !known ? "__invalid" : current}
                          onChange={(e) => e.target.value !== "__invalid" && onChange(field, e.target.value)}
                          placeholder="—"
                          options={[...(value && !known ? [{ value: "__invalid", label: `"${value}" (inválido)` }] : []), ...c.options]}
                        />
                      )}
                    </Field>
                  );
                }
                return (
                  <Field key={field} label={c.header} required={"required" in c && c.required} error={error} hint={hint} className={wide ? "sm:col-span-2" : undefined}>
                    {(a11y) =>
                      wide ? (
                        <TextArea {...a11y} value={value} onChange={(e) => onChange(field, e.target.value)} heightClass="h-[96px]" />
                      ) : (
                        <TextInput {...a11y} value={value} onChange={(e) => onChange(field, e.target.value)} />
                      )
                    }
                  </Field>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
