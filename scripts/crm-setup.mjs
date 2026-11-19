#!/usr/bin/env node
/**
 * Utilitário LOCAL do CRM (usa a service account do Firebase).
 *
 * Uso:
 *   node --env-file=.env.local scripts/crm-setup.mjs seed-products   # cria os planos do site em `products` (não sobrescreve)
 *   node --env-file=.env.local scripts/crm-setup.mjs status          # resumo de produtos e contratos
 *   node --env-file=.env.local scripts/crm-setup.mjs migrate-leads   # mostra os leads antigos que seriam convertidos (não grava)
 *   node --env-file=.env.local scripts/crm-setup.mjs migrate-leads --apply   # converte de verdade
 *   node --env-file=.env.local scripts/crm-setup.mjs backfill-email-index    # simula o índice de e-mail único dos contatos
 *   node --env-file=.env.local scripts/crm-setup.mjs backfill-email-index --apply
 */
import { cert, initializeApp } from "firebase-admin/app";
import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error("Faltam FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (use --env-file=.env.local).");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

// Espelha src/app/components/public/home/plans/PlansCardsData.ts (preços mensais).
const SITE_PLANS = [
  { id: "landing", name: "Landing", monthly_price: 647, price_label: null },
  { id: "starter", name: "Starter", monthly_price: 2709, price_label: null },
  { id: "pro", name: "Pro", monthly_price: 5417, price_label: null },
  { id: "ultimate", name: "Ultimate", monthly_price: 14542, price_label: null },
  { id: "startup", name: "Startup", monthly_price: null, price_label: "SOB CONSULTA" },
  { id: "equity", name: "Equity", monthly_price: null, price_label: "SOB CONSULTA" },
];

const [command] = process.argv.slice(2);

