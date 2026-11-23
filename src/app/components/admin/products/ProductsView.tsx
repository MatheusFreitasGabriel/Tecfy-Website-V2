"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { FaBoxOpen, FaChevronDown, FaCircleCheck, FaClockRotateLeft, FaCloudArrowUp, FaLaptopCode, FaMagnifyingGlass, FaPlus, FaRotateLeft, FaTriangleExclamation } from "react-icons/fa6";
import { fallbackPlans } from "@/app/components/public/home/plans/PlansCardsData";
import { useClock } from "@/app/components/public/home/plans/useClock";
import type { ProductRow, ProductStats, SitePublicationRow, SiteState } from "@/lib/admin/crm/types";
import { buildSitePlans, diffSitePlans, type SiteDiff } from "@/lib/site/plans";
import PageHeader from "../PageHeader";
import KpiCard from "../dashboard/KpiCard";
import Button from "../form/Button";
import ConfirmDialog from "../form/ConfirmDialog";
import { callApi } from "../deal-detail/dealApi";
import { formatDateTime } from "../leads/leadVisuals";
import PriceChangeModal from "./PriceChangeModal";
import FilterTabs from "../shared/FilterTabs";
import ProductCard from "./ProductCard";
import ProductFormModal from "./ProductFormModal";
import PromotionModal from "./PromotionModal";
import SitePreview from "./SitePreview";
import { brl, integer, percent, promoState } from "./productVisuals";

interface ProductsViewProps {
  basePath: string;
  products: ProductRow[];
  totals: ProductStats;
  site: SiteState;
  renderedAt: number;
}

type StatusFilter = "ativos" | "inativos" | "todos" | "no_site" | "promocao";
type Sort = "catalogo" | "faturamento" | "clientes" | "nome";
type Tab = "catalogo" | "previa" | "publicacoes";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const diffLine = (d: SiteDiff) => (d.kind === "added" ? "entra no site" : d.kind === "removed" ? "sai do site" : d.fields.join(", "));

