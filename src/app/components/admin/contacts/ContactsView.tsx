"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaPlus } from "react-icons/fa6";
import { entityStatuses, type Option } from "@/lib/admin/crm/options";
import type { ContactRow } from "@/lib/admin/crm/types";
import { CONTACT_COMPANY_NONE, emptyContactForm, type ContactForm } from "@/lib/admin/crm/validation";
import Button from "../form/Button";
import CreateContactModal from "../leads/CreateContactModal";
import LeadsPagination, { PAGE_SIZES } from "../leads/LeadsPagination";
import { invalidateCrmOptions, useCrmOptions } from "../leads/crmOptionsStore";
import { formatPhone } from "../leads/leadVisuals";
import { FilterSelect, ReloadButton, SearchInput, matchesSearch } from "../shared/ListControls";
import { OpenLink, StatusBadge } from "../shared/entityVisuals";

interface ContactsViewProps {
  contacts: ContactRow[];
  truncated: boolean;
  basePath: string;
}

type Sort = "recent" | "oldest" | "az" | "za";
const sortOptions: Option<Sort>[] = [
  { value: "recent", label: "Mais recentes primeiro" },
  { value: "oldest", label: "Mais antigos primeiro" },
  { value: "az", label: "Nome de A a Z" },
  { value: "za", label: "Nome de Z a A" },
];
const companyFilterOptions: Option[] = [
  { value: "with", label: "Com empresa" },
  { value: "without", label: "Sem empresa" },
];

const integer = new Intl.NumberFormat("pt-BR");

/** Mensagem amigável para erros da API de contatos. */
export async function contactErrorMessage(response: Response): Promise<string> {
  if (response.status === 409) {
    const data = (await response.json().catch(() => ({}))) as { owner?: { name?: string } };
    return `Este e-mail já pertence ao contato “${data.owner?.name ?? "outro contato"}”. Contatos têm e-mail único.`;
  }
  if (response.status === 401) return "Sua sessão expirou. Entre de novo no painel.";
  if (response.status === 404) return "Este cadastro não existe mais.";
  if (response.status === 400) return "Confira os campos e tente de novo.";
  return "Não foi possível salvar. Tente de novo.";
}

