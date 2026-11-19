"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaPlus } from "react-icons/fa6";
import { companyRegions, companySegments, companySizes, entityStatuses, type Option } from "@/lib/admin/crm/options";
import type { CompanyRow } from "@/lib/admin/crm/types";
import { emptyCompanyForm, type CompanyForm } from "@/lib/admin/crm/validation";
import { maskCnpj } from "@/utils/masks";
import Button from "../form/Button";
import CreateCompanyModal from "../leads/CreateCompanyModal";
import LeadsPagination, { PAGE_SIZES } from "../leads/LeadsPagination";
import { invalidateCrmOptions } from "../leads/crmOptionsStore";
import { formatPhone } from "../leads/leadVisuals";
import { FilterSelect, ReloadButton, SearchInput, matchesSearch } from "../shared/ListControls";
import { ClientBadge, OpenLink, StatusBadge } from "../shared/entityVisuals";

interface CompaniesViewProps {
  companies: CompanyRow[];
  truncated: boolean;
  basePath: string;
}

type Sort = "recent" | "oldest" | "az" | "za";
const sortOptions: Option<Sort>[] = [
  { value: "recent", label: "Mais recentes primeiro" },
  { value: "oldest", label: "Mais antigas primeiro" },
  { value: "az", label: "Nome de A a Z" },
  { value: "za", label: "Nome de Z a A" },
];
const clientOptions: Option[] = [
  { value: "client", label: "Clientes" },
  { value: "prospect", label: "Prospects" },
];

const integer = new Intl.NumberFormat("pt-BR");

/** "São Paulo · SP" / "SP · Brasil" / "Exterior". */
export function locationOf(city: string | null, region: string | null): string {
  const uf = region === "EX" ? "Exterior" : region;
  return [city, uf].filter(Boolean).join(" · ") || "—";
}

/** Mensagem amigável para erros da API de empresas. */
export async function companyErrorMessage(response: Response): Promise<string> {
  if (response.status === 409) {
    const data = (await response.json().catch(() => ({}))) as { owner?: { name?: string } };
    return `Este CNPJ já pertence à empresa “${data.owner?.name ?? "outra empresa"}”. Empresas têm CNPJ único.`;
  }
  if (response.status === 401) return "Sua sessão expirou. Entre de novo no painel.";
  if (response.status === 404) return "Esta empresa não existe mais.";
  if (response.status === 400) return "Confira os campos e tente de novo.";
  return "Não foi possível salvar. Tente de novo.";
}