/** Tela Produtos: indicadores, catálogo, prévia do site e publicações. */
export default function ProductsView({ basePath, products, totals, site, renderedAt }: ProductsViewProps) {
  const router = useRouter();
  const now = useClock(renderedAt);
  const [refreshing, startRefresh] = useTransition();
  const [tab, setTab] = useState<Tab>("catalogo");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ativos");
  const [sort, setSort] = useState<Sort>("catalogo");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [promoting, setPromoting] = useState<ProductRow | null>(null);
  const [repricing, setRepricing] = useState<ProductRow | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [restoring, setRestoring] = useState<SitePublicationRow | null>(null);
  const [previewMode, setPreviewMode] = useState<"rascunho" | "publicado">("rascunho");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const duplicateKey = useRef<Record<string, string>>({});

  const active = products.filter((p) => p.active);
  const onSite = active.filter((p) => p.site_visible);
  const promos = products.map((p) => promoState(p, now)).filter((x) => x !== null);
  const activePromos = promos.filter((x) => x.status === "active").length;
  const withGoal = products.filter((p) => p.active && p.monthly_goal);
  const goalSum = withGoal.reduce((s, p) => s + (p.monthly_goal ?? 0), 0);
  const goalMrr = withGoal.reduce((s, p) => s + p.stats.mrr, 0);
  const ticket = totals.active_contracts ? totals.mrr / totals.active_contracts : 0;
  const catalogOrder = useMemo(() => products.map((p) => p.id), [products]);

  const draftPlans = useMemo(() => buildSitePlans(products), [products]);
  const published = site.published;
  const diff = useMemo(() => (published ? diffSitePlans(draftPlans, published, now) : null), [draftPlans, published, now]);
  const pending = diff ? diff.diffs.length + (diff.orderChanged ? 1 : 0) : null;

  const visible = useMemo(() => {
    const q = fold(query.trim());
    const list = products
      .filter((p) =>
        status === "todos" ? true : status === "ativos" ? p.active : status === "inativos" ? !p.active : status === "no_site" ? p.active && p.site_visible : promoState(p, now) !== null,
      )
      .filter((p) => !q || fold(`${p.name} ${p.description ?? ""} ${p.features.join(" ")}`).includes(q));
    if (sort === "faturamento") return [...list].sort((a, b) => b.stats.mrr - a.stats.mrr || b.stats.year_revenue - a.stats.year_revenue);
    if (sort === "clientes") return [...list].sort((a, b) => b.stats.active_contracts - a.stats.active_contracts);
    if (sort === "nome") return [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return list;
  }, [products, query, status, sort, now]);

  const refresh = (text?: string) => {
    if (text) setNotice({ tone: "success", text });
    startRefresh(() => router.refresh());
  };
  const fail = (code: number) => setNotice({ tone: "error", text: code === 401 ? "Sua sessão expirou. Entre de novo no painel." : code === 0 ? "Sem conexão. Tente de novo." : "Não foi possível concluir. Tente de novo." });

  const patch = async (product: ProductRow, body: Record<string, unknown>, success: string) => {
    setBusyId(product.id);
    setNotice(null);
    try {
      const { ok, status: code } = await callApi(`${basePath}/api/crm/products/${product.id}`, "PATCH", body);
      if (ok) refresh(success);
      else fail(code);
    } catch {
      fail(0);
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (product: ProductRow) => {
    setBusyId(product.id);
    setNotice(null);
    duplicateKey.current[product.id] ??= crypto.randomUUID();
    try {
      const { ok, status: code } = await callApi(`${basePath}/api/crm/products`, "POST", { request_id: duplicateKey.current[product.id], duplicate_of: product.id });
      if (ok) {
        delete duplicateKey.current[product.id];
        setStatus("todos");
        refresh(`Cópia de "${product.name}" criada (desativada e fora do site). Edite e ative quando quiser.`);
      } else fail(code);
    } catch {
      fail(0);
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
      if (ok) refresh(`"${product.name}" foi excluído${published?.some((x) => x.id === product.id) ? " e saiu do site" : ""}.`);
      else setNotice({ tone: "error", text: data.error === "product_in_use" ? "Este produto já tem vendas: desative em vez de excluir." : "Não foi possível excluir. Tente de novo." });
    } catch {
      fail(0);
    } finally {
      setBusyId(null);
    }
  };

  const siteAction = async (body: Record<string, unknown>, success: string) => {
    setBusyId("site");
    setNotice(null);
    try {
      const { ok, status: code } = await callApi(`${basePath}/api/crm/site`, "POST", body);
      setPublishing(false);
      setRestoring(null);
      if (ok) refresh(success);
      else fail(code);
    } catch {
      fail(0);
    } finally {
      setBusyId(null);
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "catalogo", label: "Catálogo", count: products.length },
    { id: "previa", label: "Prévia do site" },
    { id: "publicacoes", label: "Publicações", count: site.publications.length },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <PageHeader icon={FaLaptopCode} section="Produtos" title="Catálogo de produtos" />
        <Button icon={FaPlus} onClick={() => setEditing("new")}>
          Novo produto
        </Button>
      </div>

      {/* Situação do site */}
      <section
        aria-label="Site"
        className={`flex flex-col gap-4 rounded-2xl p-5 outline outline-1 -outline-offset-1 lg:flex-row lg:items-center lg:justify-between ${
          pending === 0 ? "bg-background-kpi outline-admin-card-border" : "bg-admin-tip/40 outline-admin-accent/40"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {pending === 0 ? (
            <FaCircleCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-admin-success" />
          ) : (
            <FaTriangleExclamation aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-admin-accent" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {pending === null
                ? "O site ainda mostra os planos fixos do código"
                : pending === 0
                  ? "O site está igual ao catálogo"
                  : `${pending} ${pending === 1 ? "alteração" : "alterações"} ainda não ${pending === 1 ? "publicada" : "publicadas"} no site`}
            </p>
            <p className="mt-0.5 text-[13px] font-medium leading-5 text-admin-text-description">
              {pending === null ? (
                <>
                  Enquanto você não publicar, a landing mostra os planos fixos do código — editar, excluir ou desativar aqui ainda não muda o site. Marque os produtos com &quot;Mostrar no site&quot; e
                  publique: a partir daí o site segue o painel. {onSite.length} produto(s) marcado(s).
                </>
              ) : pending === 0 ? (
                <>
                  Publicado {formatDateTime(site.published_at)}
                  {site.published_by_name ? ` por ${site.published_by_name}` : ""}. Promoções e reajustes vão pro ar sozinhos.
                </>
              ) : (
                [...diff!.diffs.slice(0, 4).map((d) => `${d.name}: ${diffLine(d)}`), diff!.orderChanged ? "ordem dos planos" : null, diff!.diffs.length > 4 ? `+${diff!.diffs.length - 4}` : null]
                  .filter(Boolean)
                  .join(" · ")
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-3">
          <Button variant="secondary" onClick={() => setTab("previa")}>
            Ver prévia
          </Button>
          <Button icon={FaCloudArrowUp} onClick={() => setPublishing(true)} disabled={draftPlans.length === 0 || pending === 0 || busyId === "site"}>
            Publicar no site
          </Button>
        </div>
      </section>

      <section aria-label="Indicadores" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Produtos ativos" value={integer.format(active.length)} hint={`${onSite.length} no site${products.length > active.length ? ` · ${products.length - active.length} inativo(s)` : ""}`} />
        <KpiCard label="Contratos ativos" value={integer.format(totals.active_contracts)} hint={totals.cancelled ? `${totals.cancelled} cancelado(s)` : undefined} />
        <KpiCard label="Faturamento mensal" value={brl.format(totals.mrr)} hint={`ticket médio ${brl.format(ticket)}`} />
        <KpiCard label="Receita no ano" value={brl.format(totals.year_revenue)} hint="mensalidades + implantação + únicos" />
        <KpiCard label="Promoções ativas" value={integer.format(activePromos)} hint={promos.length > activePromos ? `${promos.length - activePromos} agendada(s)` : "lance pelo menu ⋮ do produto"} />
        <KpiCard label="Meta do mês" value={goalSum ? percent.format(goalMrr / goalSum) : "—"} hint={goalSum ? `${brl.format(goalMrr)} de ${brl.format(goalSum)}` : "defina metas no cadastro"} />
      </section>

      {notice && (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${notice.tone === "success" ? "bg-admin-qual-sure/50 text-admin-qual-sure-text" : "bg-admin-deal-lost/50 text-admin-deal-lost-text"}`}>
          {notice.text}
        </p>
      )}

      <div role="tablist" aria-label="Seções" className="flex gap-1 border-b border-admin-table-border">
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
            {t.id === "previa" && pending ? <span aria-label="com alterações" className="h-2 w-2 rounded-full bg-admin-accent" /> : null}
          </button>
        ))}
      </div>

      {tab === "catalogo" && (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            {/* Filtro no estilo do seletor de planos do site */}
            <FilterTabs
              label="Mostrar"
              value={status}
              onChange={setStatus}
              options={[
                { value: "ativos", label: "Ativos", count: active.length },
                { value: "no_site", label: "No site", count: onSite.length },
                { value: "promocao", label: "Em promoção", count: promos.length },
                { value: "inativos", label: "Inativos", count: products.length - active.length },
                { value: "todos", label: "Todos", count: products.length },
              ]}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block w-full sm:w-[320px]">
                <span className="sr-only">Buscar produto</span>
                <FaMagnifyingGlass aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar produto ou item incluso..."
                  className="h-11 w-full border border-border-secondary bg-background-secondary pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/60"
                />
              </label>
              <label className="relative flex h-11 items-center border border-border-secondary bg-background-secondary">
                <span className="pl-4 text-[11px] font-semibold uppercase tracking-wide text-white/40">Ordem</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-full cursor-pointer appearance-none bg-transparent pl-2 pr-10 text-sm font-medium text-white outline-none [color-scheme:dark]"
                >
                  <option value="catalogo">Catálogo (= site)</option>
                  <option value="faturamento">Faturamento</option>
                  <option value="clientes">Clientes ativos</option>
                  <option value="nome">Nome</option>
                </select>
                <FaChevronDown aria-hidden className="pointer-events-none absolute right-4 h-3 w-3 text-white/40" />
              </label>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-4 border border-dashed border-border-secondary px-6 py-16 text-center">
              <FaBoxOpen aria-hidden className="h-10 w-10 text-white/40" />
              <div>
                <p className="text-lg font-semibold text-text-primary">Nenhum produto cadastrado</p>
                <p className="text-sm font-medium text-admin-text-description">Cadastre o que você vende para usar em &quot;Marcar como vendida&quot;, acompanhar o faturamento e montar a seção de planos do site.</p>
              </div>
              <Button icon={FaPlus} onClick={() => setEditing("new")}>
                Cadastrar o primeiro produto
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <p className="border border-border-primary bg-background-secondary px-6 py-12 text-center text-sm text-white/50">Nenhum produto com esses filtros.</p>
          ) : (
            <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3 ${refreshing ? "opacity-80" : ""}`}>
              {visible.map((p) => {
                const index = catalogOrder.indexOf(p.id);
                const href = `${basePath}/produtos/${p.id}`;
                return (
                  <ProductCard
                    key={p.id}
                    product={p}
                    now={now}
                    share={totals.mrr ? p.stats.mrr / totals.mrr : 0}
                    href={href}
                    canMoveUp={sort === "catalogo" && index > 0}
                    canMoveDown={sort === "catalogo" && index < catalogOrder.length - 1}
                    busy={busyId === p.id}
                    onEdit={() => setEditing(p)}
                    onToggleActive={() =>
                      void patch(
                        p,
                        { active: !p.active },
                        p.active
                          ? `"${p.name}" foi desativado${published?.some((x) => x.id === p.id) ? " e saiu do site" : ""}.`
                          : `"${p.name}" foi ativado.${p.site_visible && published ? " Publique para ele voltar ao site." : ""}`,
                      )
                    }
                    onMove={(direction) => void patch(p, { move: direction }, "Ordem do catálogo atualizada.")}
                    onDelete={() => setDeleting(p)}
                    onDuplicate={() => void duplicate(p)}
                    onPromotion={() => (promoState(p, now) ? router.push(`${href}?aba=promocoes`) : setPromoting(p))}
                    onPriceChange={() => setRepricing(p)}
                  />
                );
              })}
              {/* Atalho para criar, no fim da grade */}
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="group flex min-h-[396px] flex-col items-center justify-center gap-3 border border-dashed border-border-secondary text-white/45 transition-colors hover:border-white/60 hover:text-white"
              >
                <span className="flex h-12 w-12 items-center justify-center border border-current transition-transform group-hover:scale-105">
                  <FaPlus aria-hidden className="h-4 w-4" />
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.08em]">Novo produto</span>
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "previa" && (
        <SitePreview
          plans={previewMode === "rascunho" ? draftPlans : (published ?? fallbackPlans)}
          renderedAt={renderedAt}
          toolbar={
            <>
              <div role="group" aria-label="Versão" className="flex h-10 rounded-lg bg-admin-input p-1 outline outline-1 -outline-offset-1 outline-admin-input-border">
                {(["rascunho", "publicado"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={previewMode === m}
                    onClick={() => setPreviewMode(m)}
                    className={`rounded-md px-3 text-xs font-semibold transition-colors disabled:opacity-40 ${previewMode === m ? "bg-admin-card text-text-primary" : "text-admin-text-hint hover:text-text-primary"}`}
                  >
                    {m === "rascunho" ? "Como vai ficar" : "No ar agora"}
                  </button>
                ))}
              </div>
              <span className="text-xs font-medium text-admin-text-hint">
                {previewMode === "rascunho" ? "Catálogo atual (o que \"Publicar\" coloca no ar)." : !published ? "Planos fixos do código (o site nunca foi publicado pelo painel)." : `Publicado ${formatDateTime(site.published_at)}.`}
              </span>
            </>
          }
        />
      )}

      {tab === "publicacoes" && (
        <section className="flex flex-col overflow-hidden rounded-2xl bg-background-kpi outline outline-1 -outline-offset-1 outline-admin-card-border">
          {site.publications.length === 0 ? (
            <p className="flex items-center gap-2 p-6 text-sm font-medium text-admin-text-description">
              <FaClockRotateLeft aria-hidden className="h-3.5 w-3.5" /> Nenhuma publicação ainda. Cada &quot;Publicar no site&quot; fica registrado aqui e pode ser restaurado.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-admin-divider">
              {site.publications.map((pub, i) => (
                <li key={pub.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                      {pub.title}
                      {i === 0 && <span className="rounded-md bg-admin-qual-sure px-2 py-0.5 text-[11px] font-semibold uppercase text-admin-qual-sure-text">No ar</span>}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-admin-text-hint">
                      {formatDateTime(pub.published_at)}
                      {pub.published_by_name ? ` · ${pub.published_by_name}` : ""} · {pub.plan_count} plano(s)
                    </p>
                    {pub.summary.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-0.5">
                        {pub.summary.slice(0, 6).map((line) => (
                          <li key={line} className="text-[13px] font-medium text-admin-text-description">
                            • {line}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {i > 0 && (
                    <Button variant="secondary" icon={FaRotateLeft} onClick={() => setRestoring(pub)} disabled={busyId === "site"}>
                      Restaurar
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {editing && (
        <ProductFormModal
          basePath={basePath}
          renderedAt={renderedAt}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const isNew = editing === "new";
            setEditing(null);
            refresh(isNew ? "Produto criado." : "Produto atualizado. Se ele está no site, publique para a mudança ir pro ar.");
          }}
        />
      )}

      {promoting && (
        <PromotionModal
          basePath={basePath}
          product={promoting}
          now={now}
          onClose={() => setPromoting(null)}
          onDone={(scheduled) => {
            const name = promoting.name;
            setPromoting(null);
            refresh(scheduled ? `Promoção agendada para "${name}".` : `Promoção no ar para "${name}".`);
          }}
        />
      )}

      {repricing && (
        <PriceChangeModal
          basePath={basePath}
          product={repricing}
          now={now}
          onClose={() => setRepricing(null)}
          onDone={() => {
            setRepricing(null);
            refresh("Reajuste agendado.");
          }}
        />
      )}

      {publishing && (
        <ConfirmDialog
          title="Publicar no site?"
          confirmLabel="Publicar"
          busy={busyId === "site"}
          onCancel={() => setPublishing(false)}
          onConfirm={() => void siteAction({ action: "publish" }, "Publicado! A landing já mostra o catálogo novo.")}
          message={
            <span className="flex flex-col gap-2">
              <span>
                A seção de planos do site passa a mostrar <strong className="text-text-primary">{draftPlans.length} plano(s)</strong>:{" "}
                {draftPlans.map((p) => p.name).join(", ")}.
              </span>
              {diff && diff.diffs.length > 0 && (
                <span className="flex flex-col gap-0.5">
                  {diff.diffs.map((d) => (
                    <span key={d.id}>
                      • <strong className="text-text-primary">{d.name}</strong>: {diffLine(d)}
                    </span>
                  ))}
                  {diff.orderChanged && <span>• Ordem dos planos</span>}
                </span>
              )}
              <span>Dá para voltar atrás em &quot;Publicações&quot;.</span>
            </span>
          }
        />
      )}

      {restoring && (
        <ConfirmDialog
          title="Restaurar esta versão?"
          confirmLabel="Restaurar"
          busy={busyId === "site"}
          onCancel={() => setRestoring(null)}
          onConfirm={() => void siteAction({ action: "restore", publication_id: restoring.id }, "Versão restaurada no site. O catálogo não mudou: as diferenças aparecem como pendentes.")}
          message={
            <>
              O site volta para <strong className="text-text-primary">{restoring.plan_count} plano(s)</strong> publicados em {formatDateTime(restoring.published_at)}. O cadastro dos produtos não muda; promoções e
              reajustes atuais continuam valendo.
            </>
          }
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
              <strong className="text-text-primary">{deleting.name}</strong> nunca foi vendido, então pode ser excluído de vez.{" "}
              {published?.some((x) => x.id === deleting.id)
                ? "Ele também sai do site na hora."
                : !published
                  ? "Atenção: o site ainda mostra os planos fixos do código; o painel só controla o site depois da 1ª publicação."
                  : ""}{" "}
              Se quiser só tirá-lo de &quot;Marcar como vendida&quot;, use &quot;Desativar&quot;.
            </>
          }
        />
      )}
    </div>
  );
}
