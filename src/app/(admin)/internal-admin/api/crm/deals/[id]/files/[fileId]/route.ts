import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { completeUpload, downloadUrl } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { actorOf, crmResponses, guardRead } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; fileId: string }> };

/** Passo 2 do envio: o servidor confere o arquivo no Storage e o registra. Resposta: 200 { file }. */
export async function POST(request: Request, { params }: Context) {
  const { id, fileId } = await params;
  if (!validId(id) || !validId(fileId)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 256);
  if (guard instanceof Response) return guard;
  try {
    const file = await completeUpload(id, fileId, guard.actor);
    invalidateCrm(CRM_TAGS.deals);
    return Response.json({ file });
  } catch (error) {
    return dealDetailErrorResponse(error, "deal upload complete");
  }
}

/** Download: devolve um link de 5 minutos (gerado só com sessão válida) e registra quem baixou. */
export async function GET(request: Request, { params }: Context) {
  const { id, fileId } = await params;
  if (!validId(id) || !validId(fileId)) return crmResponses.notFound();
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  try {
    return Response.json({ url: await downloadUrl(id, fileId, await actorOf(session)) });
  } catch (error) {
    return dealDetailErrorResponse(error, "deal download");
  }
}
