"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaArrowLeft, FaBuilding, FaEnvelope, FaPen, FaPowerOff, FaWhatsapp } from "react-icons/fa6";
import { contactChannels, contactConsents } from "@/lib/admin/crm/options";
import { whatsappLink } from "@/lib/admin/crm/templates";
import type { ContactDetail, LeadNoteRow } from "@/lib/admin/crm/types";
import { CONTACT_COMPANY_NONE, type ContactForm } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import ConfirmDialog from "../form/ConfirmDialog";
import CreateContactModal from "../leads/CreateContactModal";
import { useCrmOptions } from "../leads/crmOptionsStore";
import { formatDateTime, formatPhone } from "../leads/leadVisuals";
import NotesTimeline from "../shared/NotesTimeline";
import RelatedLeads from "../shared/RelatedLeads";
import { Card, InfoItem, SectionHeader, StatusBadge } from "../shared/entityVisuals";
import { useNotes } from "../shared/useNotes";
import { contactErrorMessage } from "./ContactsView";

interface ContactDetailViewProps {
  contact: ContactDetail;
  /** Timeline já carregada pela página (sem requisição extra). */
  initialNotes: LeadNoteRow[];
  basePath: string;
}

/** Contato salvo → formulário de edição (com máscara de telefone). */
function toForm(c: ContactDetail): ContactForm {
  return {
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ? formatPhone(c.phone) : "",
    role: c.role ?? "",
    preferred_channel: c.preferred_channel ?? "",
    company_choice: c.company?.id ?? CONTACT_COMPANY_NONE,
    notes: c.notes ?? "",
    comm_consent: c.comm_consent,
  };
}

