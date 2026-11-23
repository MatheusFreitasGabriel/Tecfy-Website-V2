import { CRM_TAGS, invalidateCrm, invalidateSite } from "@/lib/admin/crm/cache";
import { guardedWrite } from "@/lib/admin/crm/dealRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Recarregar dados": expira todo o cache do CRM (e o da seção de planos do site), para a próxima
 * leitura vir direto do Firestore. Útil quando algo mudou fora do painel (console do Firebase,
 * scripts). Telas de detalhe têm tags próprias (por id), mas também carregam as tags gerais abaixo.
 * Resposta: 200 { ok: true }.
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request, 256);
  if (guard instanceof Response) return guard;
  invalidateCrm(...Object.values(CRM_TAGS));
  invalidateSite();
  return Response.json({ ok: true });
}