switch (command) {
  case "seed-products": {
    let created = 0;
    for (const [index, plan] of SITE_PLANS.entries()) {
      const { id, ...data } = plan;
      try {
        await db.collection("products").doc(id).create({
          ...data,
          active: true,
          sort: index,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        created += 1;
        console.log(`✓ ${plan.name} criado.`);
      } catch (error) {
        if (error?.code === 6) console.log(`· ${plan.name} já existe (mantido).`);
        else throw error;
      }
    }
    console.log(`Pronto: ${created} produto(s) criado(s).`);
    break;
  }
  case "status": {
    const products = await db.collection("products").orderBy("sort").get();
    console.log("Produtos:");
    for (const doc of products.docs) {
      const p = doc.data();
      console.log(`  - ${p.name}: ${p.monthly_price ?? p.price_label}${p.active ? "" : " (inativo)"}`);
    }
    const active = (await db.collection("contracts").where("status", "==", "active").count().get()).data().count;
    const total = (await db.collection("contracts").count().get()).data().count;
    console.log(`Contratos: ${active} ativo(s) de ${total}.`);
    break;
  }
  case "migrate-leads": {
    // Leads antigos do site guardavam a pessoa dentro do lead (lead_name/lead_email/lead_phone).
    // No modelo novo (schema_version 2) a pessoa vira um Contato e o lead aponta para ele.
    const apply = process.argv.includes("--apply");
    const all = await db.collection("leads").get();
    const legacy = all.docs.filter((doc) => doc.get("schema_version") !== 2);
    console.log(`${legacy.length} lead(s) antigo(s) de ${all.size}.${apply ? "" : " (simulação — use --apply para gravar)"}`);

    const stageFrom = { new: "novo" };
    let converted = 0;
    for (const doc of legacy) {
      const d = doc.data();
      const name = typeof d.lead_name === "string" && d.lead_name.trim() ? d.lead_name.trim() : "Sem nome";
      const email = typeof d.lead_email === "string" && d.lead_email.trim() ? d.lead_email.trim().toLowerCase() : null;
      const phone = typeof d.lead_phone === "string" ? d.lead_phone.replace(/D/g, "") || null : null;
      const plan = typeof d.interest_plan === "string" && d.interest_plan ? d.interest_plan : null;
      const planLabel = plan ? `Plano ${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : "Website";

      // Reaproveita um contato com o mesmo e-mail, se já existir.
      const existing = email ? await db.collection("contacts").where("email", "==", email).limit(1).get() : null;
      const contactRef = existing && !existing.empty ? existing.docs[0].ref : db.collection("contacts").doc();
      const reuse = Boolean(existing && !existing.empty);
      console.log(`  - ${doc.id}: "${name} · ${planLabel}" → contato ${reuse ? "existente" : "novo"} ${contactRef.id}`);
      if (!apply) continue;

      const created = d.created_at ?? FieldValue.serverTimestamp();
      const batch = db.batch();
      if (!reuse) {
        batch.create(contactRef, {
          name, email, phone,
          role: null, preferred_channel: null, notes: null, comm_consent: "nao_informada", company_id: null,
          origin_lead_id: doc.id, created_by_uid: null, created_by_name: "Website",
          created_at: created, updated_at: FieldValue.serverTimestamp(),
        });
      }
      batch.update(doc.ref, {
        title: `${name} · ${planLabel}`,
        owner_uid: null, owner_name: null,
        stage: stageFrom[d.position] ?? "novo",
        qualification: "a_qualificar", status: "novo",
        source: d.origin === "website" ? "website" : null,
        entry: d.origin === "website" ? "website" : "manual",
        campaign: null, interest_plan: plan, estimated_value_cents: null, expected_close_date: null,
        tags: [], notes: null, contact_id: contactRef.id, company_id: null,
        schema_version: 2, created_by_uid: null, created_by_name: "Website",
        updated_at: FieldValue.serverTimestamp(),
        lead_name: FieldValue.delete(), lead_email: FieldValue.delete(), lead_phone: FieldValue.delete(),
        lead_status: FieldValue.delete(), origin: FieldValue.delete(), position: FieldValue.delete(),
        id_linked_company: FieldValue.delete(),
      });
      await batch.commit();
      converted += 1;
    }
    if (apply) console.log(`Pronto: ${converted} lead(s) convertido(s).`);
    break;
  }
  case "backfill-email-index": {
    // Índice contact_emails/{sha256(email)} → { contact_id } (garante e-mail único entre contatos).
    // Contatos criados antes do índice não têm entrada; aqui ela é criada. E-mails repetidos são só listados.
    const apply = process.argv.includes("--apply");
    const contacts = await db.collection("contacts").select("email").get();
    const byEmail = new Map();
    for (const doc of contacts.docs) {
      const email = typeof doc.get("email") === "string" ? doc.get("email").trim().toLowerCase() : "";
      if (!email) continue;
      byEmail.set(email, [...(byEmail.get(email) ?? []), doc.id]);
    }
    let created = 0;
    for (const [email, ids] of byEmail) {
      if (ids.length > 1) console.log(`  ! e-mail repetido em ${ids.length} contatos: ${ids.join(", ")} (o primeiro vira o dono)`);
      const ref = db.collection("contact_emails").doc(createHash("sha256").update(email).digest("hex"));
      if ((await ref.get()).exists) continue;
      created += 1;
      // Último lead do contato (fluxo "voltou pelo site").
      const leads = await db.collection("leads").where("contact_id", "==", ids[0]).limit(20).get();
      const latest = leads.docs.sort((x, y) => (y.get("created_at")?.toMillis?.() ?? 0) - (x.get("created_at")?.toMillis?.() ?? 0))[0];
      if (apply) await ref.set({ contact_id: ids[0], email, ...(latest ? { latest_lead_id: latest.id } : {}) });
    }
    console.log(`${byEmail.size} e-mail(s) em ${contacts.size} contato(s); ${created} entrada(s) ${apply ? "criada(s)" : "a criar (simulação — use --apply)"}.`);
    break;
  }
  default:
    console.log("Comandos: seed-products | status | migrate-leads [--apply] | backfill-email-index [--apply]");
    process.exit(command ? 1 : 0);
}
