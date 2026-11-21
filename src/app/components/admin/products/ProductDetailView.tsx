"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FaArrowLeft, FaArrowUpRightFromSquare, FaBan, FaCheck, FaClockRotateLeft, FaEye, FaEyeSlash, FaFileContract, FaPen, FaStar } from "react-icons/fa6";
import { productBillings } from "@/lib/admin/crm/options";
import type { ContractRow, ProductDetail } from "@/lib/admin/crm/types";
import KpiCard from "../dashboard/KpiCard";
import Button from "../form/Button";
import { callApi } from "../deal-detail/dealApi";
import { formatDate, formatDateTime } from "../leads/leadVisuals";
import CancelContractModal from "./CancelContractModal";
import ProductFormModal from "./ProductFormModal";
import { BillingBadge, ProductIconBox, brl, colorVar, integer, money, monthLabel, percent, priceParts } from "./productVisuals";

interface ProductDetailViewProps {
  basePath: string;
  product: ProductDetail;
}

type Tab = "contratos" | "detalhes" | "historico";
type ContractFilter = "ativos" | "cancelados" | "todos";

const monthNow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());

function TermCell({ contract }: { contract: ContractRow }) {
  if (!contract.term_end) return <span className="text-admin-text-hint">—</span>;
  const done = contract.status === "active" && monthNow() > contract.term_end;
  return (
    <span className="flex flex-col">
      <span className="text-text-primary">{monthLabel(contract.term_end)}</span>
      {contract.status === "active" && (
        <span className={`text-[11px] font-semibold ${done ? "text-admin-success" : "text-admin-text-hint"}`}>{done ? "fidelidade cumprida" : "em fidelidade"}</span>
      )}
    </span>
  );
}

