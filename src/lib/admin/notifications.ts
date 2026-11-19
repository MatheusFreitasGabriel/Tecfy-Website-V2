import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

/**
 * Central de notificações do painel (sino na sidebar).
 * admin_notifications/{id}: type, title, body, lead_id, created_at, read_by (uids que já leram).
 * Hoje só existe "lead_created" (lead novo pelo site); vendas etc. entram depois com outros tipos.
 */

export const NOTIFICATIONS_COLLECTION = "admin_notifications";

/** lead_created = lead novo pelo site · lead_returned = alguém já cadastrado preencheu o site de novo. */
export type NotificationType = "lead_created" | "lead_returned";

export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  lead_id: string | null;
  /** ISO. */
  created_at: string | null;
  read: boolean;
}

/** Dados do documento (para gravar junto na transação que cria o lead). */
export function leadCreatedNotification(leadId: string, personName: string, planLabel: string) {
  return {
    type: "lead_created" as const,
    title: "Novo lead pelo site",
    body: `${personName} · ${planLabel}`,
    lead_id: leadId,
    read_by: [] as string[],
    created_at: FieldValue.serverTimestamp(),
  };
}

/** Alguém que já é lead voltou a preencher o formulário do site (costuma ser lead quente). */
export function leadReturnedNotification(leadId: string, personName: string, planLabel: string) {
  return {
    type: "lead_returned" as const,
    title: "Lead voltou pelo site",
    body: `${personName} entrou em contato de novo · ${planLabel}`,
    lead_id: leadId,
    read_by: [] as string[],
    created_at: FieldValue.serverTimestamp(),
  };
}

const LIST_LIMIT = 50;

/**
 * Últimas notificações (mais recentes primeiro) com o estado de leitura do usuário.
 * Com `since`, traz só as criadas DEPOIS desse instante — o sino consulta assim a cada minuto,
 * e na maioria das vezes a resposta é vazia (1 leitura mínima em vez de 50).
 */
export async function listNotifications(uid: string, since?: Date): Promise<{ items: NotificationRow[]; unread: number }> {
  let query = getAdminDb().collection(NOTIFICATIONS_COLLECTION).orderBy("created_at", "desc");
  if (since) query = query.where("created_at", ">", Timestamp.fromDate(since));
  const snap = await query.limit(LIST_LIMIT).get();
  const items = snap.docs.map((doc): NotificationRow => {
    const d = doc.data();
    const created = d.created_at as Timestamp | undefined;
    return {
      id: doc.id,
      type: d.type === "lead_returned" ? "lead_returned" : "lead_created",
      title: String(d.title ?? "Notificação"),
      body: String(d.body ?? ""),
      lead_id: typeof d.lead_id === "string" ? d.lead_id : null,
      created_at: created && typeof created.toDate === "function" ? created.toDate().toISOString() : null,
      read: Array.isArray(d.read_by) && d.read_by.includes(uid),
    };
  });
  return { items, unread: items.filter((n) => !n.read).length };
}

/** Marca como lidas pelo usuário (ids informados, ou todas as recentes não lidas). */
export async function markNotificationsRead(uid: string, ids: string[] | "all"): Promise<void> {
  const db = getAdminDb();
  const collection = db.collection(NOTIFICATIONS_COLLECTION);
  let refs;
  if (ids === "all") {
    const snap = await collection.orderBy("created_at", "desc").limit(LIST_LIMIT).get();
    refs = snap.docs.filter((d) => !(Array.isArray(d.get("read_by")) && d.get("read_by").includes(uid))).map((d) => d.ref);
  } else {
    const snaps = ids.length ? await db.getAll(...ids.map((id) => collection.doc(id))) : [];
    refs = snaps.filter((s) => s.exists).map((s) => s.ref);
  }
  if (!refs.length) return;
  const batch = db.batch();
  for (const ref of refs) batch.update(ref, { read_by: FieldValue.arrayUnion(uid) });
  await batch.commit();
}
