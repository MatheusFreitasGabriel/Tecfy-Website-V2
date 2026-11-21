import { redirect } from "next/navigation";
import ProductsView from "@/app/components/admin/products/ProductsView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedProducts } from "@/lib/admin/crm/cache";

/** Tela Produtos: indicadores + catálogo em cards (com os números de cada produto). */
export default async function ProdutosPage() {
  const basePath = getAdminBasePath() ?? "";
  // Dados carregam junto com a checagem de sessão; sem sessão, são descartados.
  const data = getCachedProducts();
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const { products, totals } = await data;

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <ProductsView basePath={basePath} products={products} totals={totals} />
    </div>
  );
}
