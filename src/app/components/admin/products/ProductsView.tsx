"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FaBoxOpen, FaChevronDown, FaLaptopCode, FaMagnifyingGlass, FaPlus } from "react-icons/fa6";
import type { ProductRow, ProductStats } from "@/lib/admin/crm/types";
import PageHeader from "../PageHeader";
import KpiCard from "../dashboard/KpiCard";
import Button from "../form/Button";
import ConfirmDialog from "../form/ConfirmDialog";
import { inputClass } from "../form/Field";
import { callApi } from "../deal-detail/dealApi";
import ProductCard from "./ProductCard";
import ProductFormModal from "./ProductFormModal";
import { brl, integer } from "./productVisuals";

interface ProductsViewProps {
  basePath: string;
  products: ProductRow[];
  totals: ProductStats;
}

type StatusFilter = "ativos" | "inativos" | "todos";
type Sort = "catalogo" | "faturamento" | "clientes" | "nome";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function SelectControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium leading-[18px] text-admin-text-description">{label}</span>
      <span className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value as T)} className={`${inputClass} h-11 min-w-[170px] cursor-pointer appearance-none pr-10`}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <FaChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-admin-text-hint" />
      </span>
    </label>
  );
}

/** Tela Produtos: indicadores, filtros e a grade de cards do catálogo. */
export default function ProductsView({ basePath, products, totals }: ProductsViewProps) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ativos");
  const [sort, setSort] = useState<Sort>("catalogo");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const active = products.filter((p) => p.active);
  const ticket = totals.active_contracts ? totals.mrr / totals.active_contracts : 0;
  const catalogOrder = useMemo(() => products.map((p) => p.id), [products]);

  const visible = useMemo(() => {
    const q = fold(query.trim());
    const list = products.filter((p) => (status === "todos" ? true : status === "ativos" ? p.active : !p.active)).filter((p) => !q || fold(`${p.name} ${p.description ?? ""} ${p.features.join(" ")}`).includes(q));
    if (sort === "faturamento") return [...list].sort((a, b) => b.stats.mrr - a.stats.mrr || b.stats.year_revenue - a.stats.year_revenue);
    if (sort === "clientes") return [...list].sort((a, b) => b.stats.active_contracts - a.stats.active_contracts);
    if (sort === "nome") return [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return list;
  }, [products, query, status, sort]);

  const refresh = (text?: string) => {
    if (text) setNotice({ tone: "success", text });
    startRefresh(() => router.refresh());
  };

  const patch = async (product: ProductRow, body: Record<string, unknown>, success: string) => {
    setBusyId(product.id);
    setNotice(null);
    try {
      const { ok, status: code } = await callApi(`${basePath}/api/crm/products/${product.id}`, "PATCH", body);
      if (ok) refresh(success);
      else setNotice({ tone: "error", text: code === 401 ? "Sua sessão expirou. Entre de novo no painel." : "Não foi possível concluir. Tente de novo." });
    } catch {
      setNotice({ tone: "error", text: "Sem conexão. Tente de novo." });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const product = deleting;
    setBusyId(product.id);
    try {
      const { ok, data } = await callApi(`${basePath}/api/crm/products/${product.id}`, "DELETE", {});
      setDeleting(null);
      if (ok) refresh(`"${product.name}" foi excluído.`);
      else setNotice({ tone: "error", text: data.error === "product_in_use" ? "Este produto já tem vendas: desative em vez de excluir." : "Não foi possível excluir. Tente de novo." });
    } catch {
      setNotice({ tone: "error", text: "Sem conexão. Tente de novo." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <PageHeader icon={FaLaptopCode} section="Produtos" title="Catálogo de produtos" />
        <Button icon={FaPlus} onClick={() => setEditing("new")}>
          Novo produto
        </Button>
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Produtos ativos" value={integer.format(active.length)} hint={products.length > active.length ? `${products.length - active.length} inativo(s)` : undefined} />
        <KpiCard label="Contratos ativos" value={integer.format(totals.active_contracts)} hint={totals.cancelled ? `${totals.cancelled} cancelado(s)` : undefined} />
        <KpiCard label="Faturamento mensal" value={brl.format(totals.mrr)} />
        <KpiCard label="Ticket médio" value={brl.format(ticket)} hint="por contrato ativo/mês" />
        <KpiCard label="Receita no ano" value={brl.format(totals.year_revenue)} hint="mensalidades + implantação + únicos" />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="relative block w-full lg:max-w-[380px]">
            <span className="sr-only">Buscar produto</span>
            <FaMagnifyingGlass aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-text-hint" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, descrição ou item incluso..." className={`${inputClass} h-11 pl-11`} />
          </label>
          <div className="flex flex-wrap gap-3">
            <SelectControl
              label="Situação"
              value={status}
              onChange={setStatus}
              options={[
                { value: "ativos", label: `Ativos (${active.length})` },
                { value: "inativos", label: `Inativos (${products.length - active.length})` },
                { value: "todos", label: `Todos (${products.length})` },
              ]}
            />
            <SelectControl
              label="Ordenar por"
              value={sort}
              onChange={setSort}
              options={[
                { value: "catalogo", label: "Ordem do catálogo" },
                { value: "faturamento", label: "Faturamento" },
                { value: "clientes", label: "Clientes ativos" },
                { value: "nome", label: "Nome" },
              ]}
            />
          </div>
        </div>

        {notice && (
          <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${notice.tone === "success" ? "bg-admin-qual-sure/50 text-admin-qual-sure-text" : "bg-admin-deal-lost/50 text-admin-deal-lost-text"}`}>
            {notice.text}
          </p>
        )}

        {products.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-admin-card-border px-6 py-16 text-center">
            <FaBoxOpen aria-hidden className="h-10 w-10 text-admin-text-hint" />
            <div>
              <p className="text-lg font-semibold text-text-primary">Nenhum produto cadastrado</p>
              <p className="text-sm font-medium text-admin-text-description">Cadastre o que você vende para usar em &quot;Marcar como vendida&quot; e acompanhar o faturamento por produto.</p>
            </div>
            <Button icon={FaPlus} onClick={() => setEditing("new")}>
              Cadastrar o primeiro produto
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl bg-background-kpi px-6 py-12 text-center text-sm font-medium text-admin-text-description">Nenhum produto com esses filtros.</p>
        ) : (
          <div className={`grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3 ${refreshing ? "opacity-80" : ""}`}>
            {visible.map((p) => {
              const index = catalogOrder.indexOf(p.id);
              return (
                <ProductCard
                  key={p.id}
                  product={p}
                  share={totals.mrr ? p.stats.mrr / totals.mrr : 0}
                  href={`${basePath}/produtos/${p.id}`}
                  canMoveUp={sort === "catalogo" && index > 0}
                  canMoveDown={sort === "catalogo" && index < catalogOrder.length - 1}
                  busy={busyId === p.id}
                  onEdit={() => setEditing(p)}
                  onToggleActive={() => void patch(p, { active: !p.active }, p.active ? `"${p.name}" foi desativado.` : `"${p.name}" foi ativado.`)}
                  onMove={(direction) => void patch(p, { move: direction }, "Ordem do catálogo atualizada.")}
                  onDelete={() => setDeleting(p)}
                />
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <ProductFormModal
          basePath={basePath}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const isNew = editing === "new";
            setEditing(null);
            refresh(isNew ? "Produto criado." : "Produto atualizado.");
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir produto?"
          tone="danger"
          confirmLabel="Excluir"
          busy={busyId === deleting.id}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
          message={
            <>
              <strong className="text-text-primary">{deleting.name}</strong> nunca foi vendido, então pode ser excluído de vez. Se quiser só tirá-lo de &quot;Marcar como vendida&quot;, use
              &quot;Desativar&quot;.
            </>
          }
        />
      )}
    </div>
  );
}
