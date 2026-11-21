import { notFound, redirect } from "next/navigation";
import ProductDetailView from "@/app/components/admin/products/ProductDetailView";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedProductDetail } from "@/lib/admin/crm/cache";

/** Página do produto: números, contratos (cancelamento), detalhes e histórico. */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const basePath = getAdminBasePath() ?? "";
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const data = getCachedProductDetail(id);
  data.catch(() => undefined);
  const session = await getAdminSession();
  if (!session) redirect(`${basePath}/login`);

  const product = await data;
  if (!product) notFound();

  return (
    <div className="flex min-h-screen w-full flex-col p-8">
      <ProductDetailView basePath={basePath} product={product} />
    </div>
  );
}
