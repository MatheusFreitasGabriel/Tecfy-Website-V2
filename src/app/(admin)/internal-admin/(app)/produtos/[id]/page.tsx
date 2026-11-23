import { notFound, redirect } from "next/navigation";
import ProductDetailView from "@/app/components/admin/products/ProductDetailView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedProductDetail, getCachedSiteState } from "@/lib/admin/crm/cache";

/** Página do produto: análise, contratos, promoções, detalhes, histórico e prévia no site. */
export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const basePath = getAdminBasePath() ?? "";
  const [{ id }, { aba }] = await Promise.all([params, searchParams]);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const data = Promise.all([getCachedProductDetail(id), getCachedSiteState()]);
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const [product, site] = await data;
  if (!product) notFound();
  const publishedPlan = site.published?.find((p) => p.id === id) ?? null;
  // eslint-disable-next-line react-hooks/purity -- horário da renderização (base para promoções/prévia)
  const renderedAt = Date.now();

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <ProductDetailView basePath={basePath} product={product} publishedPlan={publishedPlan} renderedAt={renderedAt} initialTab={aba ?? null} />
    </div>
  );
}
