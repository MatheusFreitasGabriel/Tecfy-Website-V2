"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { FaBuilding, FaCheck, FaCopy, FaEnvelope, FaHandshake, FaUser, FaUserCheck, FaWhatsapp, FaXmark } from "react-icons/fa6";
import { leadQualifications, leadSources, leadStages, leadStatuses } from "@/lib/admin/crm/options";
import type { LeadEmailRow, LeadNoteRow, LeadRow } from "@/lib/admin/crm/types";

/** Atividade do lead (1 requisição, guardada em memória pela tela). */
export interface LeadActivity {
  notes: LeadNoteRow[];
  emails: LeadEmailRow[];
  emailConfigured: boolean;
}
import Button from "../form/Button";
import Tooltip from "../form/Tooltip";
import { useModalBehavior } from "../form/useModalBehavior";
import { CardListSkeleton } from "../shared/Skeletons";
import LeadNotesTimeline from "./LeadNotesTimeline";
import { LeadStatusIcon, formatCalendarDate, formatCents, formatDate, formatDateTime, formatPhone, qualificationTextColors } from "./leadVisuals";

export interface ContactChannels {
  phones: { label: string; digits: string }[];
  emails: { label: string; email: string }[];
}

/** Telefones e e-mails do lead e do contato vinculado, sem repetir. */
export function contactChannelsOf(lead: LeadRow): ContactChannels {
  const phones: ContactChannels["phones"] = [];
  const emails: ContactChannels["emails"] = [];
  if (lead.phone) phones.push({ label: "Lead", digits: lead.phone });
  if (lead.contact?.phone && lead.contact.phone !== lead.phone) phones.push({ label: lead.contact.name, digits: lead.contact.phone });
  if (lead.email) emails.push({ label: "Lead", email: lead.email });
  if (lead.contact?.email && lead.contact.email !== lead.email) emails.push({ label: lead.contact.name, email: lead.contact.email });
  return { phones, emails };
}

interface LeadDetailsDrawerProps {
  lead: LeadRow;
  basePath: string;
  busy: boolean;
  /** null = carregando. */
  activity: LeadActivity | null;
  activityError: boolean;
  onRetryActivity: () => void;
  onNoteAdded: (note: LeadNoteRow) => void;
  onClose: () => void;
  onConvert: () => void;
  onWhatsApp: () => void;
  /** `configured` = envio de e-mail disponível no servidor. */
  onEmail: (configured: boolean) => void;
  /** Abre "Atribuir/Trocar responsável". */
  onAssign: () => void;
  /** Abre "Vincular contato/empresa" (só quando o lead ainda não tem). */
  onLink: (kind: "contact" | "company") => void;
}

/** Botão pequeno de ação dentro do painel (vincular, atribuir). */
function InlineAction({ icon: Icon, children, onClick }: { icon: typeof FaUser; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-lg bg-admin-drawer-card px-3 text-[13px] font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-card-border transition-colors hover:bg-admin-badge focus-visible:outline-2 focus-visible:outline-admin-accent"
    >
      <Icon aria-hidden className="h-3 w-3" />
      {children}
    </button>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium leading-[18px] text-admin-text-description">{label}</dt>
      <dd className="break-words text-sm font-medium leading-5 text-admin-drawer-value">{value}</dd>
    </div>
  );
}

function ActionIcon({ label, onClick, children, tone }: { label: string; onClick: () => void; children: React.ReactNode; tone?: "whatsapp" }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-drawer-card outline outline-1 -outline-offset-1 outline-admin-card-border transition-colors hover:bg-admin-badge focus-visible:outline-2 focus-visible:outline-admin-accent ${
          tone === "whatsapp" ? "text-admin-whatsapp" : "text-admin-text-label hover:text-text-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionIcon
      label={copied ? "Copiado!" : "Copiar"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Sem permissão de área de transferência: ignora.
        }
      }}
    >
      {copied ? <FaCheck aria-hidden className="h-3.5 w-3.5 text-admin-success" /> : <FaCopy aria-hidden className="h-3.5 w-3.5" />}
    </ActionIcon>
  );
}

/**
 * Painel lateral com os detalhes do lead (só leitura), contato rápido (WhatsApp / e-mail),
 * timeline de observações e e-mails enviados.
 */
