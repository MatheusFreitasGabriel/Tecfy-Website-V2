import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import { CRM_TAGS, getCachedAdmins, invalidateCrm } from "@/lib/admin/crm/cache";
import { IMPORT_LIMITS } from "@/lib/admin/crm/leadImport/columns";
import { commitImportRows, parseCommitRow, type CommitRowInput } from "@/lib/admin/crm/leadImport/commit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const invalidInput = () => Response.json({ error: "invalid_input" }, { status: 400 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Importar lista → gravação de um lote (≤ 25 linhas). A tela manda os lotes em sequência.
 * Tudo é revalidado aqui; uma linha com problema não impede as outras.
 * Corpo: { meta: { import_id, file_name, rows_total, skipped }, first, default_owner_uid, rows } · Resposta: { results }.
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, IMPORT_LIMITS.commitBytes);
  if (body instanceof Response) return body;

  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const meta = body.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta.import_id !== "string" || !UUID.test(meta.import_id)) return invalidInput();
  const fileName = typeof meta.file_name === "string" ? meta.file_name.replace(/[\u0000-\u001F]/g, "").slice(0, 120) : "";
  const rowsTotal = Number.isInteger(meta.rows_total) ? Math.min(Math.max(meta.rows_total as number, 0), IMPORT_LIMITS.rows) : 0;
  const skipped = Number.isInteger(meta.skipped) ? Math.min(Math.max(meta.skipped as number, 0), IMPORT_LIMITS.rows) : 0;

  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > IMPORT_LIMITS.commitChunk) return invalidInput();
  const rows: CommitRowInput[] = [];
  for (const raw of body.rows as unknown[]) {
    const row = parseCommitRow(raw);
    if (!row) return invalidInput();
    rows.push(row);
  }

  try {
    const admins = await getCachedAdmins();
    const defaultOwner = typeof body.default_owner_uid === "string" && admins.some((a) => a.uid === body.default_owner_uid) ? body.default_owner_uid : session.uid;
    const profile = await getAdminProfile(session);
    const actor = { uid: session.uid, name: profile.name ?? profile.email ?? session.uid };

    const results = await commitImportRows(
      { import_id: meta.import_id.toLowerCase(), file_name: fileName || "planilha", rows_total: rowsTotal, skipped },
      rows,
      admins,
      defaultOwner,
      actor,
      body.first === true,
    );
    invalidateCrm(CRM_TAGS.leads, CRM_TAGS.contacts, CRM_TAGS.companies, CRM_TAGS.imports);
    return Response.json({ results });
  } catch (error) {
    console.error("crm import commit error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
