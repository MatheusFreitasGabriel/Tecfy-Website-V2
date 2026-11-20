import "server-only";
import { FieldPath, FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { taskParents, taskRecurrences, taskTypes, type TaskParentType } from "./options";
import {
  COMPANIES_COLLECTION,
  CONTACTS_COLLECTION,
  DEAL_HISTORY_SUBCOLLECTION,
  DEALS_COLLECTION,
  LEAD_NOTES_SUBCOLLECTION,
  LEADS_COLLECTION,
  TASKS_COLLECTION,
  type TaskParent,
  type TaskRecurrence,
  type TaskRow,
} from "./types";
import { brazilDateTime, type TaskData } from "./dealValidation";
import { historyData } from "./history";
import { systemNoteData } from "./notes";
import type { Actor } from "./leads";

/**
 * Tarefas do CRM: ligadas a uma negociação, lead, contato, empresa ou avulsas; com recorrência
 * (ao concluir, a próxima nasce na MESMA transação — clique duplo não duplica) e lembrete.
 * Toda ação vai para o histórico do vínculo (negociação → histórico; lead/contato/empresa →
 * observação automática). Transações só com leitura direta de documentos.
 */

export class TaskNotFoundError extends Error {
  constructor() {
    super("task_not_found");
  }
}
/** O vínculo (negociação/lead/contato/empresa) não existe. */
export class TaskParentNotFoundError extends Error {
  constructor() {
    super("parent_not_found");
  }
}

const MAX_ATTEMPTS = 15;
/** Concluídas que aparecem na tela (as mais antigas ficam só no histórico dos vínculos). */
export const DONE_WINDOW_DAYS = 60;
export const TASKS_OPEN_PAGE = 1500;
export const TASKS_OPEN_LIMIT = 6000;
export const TASKS_BULK_MAX = 100;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const iso = (v: unknown): string | null => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate().toISOString() : null);

const PARENT_COLLECTION: Record<TaskParentType, string> = {
  deal: DEALS_COLLECTION,
  lead: LEADS_COLLECTION,
  contact: CONTACTS_COLLECTION,
  company: COMPANIES_COLLECTION,
};

/** Nome exibido do vínculo a partir do documento. */
function parentLabel(type: TaskParentType, doc: DocumentSnapshot): string {
  const d = doc.data() ?? {};
  if (type === "deal") return str(d.title) ?? "Negociação";
  if (type === "lead") return str(d.title) ?? str(d.lead_name) ?? "Lead";
  if (type === "contact") return str(d.name) ?? "Contato";
  return str(d.trade_name) ?? "Empresa";
}

function parentOf(d: Record<string, unknown>): TaskParent | null {
  if (taskParents.is(d.parent_type) && str(d.parent_id)) return { type: d.parent_type, id: d.parent_id as string, label: str(d.parent_label) ?? taskParents.label(d.parent_type) };
  // Tarefas antigas: só deal_id.
  if (str(d.deal_id)) return { type: "deal", id: d.deal_id as string, label: str(d.parent_label) ?? "Negociação" };
  return null;
}

export function toTaskRow(doc: DocumentSnapshot): TaskRow {
  const d = doc.data() ?? {};
  const parent = parentOf(d);
  const r = d.recurrence as Partial<TaskRecurrence> | undefined;
  return {
    id: doc.id,
    deal_id: parent?.type === "deal" ? parent.id : null,
    parent,
    recurrence: r && taskRecurrences.is(r.freq) ? { freq: r.freq, interval: Number.isInteger(r.interval) && (r.interval as number) > 0 ? (r.interval as number) : 1 } : null,
    remind_minutes: typeof d.remind_minutes === "number" ? d.remind_minutes : null,
    next_task_id: str(d.next_task_id),
    created_by_name: str(d.created_by_name),
    title: str(d.title) ?? "Tarefa",
    type: taskTypes.is(d.type) ? d.type : "outro",
    due_at: iso(d.due_at) ?? new Date(0).toISOString(),
    done_at: iso(d.done_at),
    assignee_uid: str(d.assignee_uid),
    assignee_name: str(d.assignee_name),
    notes: str(d.notes),
    created_at: iso(d.created_at),
  };
}