/** Lista de empresas: busca, filtros (status, cliente, segmento, porte, estado), ordenação, cadastro. */
export default function CompaniesView({ companies, truncated, basePath }: CompaniesViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [client, setClient] = useState("");
  const [segment, setSegment] = useState("");
  const [size, setSize] = useState("");
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(PAGE_SIZES[0]);
  const [added, setAdded] = useState<CompanyRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; href: string } | null>(null);
  const [reloading, startReload] = useTransition();

  const [base, setBase] = useState(companies);
  if (base !== companies) {
    setBase(companies);
    setAdded([]);
  }

  const rows = useMemo(() => {
    const ids = new Set(companies.map((c) => c.id));
    return [...added.filter((c) => !ids.has(c.id)), ...companies];
  }, [companies, added]);

  const filtered = useMemo(() => {
    const list = rows.filter((c) => {
      if (status && c.status !== status) return false;
      if (client === "client" && !c.is_client) return false;
      if (client === "prospect" && c.is_client) return false;
      if (segment && c.segment !== segment) return false;
      if (size && c.size !== size) return false;
      if (region && c.region !== region) return false;
      return matchesSearch(query, c.trade_name, c.legal_name, c.cnpj, c.cnpj ? maskCnpj(c.cnpj) : null, c.city, c.email, c.phone);
    });
    const byName = (a: CompanyRow, b: CompanyRow) => a.trade_name.localeCompare(b.trade_name, "pt-BR", { sensitivity: "base" });
    const byDate = (a: CompanyRow, b: CompanyRow) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id);
    if (sort === "az") return list.sort(byName);
    if (sort === "za") return list.sort((a, b) => byName(b, a));
    if (sort === "oldest") return list.sort(byDate);
    return list.sort((a, b) => byDate(b, a));
  }, [rows, query, status, client, segment, size, region, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const href = (id: string) => `${basePath}/empresas/${id}`;
  const clientsCount = rows.filter((c) => c.is_client).length;

  const resetPage = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const create = async (form: CompanyForm) => {
    setSaving(true);
    setServerError(null);
    try {
      const response = await fetch(`${basePath}/api/crm/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: form }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        setServerError(await companyErrorMessage(response));
        return;
      }
      const data = (await response.json()) as { company: CompanyRow };
      setAdded((a) => [data.company, ...a]);
      invalidateCrmOptions("companies");
      setCreating(false);
      setNotice({ text: `Empresa “${data.company.trade_name}” criada.`, href: href(data.company.id) });
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
            <h1 className="text-[32px] font-semibold leading-[38px] text-text-primary">Empresas</h1>
            <span className="flex h-7 min-w-[38px] items-center justify-center rounded-lg bg-admin-badge px-2.5 text-sm font-semibold text-admin-badge-text">
              {integer.format(rows.length)}
            </span>
          </div>
          <p className="text-sm font-medium leading-5 text-admin-text-description">
            Clientes e prospects da Tecfy. {clientsCount > 0 ? `${integer.format(clientsCount)} ${clientsCount === 1 ? "cliente" : "clientes"}.` : "Viram clientes quando um produto é atribuído."}
          </p>
        </div>
        <Button
          icon={FaPlus}
          onClick={() => {
            setServerError(null);
            setCreating(true);
          }}
        >
          Criar empresa
        </Button>
      </header>

      <section aria-label="Empresas" className="flex flex-col gap-6">
        <div className="flex flex-col gap-[18px]">
          <div className="flex gap-3">
            <SearchInput value={query} onChange={resetPage(setQuery)} placeholder="Buscar por nome, razão social, CNPJ, cidade, e-mail ou telefone" />
            <ReloadButton onClick={() => startReload(() => router.refresh())} reloading={reloading} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-6 xl:gap-4">
            <FilterSelect label="Status" value={status} options={entityStatuses.options} allLabel="Todos" onChange={resetPage(setStatus)} />
            <FilterSelect label="Cliente" value={client} options={clientOptions} allLabel="Clientes e prospects" onChange={resetPage(setClient)} />
            <FilterSelect label="Segmento" value={segment} options={companySegments.options} allLabel="Todos" onChange={resetPage(setSegment)} />
            <FilterSelect label="Porte" value={size} options={companySizes.options} allLabel="Todos" onChange={resetPage(setSize)} />
            <FilterSelect label="Estado" value={region} options={companyRegions.options} allLabel="Todos" onChange={resetPage(setRegion)} />
            <FilterSelect label="Ordenar por" value={sort} options={sortOptions} onChange={(v) => setSort(v as Sort)} />
          </div>
        </div>

        {truncated && (
          <p role="status" className="rounded-lg bg-admin-qual-hot px-4 py-3 text-sm font-medium text-admin-qual-hot-text">
            Mostrando as {integer.format(rows.length)} empresas mais recentes.
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-admin-success/10 px-4 py-3 text-sm font-medium text-admin-success">
            {notice.text}{" "}
            <Link href={notice.href} className="font-semibold underline">
              Abrir empresa
            </Link>
          </p>
        )}

        <div className="overflow-hidden rounded-xl bg-admin-table outline outline-1 -outline-offset-1 outline-admin-table-border">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <p className="text-base font-semibold text-text-primary">Nenhuma empresa ainda</p>
              <p className="text-sm text-admin-text-description">Elas aparecem aqui quando você cria um lead com empresa ou em “Criar empresa”.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <p className="text-sm text-admin-text-description">Nenhuma empresa encontrada com essa busca e filtros.</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setStatus("");
                  setClient("");
                  setSegment("");
                  setSize("");
                  setRegion("");
                  setPage(1);
                }}
              >
                Limpar busca e filtros
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead className="bg-admin-table-head">
                    <tr className="text-left text-xs font-medium leading-[18px] text-admin-table-head-text">
                      <th scope="col" className="px-3 py-[13px] pl-6 font-medium">Empresa / segmento</th>
                      <th scope="col" className="px-3 py-[13px] font-medium">E-mail / telefone</th>
                      <th scope="col" className="px-3 py-[13px] font-medium">Cidade / localização</th>
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
                        <td className="max-w-[300px] px-3 pl-6">
                          <div className="flex min-w-0 items-center gap-2">
                            <Link href={href(c.id)} className="truncate text-sm font-semibold leading-5 text-text-primary hover:underline">
                              {c.trade_name}
                            </Link>
                            <ClientBadge isClient={c.is_client} compact />
                          </div>
                          <p className="mt-[3px] truncate text-xs font-medium leading-[18px] text-admin-table-subtext">
                            {c.segment ? companySegments.label(c.segment) : "Segmento não informado"}
                          </p>
                        </td>
                        <td className="max-w-[260px] px-3">
                          <p className="truncate text-[13px] font-medium leading-5 text-text-primary">{c.email ?? "—"}</p>
                          <p className="mt-[2px] truncate text-xs font-medium leading-[18px] text-admin-table-subtext">{c.phone ? formatPhone(c.phone) : "—"}</p>
                        </td>
                        <td className="max-w-[220px] truncate px-3 text-[13px] font-medium text-admin-table-date">{locationOf(c.city, c.region)}</td>
                        <td className="px-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-3 pr-6 text-center">
                          <OpenLink href={href(c.id)} label={`Abrir ${c.trade_name}`} />
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
                onPerPage={(sizeValue) => {
                  setPerPage(sizeValue);
                  setPage(1);
                }}
                noun={{ one: "empresa", many: "empresas" }}
              />
            </>
          )}
        </div>
      </section>

      {creating && (
        <CreateCompanyModal mode="create" initial={emptyCompanyForm()} busy={saving} serverError={serverError} onClose={() => setCreating(false)} onSubmit={create} />
      )}
    </div>
  );
}
