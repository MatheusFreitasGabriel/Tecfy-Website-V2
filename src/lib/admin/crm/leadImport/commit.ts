import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { DuplicateCnpjError, updateCompany } from "../companies";
import { DuplicateEmailError, updateContact } from "../contacts";
import { MissingReferenceError, createManualLead, type Actor } from "../leads";
import { NOTES_SUBCOLLECTION, systemNoteData } from "../notes";
import { COMPANIES_COLLECTION, CONTACTS_COLLECTION, LEADS_COLLECTION } from "../types";
import { CONTACT_COMPANY_NONE, type ParsedCreateLead } from "../validation";
import { IMPORT_FIELDS, resolveOwner, validateImportRow, type ImportValues, type OwnerOption } from "./columns";
import { fillCompany, fillContact } from "./analyze";

/**
 * Gravação da importação, linha a linha (uma falha não derruba as outras).
 * - create: `createManualLead` (mesma transação do modal "Criar lead"); id do lead derivado de
 *   importação + linha → reenviar o mesmo lote não duplica.
 * - update: o lead existente ganha um registro na timeline (id fixo → também não duplica).
 * - fill: contato/empresa existentes recebem só os campos que estavam VAZIOS (via update*, que grava
 *   o "antes → depois" na timeline). Nada é sobrescrito.
 */

export const IMPORTS_COLLECTION = "lead_imports";

export interface CommitRowInput {
  line: number;
  values: ImportValues;
  action: "create" | "update";
  fill: boolean;
  company_id: string | null;
  contact_id: string | null;
  /** Lead existente (ação "update"). */
  lead_id: string | null;
}

export interface CommitRowResult {
  line: number;
  outcome: "created" | "updated" | "already" | "failed";
  lead_id: string | null;
  /** Campos completados em contato/empresa existentes. */
  filled: string[];
  message: string | null;
}

export interface ImportMeta {
  import_id: string;
  file_name: string;
  rows_total: number;
  skipped: number;
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);

/** Valida o corpo de uma linha (formato). A validação dos dados é feita depois, com os validadores do CRM. */
export function parseCommitRow(raw: unknown): CommitRowInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Number.isInteger(r.line) || (r.line as number) < 2 || (r.line as number) > 100_000) return null;
  if (r.action !== "create" && r.action !== "update") return null;
  if (!r.values || typeof r.values !== "object") return null;
  const v = r.values as Record<string, unknown>;
  const values = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, typeof v[f] === "string" ? (v[f] as string).slice(0, 2000) : ""])) as ImportValues;
  const optId = (x: unknown) => (x === null || x === undefined ? null : isId(x) ? x : undefined);
  const company_id = optId(r.company_id);
  const contact_id = optId(r.contact_id);
  const lead_id = optId(r.lead_id);
  if (company_id === undefined || contact_id === undefined || lead_id === undefined) return null;
  if (r.action === "update" && !lead_id) return null;
  return { line: r.line as number, values, action: r.action, fill: r.fill === true, company_id, contact_id, lead_id };
}

const hash = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);

async function fillExisting(row: CommitRowInput, parsed: ParsedCreateLead, actor: Actor, filled: string[], notes: string[]) {
  const db = getAdminDb();
  if (row.company_id && parsed.company.mode === "new") {
    const snap = await db.collection(COMPANIES_COLLECTION).doc(row.company_id).get();
    if (snap.exists) {
      const merged = fillCompany(snap.data() ?? {}, parsed.company.data);
      if (merged.filled.length) {
        try {
          await updateCompany(row.company_id, merged.data, actor);
          filled.push(...merged.filled.map((f) => `Empresa: ${f}`));
        } catch (error) {
          if (error instanceof DuplicateCnpjError) notes.push(`CNPJ já pertence a "${error.owner.name}" — empresa não completada.`);
          else throw error;
        }
      }
    }
  }
  if (row.contact_id && parsed.contact.mode === "new") {
    const snap = await db.collection(CONTACTS_COLLECTION).doc(row.contact_id).get();
    if (snap.exists) {
      const current = snap.data() ?? {};
      const merged = fillContact(current, parsed.contact.data);
      const currentCompany = typeof current.company_id === "string" && current.company_id ? current.company_id : null;
      const companyChoice = currentCompany ?? row.company_id ?? CONTACT_COMPANY_NONE;
      if (merged.filled.length || (!currentCompany && row.company_id)) {
        try {
          await updateContact(row.contact_id, { ...merged.data, company_choice: companyChoice }, actor);
          filled.push(...merged.filled.map((f) => `Contato: ${f}`));
          if (!currentCompany && row.company_id) filled.push("Contato: Empresa");
        } catch (error) {
          if (error instanceof DuplicateEmailError) notes.push(`E-mail já pertence a "${error.owner.name}" — contato não completado.`);
          else throw error;
        }
      }
    }
  }
}

