import { redirect } from "next/navigation";
import ProductsView from "@/app/components/admin/products/ProductsView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedProducts, getCachedSiteState } from "@/lib/admin/crm/cache";

/** Tela Produtos: indicadores, catálogo em cards, prévia do site e publicações. */
export default async function ProdutosPage() {
  const basePath = getAdminBasePath() ?? "";
  // Dados carregam junto com a checagem de sessão; sem sessão, são descartados.
  const data = Promise.all([getCachedProducts(), getCachedSiteState()]);
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const [{ products, totals }, site] = await data;
  // eslint-disable-next-line react-hooks/purity -- horário da renderização (base para promoções/prévia)
  const renderedAt = Date.now();

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <ProductsView basePath={basePath} products={products} totals={totals} site={site} renderedAt={renderedAt} />
    </div>
  );
}