const dueBr = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);

// ── Histórico do vínculo ─────────────────────────────────────────────────────

/** Lê o vínculo na transação (null = não existe mais). */
async function readParent(tx: Transaction, db: Firestore, parent: { type: TaskParentType; id: string } | null): Promise<DocumentSnapshot | null> {
  if (!parent) return null;
  const snap = await tx.get(db.collection(PARENT_COLLECTION[parent.type]).doc(parent.id));
  return snap.exists ? snap : null;
}

/** Registra a ação no histórico do vínculo (negociação: histórico; demais: observação automática). */
function logToParent(tx: Transaction, parent: TaskParent | { type: TaskParentType; id: string } | null, parentSnap: DocumentSnapshot | null, title: string, description: string, actor: Actor, meta: Record<string, unknown> = {}) {
  if (!parent || !parentSnap) return;
  const ref = parentSnap.ref;
  if (parent.type === "deal") tx.create(ref.collection(DEAL_HISTORY_SUBCOLLECTION).doc(), historyData("task", title, description, actor, meta));
  else tx.create(ref.collection(LEAD_NOTES_SUBCOLLECTION).doc(), systemNoteData(`${title}: ${description}`, actor));
}

// ── Recorrência ──────────────────────────────────────────────────────────────

const brParts = (date: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), time: `${p.hour}:${p.minute}` };
};
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** Soma dias no calendário de Brasília mantendo o horário. */
function addDays(date: Date, days: number): Date {
  const { y, m, d, time } = brParts(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return brazilDateTime(ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()), time);
}
function isWeekend(date: Date): boolean {
  const { y, m, d } = brParts(date);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}
/** "AAAA-MM-DD" que existe no calendário. */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Próxima ocorrência (mesmo horário de Brasília), sempre depois de `after`. */
export function nextOccurrence(due: Date, recurrence: TaskRecurrence, after: Date = new Date()): Date {
  let current = due;
  // Muito atrasada: pula direto para perto de "agora" (sem iterar dia a dia por anos).
  if (recurrence.freq !== "monthly") {
    const period = recurrence.freq === "weekly" ? 7 : recurrence.freq === "every_n_days" ? recurrence.interval : 1;
    const behind = Math.floor((after.getTime() - due.getTime()) / 86_400_000);
    const skip = Math.floor(behind / period) * period - period;
    if (skip > 0) current = addDays(due, skip);
  }
  for (let i = 0; i < 2000; i++) {
    const { y, m, d, time } = brParts(current);
    let next: Date;
    if (recurrence.freq === "monthly") {
      const target = new Date(Date.UTC(y, m, 1)); // mês seguinte
      const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      next = brazilDateTime(ymd(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(d, lastDay)), time);
    } else {
      const days = recurrence.freq === "daily" || recurrence.freq === "weekdays" ? 1 : recurrence.freq === "weekly" ? 7 : recurrence.interval;
      next = addDays(current, days);
      // Dias úteis: pula sábado e domingo.
      while (recurrence.freq === "weekdays" && isWeekend(next)) next = addDays(next, 1);
    }
    if (next > after) return next;
    current = next;
  }
  return current;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** Tarefas de uma negociação (abertas e concluídas), da mais próxima para a mais distante. */
export async function listDealTasks(dealId: string, limit = 300): Promise<TaskRow[]> {
  const snap = await getAdminDb().collection(TASKS_COLLECTION).where("deal_id", "==", dealId).limit(limit).get();
  return snap.docs.map(toTaskRow).sort((a, b) => a.due_at.localeCompare(b.due_at));
}

/** Uma página de tarefas ABERTAS (ordem do id: igualdade + id não pede índice composto). */
export async function listOpenTasksPage(afterId: string | null, size = TASKS_OPEN_PAGE): Promise<{ rows: TaskRow[]; next: string | null }> {
  let query = getAdminDb().collection(TASKS_COLLECTION).where("done", "==", false).orderBy(FieldPath.documentId()).limit(size);
  if (afterId) query = query.startAfter(afterId);
  const snap = await query.get();
  return { rows: snap.docs.map(toTaskRow), next: snap.size === size ? snap.docs[snap.size - 1].id : null };
}

/** Concluídas nos últimos dias (filtro de intervalo num campo só: sem índice composto). */
export async function listRecentDoneTasks(days = DONE_WINDOW_DAYS, limit = 2000): Promise<TaskRow[]> {
  const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);
  const snap = await getAdminDb().collection(TASKS_COLLECTION).where("done_at", ">=", since).orderBy("done_at", "desc").limit(limit).get();
  return snap.docs.map(toTaskRow);
}