/** Página do contato: dados, empresa, leads dele e timeline. Editar e inativar ficam no histórico. */
export default function ContactDetailView({ contact, initialNotes, basePath }: ContactDetailViewProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const notes = useNotes(initialNotes);
  const companies = useCrmOptions(basePath, "companies");
  const firstName = contact.name.split(/\s+/)[0] ?? contact.name;
  const active = contact.status === "ativo";

  /** Grava (edição ou status) e busca a página de novo (só este contato). */
  const patch = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    setServerError(null);
    setNotice(null);
    try {
      const response = await fetch(`${basePath}/api/crm/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const message = await contactErrorMessage(response);
        if (editing) setServerError(message);
        else setNotice({ tone: "error", text: message });
        return false;
      }
      const data = (await response.json()) as { changed: boolean };
      setNotice({ tone: "success", text: data.changed ? success : "Nada mudou." });
      // Página atualizada traz dados e timeline novos de uma vez.
      startRefresh(() => router.refresh());
      return true;
    } catch {
      setNotice({ tone: "error", text: "Sem conexão com o servidor. Tente de novo." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href={`${basePath}/contatos`} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-admin-text-description hover:text-text-primary">
        <FaArrowLeft aria-hidden className="h-3 w-3" />
        Contatos
      </Link>

      {/* Cabeçalho */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-admin-tip text-2xl font-semibold text-admin-tip-title">
            {firstName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-words text-[28px] font-semibold leading-[34px] text-text-primary">{contact.name}</h1>
              <StatusBadge status={contact.status} />
            </div>
            <p className="mt-1 text-sm font-medium text-admin-text-description">
              {contact.role ?? "Sem cargo"}
              {contact.company && (
                <>
                  {" · "}
                  <Link href={`${basePath}/empresas/${contact.company.id}`} className="text-admin-accent hover:underline">
                    {contact.company.name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {contact.phone && (
            <a
              href={whatsappLink(contact.phone, `Olá, ${firstName}! Aqui é da Tecfy.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-admin-card px-4 text-sm font-semibold text-admin-whatsapp outline outline-1 -outline-offset-1 outline-admin-button-border hover:bg-admin-badge"
            >
              <FaWhatsapp aria-hidden className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-admin-card px-4 text-sm font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-button-border hover:bg-admin-badge"
            >
              <FaEnvelope aria-hidden className="h-3.5 w-3.5" />
              E-mail
            </a>
          )}
          <Button variant="secondary" icon={FaPowerOff} onClick={() => setConfirmStatus(true)} disabled={busy || refreshing}>
            {active ? "Inativar" : "Reativar"}
          </Button>
          <Button
            icon={FaPen}
            onClick={() => {
              setServerError(null);
              setEditing(true);
            }}
            disabled={busy || refreshing}
          >
            Editar
          </Button>
        </div>
      </header>

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`rounded-lg px-4 py-3 text-sm font-medium ${notice.tone === "error" ? "bg-admin-danger/10 text-admin-danger" : "bg-admin-success/10 text-admin-success"}`}
        >
          {notice.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <SectionHeader title="Dados de contato" />
            <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <InfoItem label="E-mail" value={contact.email} />
              <InfoItem label="Telefone / WhatsApp" value={contact.phone ? formatPhone(contact.phone) : null} />
              <InfoItem label="Cargo" value={contact.role} />
              <InfoItem label="Canal de contato preferido" value={contact.preferred_channel ? contactChannels.label(contact.preferred_channel) : null} />
              <InfoItem label="Permissão para comunicações" value={contactConsents.label(contact.comm_consent)} />
              <InfoItem label="Cadastrado em" value={`${formatDateTime(contact.created_at)}${contact.created_by_name ? ` · por ${contact.created_by_name}` : ""}`} />
            </dl>
          </Card>

          <Card>
            <SectionHeader title="Leads" count={contact.leads.length} />
            <RelatedLeads leads={contact.leads} basePath={basePath} emptyText="Este contato ainda não está em nenhum lead." />
          </Card>

          <Card>
            <SectionHeader title="Histórico e observações" />
            <NotesTimeline
              postUrl={`${basePath}/api/crm/contacts/${contact.id}/notes`}
              initial={contact.notes ? { text: contact.notes, author: contact.created_by_name, created_at: contact.created_at } : null}
              notes={notes.notes}
              loadError={false}
              onRetry={() => router.refresh()}
              onAdded={notes.prepend}
              subject="contato"
            />
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <SectionHeader title="Empresa" />
            {contact.company ? (
              <Link
                href={`${basePath}/empresas/${contact.company.id}`}
                className="mt-4 flex items-center gap-3 rounded-lg bg-admin-drawer-card p-4 outline outline-1 -outline-offset-1 outline-admin-card-border hover:bg-admin-badge"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-admin-badge">
                  <FaBuilding aria-hidden className="h-4 w-4 text-admin-badge-text" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-text-primary">{contact.company.name}</span>
                  <span className="text-xs text-admin-accent">Ver empresa →</span>
                </span>
              </Link>
            ) : (
              <p className="mt-3 text-sm text-admin-text-hint">Sem empresa. Use “Editar” para vincular este contato a uma empresa.</p>
            )}
          </Card>
        </aside>
      </div>

      {editing && (
        <CreateContactModal
          mode="edit"
          initial={toForm(contact)}
          companies={companies.options ?? []}
          leadCompanyName={null}
          busy={busy}
          serverError={serverError}
          onClose={() => setEditing(false)}
          onSubmit={async (form) => {
            if (await patch({ contact: form }, "Contato atualizado. As alterações estão no histórico.")) setEditing(false);
          }}
        />
      )}

      {confirmStatus && (
        <ConfirmDialog
          title={active ? "Inativar contato" : "Reativar contato"}
          tone={active ? "danger" : "primary"}
          confirmLabel={active ? "Inativar" : "Reativar"}
          busy={busy}
          onCancel={() => setConfirmStatus(false)}
          onConfirm={async () => {
            await patch({ status: active ? "inativo" : "ativo" }, active ? "Contato inativado." : "Contato reativado.");
            setConfirmStatus(false);
          }}
          message={
            active
              ? "O contato continua guardado com todo o histórico, só sai do dia a dia. Dá para reativar quando quiser."
              : "O contato volta a ficar ativo."
          }
        />
      )}
    </div>
  );
}