/** Página do produto: números, contratos (com cancelamento), detalhes e histórico. */
export default function ProductDetailView({ basePath, product: p }: ProductDetailViewProps) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [tab, setTab] = useState<Tab>("contratos");
  const [filter, setFilter] = useState<ContractFilter>("ativos");
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState<ContractRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const price = priceParts(p);
  const ticket = p.stats.active_contracts ? p.stats.mrr / p.stats.active_contracts : 0;
  const churn = p.stats.total_contracts ? p.stats.cancelled / p.stats.total_contracts : 0;
  const contracts = useMemo(
    () => p.contracts.filter((c) => (filter === "todos" ? true : filter === "ativos" ? c.status === "active" : c.status === "cancelled")),
    [p.contracts, filter],
  );
  const activeCount = p.contracts.filter((c) => c.status === "active").length;

  const refresh = (text: string) => {
    setNotice({ tone: "success", text });
    startRefresh(() => router.refresh());
  };

  const toggleActive = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { ok } = await callApi(`${basePath}/api/crm/products/${p.id}`, "PATCH", { active: !p.active });
      if (ok) refresh(p.active ? "Produto desativado: não aparece mais em \"Marcar como vendida\"." : "Produto ativado.");
      else setNotice({ tone: "error", text: "Não foi possível concluir. Tente de novo." });
    } catch {
      setNotice({ tone: "error", text: "Sem conexão. Tente de novo." });
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "contratos", label: "Contratos", count: p.contracts.length },
    { id: "detalhes", label: "Detalhes" },
    { id: "historico", label: "Histórico", count: p.history.length },
  ];

  return (
    <div className={`flex flex-col gap-8 ${refreshing ? "opacity-90" : ""}`}>
      <Link href={`${basePath}/produtos`} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-admin-text-description hover:text-text-primary">
        <FaArrowLeft aria-hidden className="h-3 w-3" /> Produtos
      </Link>

      {/* Cabeçalho */}
      <header style={colorVar(p.color)} className="relative overflow-hidden rounded-2xl bg-background-kpi p-6 outline outline-1 -outline-offset-1 outline-admin-card-border">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-(--pc)" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <ProductIconBox icon={p.icon} color={p.color} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-[28px] font-semibold leading-9 text-text-primary">{p.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <BillingBadge billing={p.billing} />
                {p.highlight && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-md bg-(--pc)/15 px-2 text-[11px] font-semibold uppercase tracking-wide text-(--pc)">
                    <FaStar aria-hidden className="h-2.5 w-2.5" /> Destaque
                  </span>
                )}
                <span className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide ${p.active ? "bg-admin-qual-sure text-admin-qual-sure-text" : "bg-admin-deal-paused text-admin-deal-paused-text"}`}>
                  {p.active ? "Ativo" : "Inativo"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <div className="sm:text-right">
              <p className="flex items-baseline gap-1.5 sm:justify-end">
                <span className="text-[28px] font-semibold leading-9 text-text-primary">{price.main}</span>
                {price.suffix && <span className="text-sm font-medium text-admin-text-description">{price.suffix}</span>}
              </p>
              {price.extra && <p className="text-xs font-medium text-admin-text-hint">{price.extra}</p>}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" icon={p.active ? FaEyeSlash : FaEye} onClick={() => void toggleActive()} disabled={busy}>
                {p.active ? "Desativar" : "Ativar"}
              </Button>
              <Button icon={FaPen} onClick={() => setEditing(true)}>
                Editar
              </Button>
            </div>
          </div>
        </div>
      </header>

      {notice && (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${notice.tone === "success" ? "bg-admin-qual-sure/50 text-admin-qual-sure-text" : "bg-admin-deal-lost/50 text-admin-deal-lost-text"}`}>
          {notice.text}
        </p>
      )}

      {/* Indicadores */}
      <section aria-label="Indicadores do produto" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {p.billing === "unico" ? (
          <>
            <KpiCard label="Vendas" value={integer.format(p.stats.one_time_sales)} />
            <KpiCard label="Receita no ano" value={brl.format(p.stats.year_revenue)} />
            <KpiCard label="Valor médio" value={brl.format(p.stats.one_time_sales ? p.contracts.reduce((s, c) => s + c.one_time_value, 0) / p.stats.one_time_sales : 0)} />
          </>
        ) : (
          <>
            <KpiCard label="Contratos ativos" value={integer.format(p.stats.active_contracts)} />
            <KpiCard label="Faturamento mensal" value={brl.format(p.stats.mrr)} />
            <KpiCard label="Receita no ano" value={brl.format(p.stats.year_revenue)} />
            <KpiCard label="Ticket médio" value={brl.format(ticket)} hint="por contrato ativo/mês" />
            <KpiCard label="Cancelados" value={integer.format(p.stats.cancelled)} hint={p.stats.total_contracts ? `${percent.format(churn)} dos contratos` : undefined} />
          </>
        )}
      </section>

      {/* Abas */}
      <section className="flex flex-col overflow-hidden rounded-2xl bg-background-kpi outline outline-1 -outline-offset-1 outline-admin-card-border">
        <div role="tablist" aria-label="Seções do produto" className="flex gap-1 border-b border-admin-table-border px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex h-12 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors ${
                tab === t.id ? "border-admin-primary text-text-primary" : "border-transparent text-admin-text-description hover:text-text-primary"
              }`}
            >
              {t.label}
              {t.count !== undefined && <span className="rounded-md bg-admin-badge px-1.5 text-xs text-admin-badge-text">{integer.format(t.count)}</span>}
            </button>
          ))}
        </div>

        {tab === "contratos" && (
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2 p-4">
              {(["ativos", "cancelados", "todos"] as ContractFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={`h-9 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${filter === f ? "bg-admin-tip text-admin-tip-title" : "bg-admin-badge text-admin-text-description hover:text-text-primary"}`}
                >
                  {f === "ativos" ? `Ativos (${activeCount})` : f === "cancelados" ? `Cancelados (${p.contracts.length - activeCount})` : `Todos (${p.contracts.length})`}
                </button>
              ))}
            </div>
            {contracts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 pb-14 pt-8 text-center">
                <FaFileContract aria-hidden className="h-8 w-8 text-admin-text-hint" />
                <p className="text-sm font-medium text-admin-text-description">
                  {p.contracts.length === 0 ? "Nenhuma venda deste produto ainda. Os contratos aparecem aqui quando uma negociação é marcada como vendida." : "Nenhum contrato neste filtro."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left">
                  <thead className="bg-admin-table-head text-xs font-medium leading-[18px] text-admin-table-head-text">
                    <tr>
                      <th className="px-6 py-3 font-medium">Cliente</th>
                      <th className="px-3 py-3 font-medium">Valor</th>
                      <th className="px-3 py-3 font-medium">Implantação</th>
                      <th className="px-3 py-3 font-medium">Assinado em</th>
                      <th className="px-3 py-3 font-medium">Fidelidade até</th>
                      <th className="px-3 py-3 font-medium">Situação</th>
                      <th className="px-6 py-3 font-medium">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c, i) => (
                      <tr key={c.id} className={`border-t border-admin-table-divider text-[13px] font-medium ${i % 2 ? "bg-admin-table-alt" : "bg-admin-table"}`}>
                        <td className="max-w-[280px] px-6 py-3.5">
                          {c.company ? (
                            <Link href={`${basePath}/empresas/${c.company.id}`} className="block truncate text-sm font-semibold text-text-primary hover:underline">
                              {c.company.name}
                            </Link>
                          ) : (
                            <span className="text-admin-text-hint">Sem empresa</span>
                          )}
                          {c.deal && (
                            <Link href={`${basePath}/negociacoes/${c.deal.id}`} className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-admin-accent hover:underline">
                              {c.deal.title} <FaArrowUpRightFromSquare aria-hidden className="h-2.5 w-2.5 shrink-0" />
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-text-primary">{c.billing === "unico" ? `${money(c.one_time_value)} único` : `${money(c.monthly_value)}/mês`}</td>
                        <td className="px-3 py-3.5 text-admin-table-subtext">{c.setup_value ? money(c.setup_value) : "—"}</td>
                        <td className="px-3 py-3.5 text-admin-table-date">{formatDate(c.signed_at)}</td>
                        <td className="px-3 py-3.5">
                          <TermCell contract={c} />
                        </td>
                        <td className="px-3 py-3.5">
                          {c.status === "active" ? (
                            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-admin-qual-sure px-2 text-[11px] font-semibold uppercase text-admin-qual-sure-text">
                              <FaCheck aria-hidden className="h-2.5 w-2.5" /> {c.billing === "unico" ? "Vendido" : "Ativo"}
                            </span>
                          ) : (
                            <span className="flex flex-col gap-0.5">
                              <span className="inline-flex h-6 w-fit items-center rounded-md bg-admin-deal-lost px-2 text-[11px] font-semibold uppercase text-admin-deal-lost-text">Cancelado</span>
                              <span className="text-[11px] text-admin-text-hint" title={c.cancel_reason ?? undefined}>
                                em {formatDate(c.cancelled_at)}
                                {c.cancel_reason ? ` · ${c.cancel_reason.split(" — ")[0]}` : ""}
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          {c.status === "active" && c.billing !== "unico" && (
                            <button
                              type="button"
                              onClick={() => setCancelling(c)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-admin-danger transition-colors hover:bg-admin-deal-lost/50"
                            >
                              <FaBan aria-hidden className="h-3 w-3" /> Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "detalhes" && (
          <div className="grid gap-8 p-6 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-admin-text-hint">Descrição</p>
                <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-admin-text-label">{p.description ?? "Sem descrição."}</p>
              </div>
              <dl className="grid grid-cols-2 gap-4 rounded-xl bg-admin-drawer-card p-4 text-sm">
                <div>
                  <dt className="text-xs font-medium text-admin-drawer-muted">Cobrança</dt>
                  <dd className="font-semibold text-text-primary">{productBillings.label(p.billing)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-admin-drawer-muted">Preço</dt>
                  <dd className="font-semibold text-text-primary">
                    {price.main}
                    {price.suffix && price.suffix !== "pagamento único" ? price.suffix : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-admin-drawer-muted">Implantação</dt>
                  <dd className="font-semibold text-text-primary">{p.setup_fee ? money(p.setup_fee) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-admin-drawer-muted">Fidelidade</dt>
                  <dd className="font-semibold text-text-primary">{p.billing === "unico" ? "—" : p.min_term_months ? `${p.min_term_months} meses` : "Sem fidelidade"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-admin-drawer-muted">Cadastrado em</dt>
                  <dd className="font-semibold text-text-primary">{formatDate(p.created_at)}</dd>
                </div>
              </dl>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-admin-text-hint">Itens inclusos ({p.features.length})</p>
              {p.features.length === 0 ? (
                <p className="mt-2 text-sm font-medium text-admin-text-description">Nenhum item cadastrado.</p>
              ) : (
                <ul style={colorVar(p.color)} className="mt-3 flex flex-col gap-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm font-medium leading-5 text-admin-text-label">
                      <FaCheck aria-hidden className="mt-1 h-3 w-3 shrink-0 text-(--pc)" /> {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "historico" && (
          <div className="p-6">
            {p.history.length === 0 ? (
              <p className="flex items-center gap-2 text-sm font-medium text-admin-text-description">
                <FaClockRotateLeft aria-hidden className="h-3.5 w-3.5" /> Nenhuma alteração registrada desde que a tela de produtos foi criada.
              </p>
            ) : (
              <ol className="flex flex-col">
                {p.history.map((h, i) => (
                  <li key={h.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < p.history.length - 1 && <span aria-hidden className="absolute left-[5px] top-4 h-full w-px bg-admin-divider" />}
                    <span aria-hidden className="mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full bg-admin-accent" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">{h.title}</p>
                      {h.description && <p className="mt-0.5 whitespace-pre-line text-[13px] font-medium leading-5 text-admin-text-description">{h.description}</p>}
                      <p className="mt-1 text-xs font-medium text-admin-text-hint">
                        {formatDateTime(h.created_at)}
                        {h.author_name ? ` · ${h.author_name}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>

      {editing && (
        <ProductFormModal
          basePath={basePath}
          product={p}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh("Produto atualizado.");
          }}
        />
      )}
      {cancelling && (
        <CancelContractModal
          basePath={basePath}
          contract={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
            refresh("Contrato cancelado. O faturamento foi atualizado.");
          }}
        />
      )}
    </div>
  );
}