// ── Gravação ─────────────────────────────────────────────────────────────────

function taskDocument(data: TaskData, parent: TaskParent | null, assignee: Actor, actor: Actor) {
  const now = FieldValue.serverTimestamp();
  return {
    deal_id: parent?.type === "deal" ? parent.id : null,
    parent_type: parent?.type ?? null,
    parent_id: parent?.id ?? null,
    parent_label: parent?.label ?? null,
    title: data.title,
    type: data.type,
    due_at: Timestamp.fromDate(data.due_at),
    done: false,
    done_at: null,
    assignee_uid: assignee.uid,
    assignee_name: assignee.name,
    notes: data.notes,
    recurrence: data.recurrence ?? null,
    remind_minutes: data.remind_minutes ?? null,
    next_task_id: null,
    created_by_uid: actor.uid,
    created_by_name: actor.name,
    created_at: now,
    updated_at: now,
  };
}

/** Cria a tarefa (e registra no histórico do vínculo). */
export async function createTask(data: TaskData, assignee: Actor, actor: Actor): Promise<TaskRow> {
  const db = getAdminDb();
  const ref = db.collection(TASKS_COLLECTION).doc();
  const wanted = data.parent ?? (data.deal_id ? { type: "deal" as const, id: data.deal_id } : null);
  await db.runTransaction(async (tx) => {
    const parentSnap = await readParent(tx, db, wanted);
    if (wanted && !parentSnap) throw new TaskParentNotFoundError();
    const parent = wanted && parentSnap ? { ...wanted, label: parentLabel(wanted.type, parentSnap) } : null;
    tx.create(ref, taskDocument({ ...data, parent: wanted }, parent, assignee, actor));
    logToParent(tx, parent, parentSnap, "Tarefa criada", `${taskTypes.label(data.type)}: ${data.title} · ${dueBr(data.due_at)} · ${assignee.name}`, actor, { task_id: ref.id });
  }, { maxAttempts: MAX_ATTEMPTS });
  return toTaskRow(await ref.get());
}

/**
 * Conclui/reabre. Recorrente concluída → cria a próxima ocorrência na mesma transação e guarda
 * `next_task_id` (concluir de novo, ou em duas abas, não cria outra).
 */