export default function LeadDetailsDrawer({
  lead,
  basePath,
  busy,
  activity,
  activityError,
  onRetryActivity,
  onNoteAdded,
  onClose,
  onConvert,
  onWhatsApp,
  onEmail,
  onAssign,
  onLink,
}: LeadDetailsDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const id = useModalBehavior(panelRef, onClose);
  const titleId = `${id}-title`;
  const origin = lead.source ? leadSources.label(lead.source) : lead.entry === "website" ? "Website" : "Não informada";
  const { phones, emails } = contactChannelsOf(lead);
  const canLinkContact = !lead.contact;

  const sentEmails = activity?.emails ?? null;

  return createPortal(
    <div className="admin-modal-overlay fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="admin-drawer-panel flex h-full w-full max-w-[520px] flex-col bg-background-kpi outline outline-1 -outline-offset-1 outline-admin-drawer-border focus:outline-admin-drawer-border"
      >
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-admin-table-border px-7">
          <p className="text-sm font-semibold leading-5 text-admin-drawer-muted">Detalhes do lead</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-admin-drawer-card text-text-primary outline outline-1 -outline-offset-1 outline-admin-control-disabled-border hover:bg-admin-badge"
          >
            <FaXmark aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div data-modal-body className="min-h-0 flex-1 overflow-y-auto px-7 pb-8 pt-4">
          <h2 id={titleId} className="break-words text-[28px] font-semibold leading-[34px] text-text-primary">
            {lead.title}
          </h2>
          {lead.company && (
            <Link href={`${basePath}/empresas/${lead.company.id}`} className="mt-1.5 inline-block text-sm font-medium leading-5 text-admin-accent hover:underline">
              {lead.company.name}
            </Link>
          )}

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex h-[84px] flex-col justify-center gap-1.5 rounded-[10px] border border-admin-card-border bg-admin-drawer-card px-4">
              <span className="text-xs font-medium leading-[18px] text-admin-text-description">Qualificação</span>
              <span className={`text-[15px] font-medium leading-[21px] ${qualificationTextColors[lead.qualification]}`}>
                {leadQualifications.label(lead.qualification)}
              </span>
            </div>
            <div className="flex h-[84px] flex-col justify-center gap-1.5 rounded-[10px] border border-admin-card-border bg-admin-drawer-card px-4">
              <span className="text-xs font-medium leading-[18px] text-admin-text-description">Etapa atual</span>
              <span className="text-sm font-medium leading-5 text-admin-drawer-value">{leadStages.label(lead.stage)}</span>
            </div>
          </div>

          {/* Contato rápido */}
          <section className="mt-9" aria-labelledby={`${id}-contact`}>
            <h3 id={`${id}-contact`} className="text-base font-semibold leading-[22px] text-text-primary">
              Contato
            </h3>
            {lead.contact &&
              (lead.contact.id ? (
                <Link href={`${basePath}/contatos/${lead.contact.id}`} className="mt-1 inline-block text-sm text-admin-accent hover:underline">
                  {lead.contact.name} →
                </Link>
              ) : (
                <p className="mt-1 text-sm text-admin-text-description">{lead.contact.name}</p>
              ))}
            {canLinkContact && (
              <div className="mt-3">
                <InlineAction icon={FaUser} onClick={() => onLink("contact")}>
                  Vincular contato
                </InlineAction>
              </div>
            )}

            {phones.length === 0 && emails.length === 0 ? (
              <p className="mt-3 text-sm text-admin-text-hint">Sem e-mail ou telefone cadastrados.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {phones.map((p) => (
                  <li key={`p-${p.digits}`} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-admin-text-description">Telefone / WhatsApp{phones.length > 1 ? ` · ${p.label}` : ""}</p>
                      <p className="truncate text-sm font-medium text-admin-drawer-value">{formatPhone(p.digits)}</p>
                    </div>
                    <ActionIcon label="Conversar no WhatsApp" tone="whatsapp" onClick={onWhatsApp}>
                      <FaWhatsapp aria-hidden className="h-4 w-4" />
                    </ActionIcon>
                    <CopyButton value={formatPhone(p.digits)} />
                  </li>
                ))}
                {emails.map((e) => (
                  <li key={`e-${e.email}`} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-admin-text-description">E-mail{emails.length > 1 ? ` · ${e.label}` : ""}</p>
                      <p className="truncate text-sm font-medium text-admin-drawer-value">{e.email}</p>
                    </div>
                    <ActionIcon label="Escrever e-mail" onClick={() => onEmail(activity?.emailConfigured ?? false)}>
                      <FaEnvelope aria-hidden className="h-3.5 w-3.5" />
                    </ActionIcon>
                    <CopyButton value={e.email} />
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-4">
              <Info
                label="Empresa"
                value={
                  lead.company ? (
                    <Link href={`${basePath}/empresas/${lead.company.id}`} className="text-admin-accent hover:underline">
                      {lead.company.name}
                    </Link>
                  ) : (
                    <span className="mt-1 inline-flex">
                      <InlineAction icon={FaBuilding} onClick={() => onLink("company")}>
                        Vincular empresa
                      </InlineAction>
                    </span>
                  )
                }
              />
            </dl>
          </section>

          <hr className="my-6 border-admin-table-border" />

          <section>
            <h3 className="text-base font-semibold leading-[22px] text-text-primary">Origem e captura</h3>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
              <Info label="Origem" value={origin} />
              <Info label="Capturado em" value={formatDateTime(lead.created_at)} />
              <Info label="Entrada" value={lead.entry === "website" ? "Formulário do site" : "Cadastro manual"} />
              <Info
                label="Status"
                value={
                  <span className="inline-flex items-center gap-1">
                    <LeadStatusIcon status={lead.status} className="h-3.5 w-3.5" />
                    {leadStatuses.label(lead.status)}
                  </span>
                }
              />
              {lead.campaign && <Info label="Campanha / referência" value={lead.campaign} />}
              {lead.interest_plan && <Info label="Plano de interesse" value={lead.interest_plan.charAt(0).toUpperCase() + lead.interest_plan.slice(1)} />}
              {lead.estimated_value_cents !== null && <Info label="Valor estimado" value={formatCents(lead.estimated_value_cents)} />}
              {lead.expected_close_date && <Info label="Previsão de fechamento" value={formatCalendarDate(lead.expected_close_date)} />}
              {lead.last_contact_at && <Info label="Último e-mail enviado" value={formatDate(lead.last_contact_at)} />}
            </dl>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] font-medium leading-[19px] text-admin-drawer-muted">
                Responsável pela captura: {lead.owner_name ?? "sem responsável"}
              </p>
              <InlineAction icon={FaUserCheck} onClick={onAssign}>
                {lead.owner_uid ? "Trocar responsável" : "Atribuir responsável"}
              </InlineAction>
            </div>
          </section>

          {lead.tags.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-1.5" aria-label="Tags">
              {lead.tags.map((tag) => (
                <li key={tag} className="rounded-md bg-admin-badge px-2 py-1 text-xs font-medium text-admin-badge-text">
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <section className="mt-8" aria-labelledby={`${id}-notes`}>
            <h3 id={`${id}-notes`} className="text-base font-medium leading-[22px] text-text-primary">
              Observações
            </h3>
            <LeadNotesTimeline lead={lead} basePath={basePath} notes={activity?.notes ?? null} loadError={activityError} onRetry={onRetryActivity} onAdded={onNoteAdded} />
          </section>

          <section className="mt-8" aria-labelledby={`${id}-emails`}>
            <h3 id={`${id}-emails`} className="text-base font-medium leading-[22px] text-text-primary">
              E-mails enviados
            </h3>
            {activityError ? (
              <p className="mt-3 text-sm text-admin-text-hint">Não foi possível carregar o histórico.</p>
            ) : !sentEmails ? (
              <CardListSkeleton />
            ) : sentEmails.length === 0 ? (
              <p className="mt-3 text-sm text-admin-text-hint">Nenhum e-mail enviado pelo CRM ainda.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {sentEmails.map((m) => (
                  <li key={m.id} className="rounded-lg bg-admin-drawer-card px-4 py-3 outline outline-1 -outline-offset-1 outline-admin-card-border">
                    <p className="truncate text-sm font-medium text-admin-drawer-value">{m.subject}</p>
                    <p className="mt-0.5 text-xs text-admin-text-hint">
                      {m.status === "sent" ? "Enviado" : <span className="text-admin-danger">Falhou</span>} para {m.to} · {formatDateTime(m.created_at)}
                      {m.sent_by_name ? ` · por ${m.sent_by_name}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-admin-divider px-7 py-5 sm:flex-row sm:justify-end">
          {lead.deal_id ? (
            <p className="self-center text-xs font-medium text-admin-tip-title sm:mr-auto">Já convertido em negociação.</p>
          ) : (
            <Button variant="secondary" icon={FaHandshake} onClick={onConvert} disabled={busy}>
              Converter para negociação
            </Button>
          )}
          <Button onClick={onClose} className="sm:w-[142px]">
            Fechar
          </Button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
