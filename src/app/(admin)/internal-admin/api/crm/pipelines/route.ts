import { CRM_TAGS, getCachedPipelineSetup, invalidateCrm } from "@/lib/admin/crm/cache";
import { createBoard, createPipeline } from "@/lib/admin/crm/deals";
import { dealErrorResponse, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { validateBoardForm, validatePipelineForm, type BoardForm, type PipelineForm } from "@/lib/admin/crm/dealValidation";
import { crmResponses, guardRead } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quadros e funis (inclusive arquivados). */
export async function GET(request: Request) {
  const session = await guardRead(request);
  if (session instanceof Response) return session;
  try {
    return Response.json(await getCachedPipelineSetup());
  } catch (error) {
    return dealErrorResponse(error, "list pipelines");
  }
}

/**
 * Cria quadro ou funil. Corpo: `{ board: BoardForm }` ou `{ pipeline: PipelineForm }`.
 * Resposta: 201 { board } | { pipeline } · 400 { fields } · 401 · 409 (quadro não existe).
 */
export async function POST(request: Request) {
  const guard = await guardedWrite(request);
  if (guard instanceof Response) return guard;
  try {
    if (guard.body.board && typeof guard.body.board === "object") {
      const parsed = validateBoardForm(guard.body.board as Partial<BoardForm>);
      if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
      const board = await createBoard(parsed.value, guard.actor);
      invalidateCrm(CRM_TAGS.pipelines);
      return Response.json({ board }, { status: 201 });
    }
    if (guard.body.pipeline && typeof guard.body.pipeline === "object") {
      const parsed = validatePipelineForm(guard.body.pipeline as Partial<PipelineForm>);
      if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
      const pipeline = await createPipeline(parsed.value, guard.actor);
      invalidateCrm(CRM_TAGS.pipelines);
      return Response.json({ pipeline }, { status: 201 });
    }
    return crmResponses.invalid();
  } catch (error) {
    return dealErrorResponse(error, "create pipeline");
  }
}