export async function setTaskDone(id: string, done: boolean, actor: Actor): Promise<TaskRow | null> {
  const db = getAdminDb();
  const ref = db.collection(TASKS_COLLECTION).doc(id);
  const ok = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const row = toTaskRow(snap);
    const parentSnap = await readParent(tx, db, row.parent);
    if (snap.get("done") === done) return true;
    const update: Record<string, unknown> = { done, done_at: done ? FieldValue.serverTimestamp() : null, updated_at: FieldValue.serverTimestamp() };
    let nextText = "";
    if (done && row.recurrence && !snap.get("next_task_id")) {
      const next = nextOccurrence(new Date(row.due_at), row.recurrence);
      const nextRef = db.collection(TASKS_COLLECTION).doc();
      const doc = snap.data() ?? {};
      tx.create(nextRef, {
        ...doc,
        due_at: Timestamp.fromDate(next),
        done: false,
        done_at: null,
        next_task_id: null,
        previous_task_id: id,
        created_by_uid: actor.uid,
        created_by_name: actor.name,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      update.next_task_id = nextRef.id;
      nextText = ` · próxima: ${dueBr(next)}`;
    }
    tx.update(ref, update);
    logToParent(tx, row.parent, parentSnap, done ? "Tarefa concluída" : "Tarefa reaberta", `${row.title}${nextText}`, actor, { task_id: id });
    return true;
  }, { maxAttempts: MAX_ATTEMPTS });
  return ok ? toTaskRow(await ref.get()) : null;
}

/** Edita a tarefa (título, tipo, data/hora, responsável, observações, repetição, lembrete). O vínculo não muda. */
export async function updateTask(
  id: string,
  data: { title: string; type: string; due_at: Date; notes: string | null; recurrence?: TaskRecurrence | null; remind_minutes?: number | null },
  assignee: Actor,
  actor: Actor,
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(TASKS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new TaskNotFoundError();
    const row = toTaskRow(snap);
    const parentSnap = await readParent(tx, db, row.parent);
    const before = new Date(row.due_at);
    const rescheduled = before.getTime() !== data.due_at.getTime();
    const reassigned = row.assignee_uid !== assignee.uid;
    tx.update(ref, {
      title: data.title,
      type: data.type,
      due_at: Timestamp.fromDate(data.due_at),
      notes: data.notes,
      assignee_uid: assignee.uid,
      assignee_name: assignee.name,
      ...(data.recurrence !== undefined ? { recurrence: data.recurrence } : {}),
      ...(data.remind_minutes !== undefined ? { remind_minutes: data.remind_minutes } : {}),
      updated_at: FieldValue.serverTimestamp(),
    });
    const parts = [data.title, rescheduled ? `${dueBr(before)} → ${dueBr(data.due_at)}` : null, reassigned ? `responsável: ${row.assignee_name ?? "—"} → ${assignee.name}` : assignee.name];
    logToParent(tx, row.parent, parentSnap, rescheduled ? "Tarefa reagendada" : "Tarefa alterada", parts.filter(Boolean).join(" · "), actor, { task_id: id });
  }, { maxAttempts: MAX_ATTEMPTS });
}

export async function deleteTask(id: string, actor: Actor): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(TASKS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new TaskNotFoundError();
    const row = toTaskRow(snap);
    const parentSnap = await readParent(tx, db, row.parent);
    tx.delete(ref);
    logToParent(tx, row.parent, parentSnap, "Tarefa excluída", row.title, actor);
  }, { maxAttempts: MAX_ATTEMPTS });
}

// ── Ações em massa ───────────────────────────────────────────────────────────

export type BulkTaskAction =
  | { action: "complete"; ids: string[] }
  | { action: "reopen"; ids: string[] }
  | { action: "delete"; ids: string[] }
  | { action: "assign"; ids: string[]; assignee: Actor }
  /** Desloca N dias mantendo o horário. */
  | { action: "shift"; ids: string[]; days: number }
  /** Move para o dia AAAA-MM-DD mantendo o horário de cada tarefa. */
  | { action: "move_to"; ids: string[]; date: string };

/**
 * Ações em massa numa transação (até 100 tarefas): relê, ignora as que sumiram, grava tudo ou nada.
 * Concluir em massa também gera a próxima das recorrentes.
 */