/** Lista de contatos: busca, filtros, ordenação, paginação e cadastro. Abre a página do contato. */
export default function ContactsView({ contacts, truncated, basePath }: ContactsViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(PAGE_SIZES[0]);
  const [added, setAdded] = useState<ContactRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; href: string } | null>(null);
  const [reloading, startReload] = useTransition();
  const companies = useCrmOptions(basePath, "companies");

  // Lista nova do servidor ("Atualizar") já inclui os criados aqui.
  const [base, setBase] = useState(contacts);
  if (base !== contacts) {
    setBase(contacts);
    setAdded([]);
  }

  const rows = useMemo(() => {
    const ids = new Set(contacts.map((c) => c.id));
    return [...added.filter((c) => !ids.has(c.id)), ...contacts];
  }, [contacts, added]);

  const filtered = useMemo(() => {
    const list = rows.filter((c) => {
      if (status && c.status !== status) return false;
      if (companyFilter === "with" && !c.company) return false;
      if (companyFilter === "without" && c.company) return false;
      return matchesSearch(query, c.name, c.role, c.email, c.phone, c.company?.name);
    });
    const byName = (a: ContactRow, b: ContactRow) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    const byDate = (a: ContactRow, b: ContactRow) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id);
    if (sort === "az") return list.sort(byName);
    if (sort === "za") return list.sort((a, b) => byName(b, a));
    if (sort === "oldest") return list.sort(byDate);
    return list.sort((a, b) => byDate(b, a));
  }, [rows, query, status, companyFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const href = (id: string) => `${basePath}/contatos/${id}`;

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const create = async (form: ContactForm) => {
    setSaving(true);
    setServerError(null);
    try {
      const response = await fetch(`${basePath}/api/crm/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: form }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setServerError(await contactErrorMessage(response));
        return;
      }
      const data = (await response.json()) as { contact: ContactRow };
      setAdded((a) => [data.contact, ...a]);
      invalidateCrmOptions("contacts");
      setCreating(false);
      setNotice({ text: `Contato “${data.contact.name}” criado.`, href: href(data.contact.id) });
    } catch {
      setServerError("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-center gap-4">
            <h1 className="text-[32px] font-semibold leading-[38px] text-text-primary">Contatos</h1>
            <span className="flex h-7 min-w-[38px] items-center justify-center rounded-lg bg-admin-badge px-2.5 text-sm font-semibold text-admin-badge-text">
              {integer.format(rows.length)}
            </span>
          </div>
          <p className="text-sm font-medium leading-5 text-admin-text-description">As pessoas com quem a Tecfy conversa: dos leads, dos clientes e das empresas.</p>
        </div>
        <Button
          icon={FaPlus}
          onClick={() => {
            setServerError(null);
            setCreating(true);
          }}
        >
          Criar contato
        </Button>
      </header>

      <section aria-label="Contatos" className="flex flex-col gap-6">
        <div className="flex flex-col gap-[18px]">
          <div className="flex gap-3">
            <SearchInput value={query} onChange={resetPage(setQuery)} placeholder="Buscar por nome, cargo, e-mail, telefone ou empresa" />
            <ReloadButton onClick={() => startReload(() => router.refresh())} reloading={reloading} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:gap-5">
            <FilterSelect label="Status" value={status} options={entityStatuses.options} allLabel="Todos os status" onChange={resetPage(setStatus)} />
            <FilterSelect label="Empresa" value={companyFilter} options={companyFilterOptions} allLabel="Com e sem empresa" onChange={resetPage(setCompanyFilter)} />
            <FilterSelect label="Ordenar por" value={sort} options={sortOptions} onChange={(v) => setSort(v as Sort)} />
          </div>
        </div>

        {truncated && (
          <p role="status" className="rounded-lg bg-admin-qual-hot px-4 py-3 text-sm font-medium text-admin-qual-hot-text">
            Mostrando os {integer.format(rows.length)} contatos mais recentes.
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-admin-success/10 px-4 py-3 text-sm font-medium text-admin-success">
            {notice.text}{" "}
            <Link href={notice.href} className="font-semibold underline">
              Abrir contato
            </Link>
          </p>
        )}

        <div className="overflow-hidden rounded-xl bg-admin-table outline outline-1 -outline-offset-1 outline-admin-table-border">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <p className="text-base font-semibold text-text-primary">Nenhum contato ainda</p>
              <p className="text-sm text-admin-text-description">Eles aparecem aqui quando chegam leads pelo site, quando você cria um lead ou em “Criar contato”.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <p className="text-sm text-admin-text-description">Nenhum contato encontrado com essa busca e filtros.</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setStatus("");
                  setCompanyFilter("");
                  setPage(1);
                }}
              >
                Limpar busca e filtros
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead className="bg-admin-table-head">
                    <tr className="text-left text-xs font-medium leading-[18px] text-admin-table-head-text">
                      <th scope="col" className="px-3 py-[13px] pl-6 font-medium">Nome / cargo</th>
                      <th scope="col" className="px-3 py-[13px] font-medium">E-mail / telefone</th>
                      <th scope="col" className="px-3 py-[13px] font-medium">Empresa</th>
                      <th scope="col" className="w-[120px] px-3 py-[13px] font-medium">Status</th>
                      <th scope="col" className="w-[88px] px-3 py-[13px] pr-6 text-center font-medium">Abrir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((c, i) => (
                      <tr
                        key={c.id}
                        // Linha inteira abre o registro (links e botões dentro dela continuam com o comportamento deles).
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("a, button")) return;
                          router.push(href(c.id));
                        }}
                        className={`h-[60px] cursor-pointer border-b border-admin-table-divider transition-colors last:border-0 hover:bg-admin-card ${i % 2 ? "bg-admin-table-alt" : "bg-admin-table"}`}
                      >
                        <td className="max-w-[260px] px-3 pl-6">
                          <Link href={href(c.id)} className="block truncate text-sm font-semibold leading-5 text-text-primary hover:underline">
                            {c.name}
                          </Link>
                          <p className="mt-[3px] truncate text-xs font-medium leading-[18px] text-admin-table-subtext">{c.role ?? "Sem cargo"}</p>
                        </td>
                        <td className="max-w-[260px] px-3">
                          <p className="truncate text-[13px] font-medium leading-5 text-text-primary">{c.email ?? "—"}</p>
                          <p className="mt-[2px] truncate text-xs font-medium leading-[18px] text-admin-table-subtext">{c.phone ? formatPhone(c.phone) : "—"}</p>
                        </td>
                        <td className="max-w-[220px] truncate px-3 text-[13px] font-medium">
                          {c.company ? (
                            <Link href={`${basePath}/empresas/${c.company.id}`} className="text-admin-accent hover:underline">
                              {c.company.name}
                            </Link>
                          ) : (
                            <span className="text-admin-text-hint">Sem empresa</span>
                          )}
                        </td>
                        <td className="px-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-3 pr-6 text-center">
                          <OpenLink href={href(c.id)} label={`Abrir ${c.name}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <LeadsPagination
                page={currentPage}
                pageCount={pageCount}
                perPage={perPage}
                total={filtered.length}
                onPage={setPage}
                onPerPage={(size) => {
                  setPerPage(size);
                  setPage(1);
                }}
                noun={{ one: "contato", many: "contatos" }}
              />
            </>
          )}
        </div>
      </section>

      {creating && (
        <CreateContactModal
          mode="create"
          initial={{ ...emptyContactForm(), company_choice: CONTACT_COMPANY_NONE }}
          companies={companies.options ?? []}
          leadCompanyName={null}
          busy={saving}
          serverError={serverError}
          onClose={() => setCreating(false)}
          onSubmit={create}
        />
      )}
    </div>
  );
}
