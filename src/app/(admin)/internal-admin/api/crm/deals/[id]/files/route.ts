import { createUploadUrl, listDealFiles } from "@/lib/admin/crm/dealDetail";
import { dealDetailErrorResponse, guardedWrite, validId } from "@/lib/admin/crm/dealRoutes";
import { parseUploadRequest } from "@/lib/admin/crm/dealValidation";
import { DEAL_FILE_MAX_BYTES, DEAL_FILE_TYPES } from "@/lib/admin/crm/options";
import { crmResponses, guardRead } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Arquivos/propostas prontos da negociação. */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  try {
    return Response.json({ files: await listDealFiles(id) });
  } catch (error) {
    return dealDetailErrorResponse(error, "deal files");
  }
}

/**
 * Passo 1 do envio: `{ name, size, mime, kind: "proposta" | "arquivo" }` → URL assinada de upload
 * (5 min; só PDF/DOCX/PPTX/XLSX até 25 MB). Resposta: 201 { file_id, url, headers } · 400 · 503.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request, 2048);
  if (guard instanceof Response) return guard;
  const parsed = parseUploadRequest(guard.body, DEAL_FILE_TYPES, DEAL_FILE_MAX_BYTES);
  if (!parsed) return Response.json({ error: "invalid_file", reason: "type_or_size" }, { status: 400 });
  try {
    return Response.json(await createUploadUrl(id, parsed, guard.actor), { status: 201 });
  } catch (error) {
    return dealDetailErrorResponse(error, "deal upload url");
  }
}
