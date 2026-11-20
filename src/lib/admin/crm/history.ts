import "server-only";
import { FieldValue } from "firebase-admin/firestore";

/** Registro do histórico da negociação (só acrescenta). */
export function historyData(type: string, title: string, description: string | null, actor: { uid: string | null; name: string }, meta: Record<string, unknown> = {}) {
  return { type, title, description, meta, author_uid: actor.uid, author_name: actor.name, created_at: FieldValue.serverTimestamp() };
}
