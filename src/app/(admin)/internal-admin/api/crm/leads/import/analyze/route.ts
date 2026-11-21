import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminSession } from "@/lib/admin/session";
import { getCachedAdmins, getCachedCompanies, getCachedContacts, getCachedLeads } from "@/lib/admin/crm/cache";
import { IMPORT_FIELDS, IMPORT_LIMITS, type ImportRow, type ImportValues } from "@/lib/admin/crm/leadImport/columns";
import { analyzeImportRows } from "@/lib/admin/crm/leadImport/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const invalidInput = () => Response.json({ error: "invalid_input" }, { status: 400 });

/**
 * Importar lista → análise (SÓ LEITURA): procura empresa, contato e leads já existentes para cada
 * linha e compara os dados. Nada é gravado aqui.
 * Corpo: { rows: [{ line, values }], default_owner_uid } · Resposta: { matches }.
 */
export async function POST(request: Request) {
  const body = await readGuardedJson(request, IMPORT_LIMITS.analyzeBytes);
  if (body instanceof Response) return body;

  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > IMPORT_LIMITS.rows) return invalidInput();
  const rows: ImportRow[] = [];
  for (const raw of body.rows as unknown[]) {
    if (!raw || typeof raw !== "object") return invalidInput();
    const { line, values } = raw as { line?: unknown; values?: unknown };
    if (!Number.isInteger(line) || !values || typeof values !== "object") return invalidInput();
    const v = values as Record<string, unknown>;
    rows.push({
      line: line as number,
      values: Object.fromEntries(IMPORT_FIELDS.map((f) => [f, typeof v[f] === "string" ? (v[f] as string).slice(0, IMPORT_LIMITS.cell) : ""])) as ImportValues,
    });
  }

  try {
    const admins = await getCachedAdmins();
    const defaultOwner = typeof body.default_owner_uid === "string" && admins.some((a) => a.uid === body.default_owner_uid) ? body.default_owner_uid : session.uid;
    const [{ companies }, { contacts }, { leads }] = await Promise.all([getCachedCompanies(), getCachedContacts(), getCachedLeads()]);
    const matches = await analyzeImportRows(rows, admins, defaultOwner, { companies, contacts, leads });
    return Response.json({ matches });
  } catch (error) {
    console.error("crm import analyze error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
