"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import { FaArrowLeft, FaBox, FaBuilding, FaEnvelope, FaGlobe, FaHandshake, FaPen, FaPowerOff, FaUserPlus, FaUsers, FaBullseye } from "react-icons/fa6";
import { companySegments, companySizes } from "@/lib/admin/crm/options";
import type { CompanyDetail, ContactRow, LeadNoteRow } from "@/lib/admin/crm/types";
import type { CompanyForm } from "@/lib/admin/crm/validation";
import { maskCep, maskCnpj } from "@/utils/masks";
import Button from "../form/Button";
import ConfirmDialog from "../form/ConfirmDialog";
import CreateCompanyModal from "../leads/CreateCompanyModal";
import { formatCents, formatDate, formatDateTime, formatPhone } from "../leads/leadVisuals";
import NotesTimeline from "../shared/NotesTimeline";
import RelatedLeads from "../shared/RelatedLeads";
import { Card, ClientBadge, InfoItem, OpenLink, SectionHeader, StatusBadge } from "../shared/entityVisuals";
import { useNotes } from "../shared/useNotes";
import AddMemberModal from "./AddMemberModal";
import { companyErrorMessage, locationOf } from "./CompaniesView";

interface CompanyDetailViewProps {
  company: CompanyDetail;
  /** Timeline já carregada pela página (sem requisição extra). */
  initialNotes: LeadNoteRow[];
  basePath: string;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Empresa salva → formulário de edição (com máscaras). */
function toForm(c: CompanyDetail): CompanyForm {
  return {
    trade_name: c.trade_name,
    legal_name: c.legal_name ?? "",
    cnpj: c.cnpj ? maskCnpj(c.cnpj) : "",
    website: c.website ?? "",
    email: c.email ?? "",
    phone: c.phone ? formatPhone(c.phone) : "",
    segment: c.segment ?? "",
    size: c.size ?? "",
    street: c.address.street ?? "",
    number: c.address.number ?? "",
    zip: c.address.zip ? maskCep(c.address.zip) : "",
    district: c.address.district ?? "",
    city: c.address.city ?? "",
    region: c.address.region ?? "",
    notes: c.notes ?? "",
  };
}

function Stat({ icon: Icon, label, value }: { icon: IconType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-background-kpi px-4 py-3 outline outline-1 -outline-offset-1 outline-admin-table-border">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-badge">
        <Icon aria-hidden className="h-3.5 w-3.5 text-admin-tip-title" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-admin-text-description">{label}</span>
        <span className="block text-lg font-semibold leading-6 text-text-primary">{value}</span>
      </span>
    </div>
  );
}

/**
 * Página da empresa: dados, endereço, funcionários, leads, negociações, produtos contratados
 * (Cliente/Prospect) e timeline. Editar, inativar e adicionar funcionário ficam no histórico.
 */
export default function CompanyDetailView({ company, initialNotes, basePath }: CompanyDetailViewProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const notes = useNotes(initialNotes);
  const active = company.status === "ativo";
  const activeContracts = company.contracts.filter((c) => c.status === "active" && c.billing !== "unico");
  const monthly = activeContracts.reduce((sum, c) => sum + c.monthly_value, 0);
  const address = [
    [company.address.street, company.address.number].filter(Boolean).join(", "),
    company.address.district,
    locationOf(company.address.city, company.address.region) !== "—" ? locationOf(company.address.city, company.address.region) : null,
    company.address.zip ? `CEP ${maskCep(company.address.zip)}` : null,
  ].filter(Boolean);

  /** Página atualizada traz dados e timeline novos de uma vez. */
  const refresh = () => startRefresh(() => router.refresh());

  const patch = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    setServerError(null);
    setNotice(null);
    try {
      const response = await fetch(`${basePath}/api/crm/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const message = await companyErrorMessage(response);
        if (editing) setServerError(message);
        else setNotice({ tone: "error", text: message });
        return false;
      }
      const data = (await response.json()) as { changed: boolean };
      setNotice({ tone: "success", text: data.changed ? success : "Nada mudou." });
      refresh();
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
      <Link href={`${basePath}/empresas`} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-admin-text-description hover:text-text-primary">
        <FaArrowLeft aria-hidden className="h-3 w-3" />
        Empresas
      </Link>

      {/* Cabeçalho */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-admin-tip">
            <FaBuilding className="h-6 w-6 text-admin-tip-title" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-words text-[28px] font-semibold leading-[34px] text-text-primary">{company.trade_name}</h1>
              <ClientBadge isClient={company.is_client} />
              <StatusBadge status={company.status} />
            </div>
            <p className="mt-1 text-sm font-medium text-admin-text-description">
              {[company.legal_name, company.cnpj ? `CNPJ ${maskCnpj(company.cnpj)}` : null, company.segment ? companySegments.label(company.segment) : null]
                .filter(Boolean)
                .join(" · ") || "Sem razão social e CNPJ"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {company.website && (
            <a
              href={/^https?:\/\//i.test(company.website) ? company.website : `https://${company.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-admin-card px-4 text-sm font-semibold text-text-primary outline outline-1 -outline-offset-1 outline-admin-button-border hover:bg-admin-badge"
            >
              <FaGlobe aria-hidden className="h-3.5 w-3.5" />
              Site
            </a>
          )}
          {company.email && (
            <a
              href={`mailto:${company.email}`}
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

      {/* Números rápidos */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FaUsers} label="Funcionários" value={String(company.employees.length)} />
        <Stat icon={FaBullseye} label="Leads" value={String(company.leads.length)} />
        <Stat icon={FaHandshake} label="Negociações" value={String(company.deals.length)} />
        <Stat icon={FaBox} label="Produtos ativos" value={activeContracts.length ? `${activeContracts.length} · ${brl.format(monthly)}/mês` : "0"} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Funcionários */}
          <Card>
            <SectionHeader
              title="Funcionários"
              count={company.employees.length}
              action={
                <Button variant="secondary" icon={FaUserPlus} onClick={() => setAddingMember(true)} className="h-9 px-4 text-[13px]">
                  Adicionar funcionário
                </Button>
              }
            />
            {company.employees.length === 0 ? (
              <p className="mt-3 text-sm text-admin-text-hint">Nenhum funcionário cadastrado. Adicione as pessoas com quem a Tecfy fala nesta empresa.</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-admin-table-divider overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-admin-table-border">
                {company.employees.map((p: ContactRow) => (
                  <li key={p.id} className="flex items-center gap-3 bg-admin-table px-4 py-2.5">
                    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-admin-badge text-sm font-semibold text-admin-badge-text">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`${basePath}/contatos/${p.id}`} className="block truncate text-sm font-semibold text-text-primary hover:underline">
                        {p.name}
                      </Link>
                      <p className="truncate text-xs text-admin-table-subtext">
                        {[p.role, p.email, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(" · ") || "Sem dados de contato"}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                    <OpenLink href={`${basePath}/contatos/${p.id}`} label={`Abrir ${p.name}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Produtos contratados */}
          <Card>
            <SectionHeader title="Produtos contratados" count={activeContracts.length} />
            {company.contracts.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-admin-card-border p-5 text-sm text-admin-text-hint">
                Nenhum produto atribuído ainda — por isso a empresa aparece como <strong className="text-admin-text-label">Prospect</strong>. Quando um
                produto for atribuído a ela (tela de Produtos), ela vira <strong className="text-admin-qual-sure-text">Cliente</strong> automaticamente.
              </div>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-admin-table-divider overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-admin-table-border">
                {company.contracts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 bg-admin-table px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{c.product_name}</p>
                      <p className="text-xs text-admin-table-subtext">Desde {formatDate(c.signed_at)}</p>
                    </div>
                    <span className="text-right text-sm font-semibold text-text-primary">
                      {c.billing === "unico" ? `${brl.format(c.one_time_total)} único` : `${brl.format(c.monthly_value)}/mês`}
                      {c.billing !== "unico" && c.one_time_total > 0 && <span className="block text-[11px] font-medium text-admin-table-subtext">+ {brl.format(c.one_time_total)} implantação</span>}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${c.status === "active" ? "bg-admin-qual-sure text-admin-qual-sure-text" : "bg-admin-badge text-admin-text-hint"}`}>
                      {c.status === "active" ? "Ativo" : "Cancelado"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeader title="Leads" count={company.leads.length} />
            <RelatedLeads leads={company.leads} basePath={basePath} emptyText="Nenhum lead ligado a esta empresa." />
          </Card>

          <Card>
            <SectionHeader title="Negociações" count={company.deals.length} />
            {company.deals.length === 0 ? (
              <p className="mt-3 text-sm text-admin-text-hint">Nenhuma negociação ainda. Elas surgem quando um lead desta empresa é convertido.</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-admin-table-divider overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-admin-table-border">
                {company.deals.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 bg-admin-table px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{d.title}</p>
                      <p className="text-xs text-admin-table-subtext">
                        {formatDate(d.created_at)}
                        {d.owner_name ? ` · ${d.owner_name}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-admin-text-label">{d.estimated_value_cents !== null ? formatCents(d.estimated_value_cents) : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeader title="Histórico e observações" />
            <NotesTimeline
              postUrl={`${basePath}/api/crm/companies/${company.id}/notes`}
              initial={company.notes ? { text: company.notes, author: company.created_by_name, created_at: company.created_at } : null}
              notes={notes.notes}
              loadError={false}
              onRetry={() => router.refresh()}
              onAdded={notes.prepend}
              subject="empresa"
            />
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <SectionHeader title="Informações" />
            <dl className="mt-5 flex flex-col gap-5">
              <InfoItem label="Razão social" value={company.legal_name} />
              <InfoItem label="CNPJ" value={company.cnpj ? maskCnpj(company.cnpj) : null} />
              <InfoItem label="Segmento" value={company.segment ? companySegments.label(company.segment) : null} />
              <InfoItem label="Porte" value={company.size ? companySizes.label(company.size) : null} />
              <InfoItem label="E-mail" value={company.email} />
              <InfoItem label="Telefone" value={company.phone ? formatPhone(company.phone) : null} />
              <InfoItem label="Site" value={company.website} />
              <InfoItem label="Cadastrada em" value={`${formatDateTime(company.created_at)}${company.created_by_name ? ` · por ${company.created_by_name}` : ""}`} />
            </dl>
          </Card>
          <Card>
            <SectionHeader title="Endereço" />
            {address.length ? (
              <p className="mt-4 whitespace-pre-line text-sm font-medium leading-6 text-admin-drawer-value">
                {address.join("\n")}
              </p>
            ) : (
              <p className="mt-3 text-sm text-admin-text-hint">Endereço não informado.</p>
            )}
          </Card>
        </aside>
      </div>

      {editing && (
        <CreateCompanyModal
          mode="edit"
          initial={toForm(company)}
          busy={busy}
          serverError={serverError}
          onClose={() => setEditing(false)}
          onSubmit={async (form) => {
            if (await patch({ company: form }, "Empresa atualizada. As alterações estão no histórico.")) setEditing(false);
          }}
        />
      )}

      {addingMember && (
        <AddMemberModal
          companyId={company.id}
          companyName={company.trade_name}
          basePath={basePath}
          memberIds={new Set(company.employees.map((e) => e.id))}
          onClose={() => setAddingMember(false)}
          onAdded={(contact) => {
            setAddingMember(false);
            setNotice({ tone: "success", text: `${contact.name} agora é funcionário(a) da ${company.trade_name}.` });
            refresh();
          }}
        />
      )}

      {confirmStatus && (
        <ConfirmDialog
          title={active ? "Inativar empresa" : "Reativar empresa"}
          tone={active ? "danger" : "primary"}
          confirmLabel={active ? "Inativar" : "Reativar"}
          busy={busy}
          onCancel={() => setConfirmStatus(false)}
          onConfirm={async () => {
            await patch({ status: active ? "inativo" : "ativo" }, active ? "Empresa inativada." : "Empresa reativada.");
            setConfirmStatus(false);
          }}
          message={
            active
              ? "A empresa continua guardada com funcionários e histórico, só sai do dia a dia. Dá para reativar quando quiser."
              : "A empresa volta a ficar ativa."
          }
        />
      )}
    </div>
  );
}