export async function bulkTasks(input: BulkTaskAction, actor: Actor): Promise<string[]> {
  const db = getAdminDb();
  const refs = input.ids.map((id) => db.collection(TASKS_COLLECTION).doc(id));
  return db.runTransaction(async (tx) => {
    const snaps = (await tx.getAll(...refs)).filter((s) => s.exists);
    const rows = snaps.map(toTaskRow);
    // Vínculos (para o histórico): lidos antes de qualquer gravação.
    const parentRefs = new Map<string, DocumentReference>();
    for (const r of rows) if (r.parent) parentRefs.set(`${r.parent.type}/${r.parent.id}`, db.collection(PARENT_COLLECTION[r.parent.type]).doc(r.parent.id));
    const parentSnaps = parentRefs.size ? await tx.getAll(...parentRefs.values()) : [];
    const parentByKey = new Map([...parentRefs.keys()].map((k, i) => [k, parentSnaps[i]?.exists ? parentSnaps[i] : null]));
    const now = FieldValue.serverTimestamp();
    const changed: string[] = [];
    snaps.forEach((snap, i) => {
      const row = rows[i];
      const parentSnap = row.parent ? (parentByKey.get(`${row.parent.type}/${row.parent.id}`) ?? null) : null;
      switch (input.action) {
        case "complete":
        case "reopen": {
          const done = input.action === "complete";
          if (snap.get("done") === done) return;
          const update: Record<string, unknown> = { done, done_at: done ? now : null, updated_at: now };
          if (done && row.recurrence && !snap.get("next_task_id")) {
            const nextRef = db.collection(TASKS_COLLECTION).doc();
            tx.create(nextRef, { ...(snap.data() ?? {}), due_at: Timestamp.fromDate(nextOccurrence(new Date(row.due_at), row.recurrence)), done: false, done_at: null, next_task_id: null, previous_task_id: snap.id, created_at: now, updated_at: now });
            update.next_task_id = nextRef.id;
          }
          tx.update(snap.ref, update);
          logToParent(tx, row.parent, parentSnap, done ? "Tarefa concluída" : "Tarefa reaberta", row.title, actor, { task_id: snap.id });
          break;
        }
        case "delete":
          tx.delete(snap.ref);
          logToParent(tx, row.parent, parentSnap, "Tarefa excluída", row.title, actor);
          break;
        case "assign":
          if (row.assignee_uid === input.assignee.uid) return;
          tx.update(snap.ref, { assignee_uid: input.assignee.uid, assignee_name: input.assignee.name, updated_at: now });
          logToParent(tx, row.parent, parentSnap, "Tarefa alterada", `${row.title} · responsável: ${row.assignee_name ?? "—"} → ${input.assignee.name}`, actor, { task_id: snap.id });
          break;
        case "shift":
        case "move_to": {
          const before = new Date(row.due_at);
          const due = input.action === "shift" ? addDays(before, input.days) : brazilDateTime(input.date, brParts(before).time);
          if (due.getTime() === before.getTime()) return;
          tx.update(snap.ref, { due_at: Timestamp.fromDate(due), updated_at: now });
          logToParent(tx, row.parent, parentSnap, "Tarefa reagendada", `${row.title} · ${dueBr(before)} → ${dueBr(due)}`, actor, { task_id: snap.id });
          break;
        }
      }
      changed.push(snap.id);
    });
    return changed;
  }, { maxAttempts: MAX_ATTEMPTS });
}

/** Validação da ação em massa (o responsável é resolvido pela rota). */
export function parseBulkTasks(body: Record<string, unknown>): { action: string; ids: string[]; value: unknown } | null {
  const { ids: raw, action, value } = body;
  if (!Array.isArray(raw) || !raw.length || raw.length > TASKS_BULK_MAX || !raw.every((x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x))) return null;
  const ids = [...new Set(raw as string[])];
  if (action === "complete" || action === "reopen" || action === "delete") return { action, ids, value: null };
  if (action === "assign" && typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)) return { action, ids, value };
  if (action === "shift" && Number.isInteger(value) && Math.abs(value as number) >= 1 && Math.abs(value as number) <= 365) return { action, ids, value };
  if (action === "move_to" && typeof value === "string" && isRealDate(value)) return { action, ids, value };
  return null;
}
