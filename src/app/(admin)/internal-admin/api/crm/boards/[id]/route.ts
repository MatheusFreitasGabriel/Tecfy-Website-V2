import { CRM_TAGS, invalidateCrm } from "@/lib/admin/crm/cache";
import { updateBoard } from "@/lib/admin/crm/deals";
import { dealErrorResponse, guardedWrite } from "@/lib/admin/crm/dealRoutes";
import { isDocId, validateBoardForm, type BoardForm } from "@/lib/admin/crm/dealValidation";
import { crmResponses } from "@/lib/admin/crm/routeHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edita o quadro (`{ board: BoardForm }`) ou arquiva/restaura (`{ archived }`). Nada é excluído. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDocId(id)) return crmResponses.notFound();
  const guard = await guardedWrite(request);
  if (guard instanceof Response) return guard;
  try {
    let patch: Parameters<typeof updateBoard>[1];
    if (typeof guard.body.archived === "boolean") {
      patch = { archived: guard.body.archived };
    } else {
      const parsed = guard.body.board && typeof guard.body.board === "object" ? validateBoardForm(guard.body.board as Partial<BoardForm>) : null;
      if (!parsed) return crmResponses.invalid();
      if (!parsed.ok) return Response.json({ error: "invalid_input", fields: parsed.errors }, { status: 400 });
      patch = parsed.value;
    }
    if (!(await updateBoard(id, patch))) return crmResponses.notFound();
    invalidateCrm(CRM_TAGS.pipelines);
    return Response.json({ ok: true });
  } catch (error) {
    return dealErrorResponse(error, "update board");
  }
}