export async function commitImportRows(
  meta: ImportMeta,
  rows: CommitRowInput[],
  admins: OwnerOption[],
  defaultOwnerUid: string,
  actor: Actor,
  first: boolean,
): Promise<CommitRowResult[]> {
  const db = getAdminDb();
  const ownerUids = admins.map((a) => a.uid);
  const results: CommitRowResult[] = [];
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());

  for (const row of rows) {
    const filled: string[] = [];
    const notes: string[] = [];
    try {
      const ownerUid = resolveOwner(row.values.owner, admins, defaultOwnerUid);
      const check = validateImportRow(row.values, ownerUid, ownerUids);
      if (!check.ok) {
        results.push({ line: row.line, outcome: "failed", lead_id: null, filled, message: Object.values(check.errors)[0] ?? "Dados inválidos." });
        continue;
      }
      const { lead, contact, company } = check.parsed;
      const owner = admins.find((a) => a.uid === lead.owner_uid)!;
      const parsed: ParsedCreateLead = {
        lead,
        company: row.company_id ? { mode: "existing", id: row.company_id } : company ? { mode: "new", data: company } : { mode: "none" },
        contact: row.contact_id ? { mode: "existing", id: row.contact_id } : contact ? { mode: "new", data: contact } : { mode: "none" },
      };
      // Para completar dados, o que veio da planilha (mesmo quando o vínculo é com o existente).
      const sheet: ParsedCreateLead = {
        lead,
        company: company ? { mode: "new", data: company } : { mode: "none" },
        contact: contact ? { mode: "new", data: contact } : { mode: "none" },
      };

      if (row.action === "create") {
        const result = await createManualLead(parsed, { uid: owner.uid, name: owner.name }, actor, hash(meta.import_id, String(row.line)), {
          import_id: meta.import_id,
        });
        if (row.fill && result.created) await fillExisting(row, sheet, actor, filled, notes);
        results.push({
          line: row.line,
          outcome: result.created ? "created" : "already",
          lead_id: result.id,
          filled,
          message: [result.contactReused ? "Contato com o mesmo e-mail já existia e foi reaproveitado." : null, ...notes].filter(Boolean).join(" ") || null,
        });
        continue;
      }

      // update: registro na timeline do lead existente (id fixo por importação + linha).
      const leadRef = db.collection(LEADS_COLLECTION).doc(row.lead_id!);
      if (!(await leadRef.get()).exists) {
        results.push({ line: row.line, outcome: "failed", lead_id: null, filled, message: "O lead existente não foi encontrado (foi excluído?)." });
        continue;
      }
      if (row.fill) await fillExisting(row, sheet, actor, filled, notes);
      const text = [
        `Reapareceu na importação de ${dateLabel} (${meta.file_name}, linha ${row.line}).`,
        filled.length ? `Dados completados: ${filled.join(", ")}.` : null,
        lead.notes ? `Observações da planilha: ${lead.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000);
      let outcome: CommitRowResult["outcome"] = "updated";
      try {
        await leadRef.collection(NOTES_SUBCOLLECTION).doc(`imp_${hash(meta.import_id, String(row.line))}`).create(systemNoteData(text, actor));
      } catch (error) {
        if ((error as { code?: number })?.code === 6) outcome = "already";
        else throw error;
      }
      results.push({ line: row.line, outcome, lead_id: leadRef.id, filled, message: notes.join(" ") || null });
    } catch (error) {
      const message = error instanceof MissingReferenceError ? "O contato ou a empresa existente foi removido. Analise de novo." : "Erro ao gravar esta linha.";
      if (!(error instanceof MissingReferenceError)) console.error("crm import row error", error instanceof Error ? error.message : "unknown");
      results.push({ line: row.line, outcome: "failed", lead_id: null, filled, message });
    }
  }

  // Histórico: contadores só do que foi gravado AGORA (reenvio de um lote não conta duas vezes).
  const count = (o: CommitRowResult["outcome"]) => results.filter((r) => r.outcome === o).length;
  const now = FieldValue.serverTimestamp();
  await db
    .collection(IMPORTS_COLLECTION)
    .doc(meta.import_id)
    .set(
      {
        file_name: meta.file_name,
        rows_total: meta.rows_total,
        skipped: meta.skipped,
        created: FieldValue.increment(count("created")),
        updated: FieldValue.increment(count("updated")),
        failed: FieldValue.increment(count("failed")),
        updated_at: now,
        ...(first ? { created_by_uid: actor.uid, created_by_name: actor.name, created_at: now } : {}),
      },
      { merge: true },
    );

  return results;
}

export interface ImportHistoryRow {
  id: string;
  file_name: string;
  rows_total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  created_by_name: string | null;
  created_at: string | null;
}

export async function listImports(limit = 8): Promise<ImportHistoryRow[]> {
  const snap = await getAdminDb().collection(IMPORTS_COLLECTION).orderBy("created_at", "desc").limit(limit).get();
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return snap.docs.map((d) => ({
    id: d.id,
    file_name: String(d.get("file_name") ?? "planilha"),
    rows_total: num(d.get("rows_total")),
    created: num(d.get("created")),
    updated: num(d.get("updated")),
    skipped: num(d.get("skipped")),
    failed: num(d.get("failed")),
    created_by_name: typeof d.get("created_by_name") === "string" ? d.get("created_by_name") : null,
    created_at: (d.get("created_at") as Timestamp | undefined)?.toDate?.().toISOString() ?? null,
  }));
}
