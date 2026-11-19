import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { NOTIFICATIONS_COLLECTION, leadCreatedNotification, leadReturnedNotification } from "@/lib/admin/notifications";
import { maskPhoneNumber } from "@/utils/masks";
import { ensureEmailIndex, readEmailIndex, writeEmailIndex } from "./contactIndex";
import { systemNoteData } from "./notes";
import { CONTACTS_COLLECTION, LEAD_NOTES_SUBCOLLECTION, LEAD_SCHEMA_VERSION, LEADS_COLLECTION } from "./types";

export interface WebsiteLeadInput {
  /** Já capitalizado. */
  name: string;
  /** Minúsculo. */
  email: string;
  /** Só dígitos. */
  phone: string;
  /** "" = sem plano. */
  plan: string;
}

export interface WebsiteLeadResult {
  /** true = a pessoa já era lead; o retorno foi registrado no lead existente. */
  returning: boolean;
  leadId: string;
  planLabel: string;
}

export const planLabelOf = (plan: string) => (plan ? `Plano ${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : "Website");

/** Envios com o mesmo e-mail ao mesmo tempo são serializados; dá folga de tentativas para todos entrarem. */
const MAX_ATTEMPTS = 15;

/**
 * Registra um envio do formulário do site numa única transação, SÓ com leituras diretas (sem consultas):
 *  - e-mail desconhecido → cria contato + lead + notificação "lead novo" + índice do e-mail;
 *  - e-mail conhecido → NÃO duplica: registra "voltou pelo site" no último lead do contato +
 *    notificação "lead voltou". Esse ramo só CRIA documentos novos (não altera lead nem índice),
 *    então vários retornos simultâneos não disputam o mesmo documento;
 *  - contato conhecido cujo lead foi excluído → cria um lead novo para o mesmo contato.
 */
export async function registerWebsiteLead(input: WebsiteLeadInput): Promise<WebsiteLeadResult> {
  const db = getAdminDb();
  const leads = db.collection(LEADS_COLLECTION);
  const planLabel = planLabelOf(input.plan);

  // Contatos antigos (antes do índice): garante a entrada do índice ANTES da transação.
  await ensureEmailIndex(db, input.email);

  return db.runTransaction(
    async (tx) => {
      // ── Leituras (diretas por id) ──
      const known = await readEmailIndex(tx, db, input.email);
      const latestLead = known?.latestLeadId ? await tx.get(leads.doc(known.latestLeadId)) : null;

      // ── Escritas ──
      const now = FieldValue.serverTimestamp();

      if (known && latestLead?.exists) {
        tx.create(
          latestLead.ref.collection(LEAD_NOTES_SUBCOLLECTION).doc(),
          systemNoteData(
            `Entrou em contato novamente pelo site. Dados enviados: ${input.name} · ${input.email} · ${maskPhoneNumber(input.phone)} · interesse: ${planLabel}.`,
            { uid: null, name: "Website" },
          ),
        );
        tx.create(db.collection(NOTIFICATIONS_COLLECTION).doc(), leadReturnedNotification(latestLead.id, input.name, planLabel));
        return { returning: true, leadId: latestLead.id, planLabel };
      }

      const leadRef = leads.doc();
      let contactId = known?.contactId ?? null;
      if (!contactId) {
        const contactRef = db.collection(CONTACTS_COLLECTION).doc();
        contactId = contactRef.id;
        tx.create(contactRef, {
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: null,
          preferred_channel: null,
          notes: null,
          comm_consent: "nao_informada",
          company_id: null,
          origin_lead_id: leadRef.id,
          created_by_uid: null,
          created_by_name: "Website",
          created_at: now,
          updated_at: now,
        });
      }
      writeEmailIndex(tx, db, input.email, contactId, leadRef.id);

      tx.create(leadRef, {
        title: `${input.name} · ${planLabel}`,
        email: input.email,
        phone: input.phone,
        owner_uid: null,
        owner_name: null,
        stage: "novo",
        qualification: "a_qualificar",
        status: "novo",
        source: "website",
        entry: "website",
        campaign: null,
        interest_plan: input.plan || null,
        estimated_value_cents: null,
        expected_close_date: null,
        tags: [],
        notes: null,
        contact_id: contactId,
        company_id: null,
        schema_version: LEAD_SCHEMA_VERSION,
        created_by_uid: null,
        created_by_name: "Website",
        created_at: now,
        updated_at: now,
      });
      tx.create(db.collection(NOTIFICATIONS_COLLECTION).doc(), leadCreatedNotification(leadRef.id, input.name, planLabel));
      return { returning: false, leadId: leadRef.id, planLabel };
    },
    { maxAttempts: MAX_ATTEMPTS },
  );
}
