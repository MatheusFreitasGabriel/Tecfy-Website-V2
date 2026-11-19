import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { BUILTIN_TEMPLATES } from "./templates";
import { TEMPLATES_COLLECTION, type MessageTemplate } from "./types";
import type { TemplateData } from "./validation";
import type { Actor } from "./leads";

/** Modelos padrão (código) + personalizados (Firestore), em ordem: padrão primeiro, depois por nome. */
export async function listTemplates(): Promise<MessageTemplate[]> {
  const snap = await getAdminDb().collection(TEMPLATES_COLLECTION).orderBy("name").limit(200).get();
  const custom: MessageTemplate[] = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      channel: d.channel === "email" ? "email" : "whatsapp",
      name: typeof d.name === "string" ? d.name : "Sem nome",
      subject: typeof d.subject === "string" ? d.subject : null,
      body: typeof d.body === "string" ? d.body : "",
      builtin: false,
    };
  });
  return [...BUILTIN_TEMPLATES, ...custom];
}

export async function createTemplate(data: TemplateData, actor: Actor): Promise<string> {
  const ref = getAdminDb().collection(TEMPLATES_COLLECTION).doc();
  await ref.create({
    ...data,
    created_by_uid: actor.uid,
    created_by_name: actor.name,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Atualiza um modelo personalizado. Retorna false se não existir. */
export async function updateTemplate(id: string, data: TemplateData): Promise<boolean> {
  const ref = getAdminDb().collection(TEMPLATES_COLLECTION).doc(id);
  try {
    await ref.update({ ...data, updated_at: FieldValue.serverTimestamp() });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 5) return false; // NOT_FOUND
    throw error;
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  await getAdminDb().collection(TEMPLATES_COLLECTION).doc(id).delete();
}
