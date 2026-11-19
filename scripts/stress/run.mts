/**
 * Testes de stress do CRM (leads, contatos, empresas, notas, conversões) contra o EMULADOR local
 * do Firestore. Chama as mesmas funções que o site e o painel usam em produção, com carga simultânea,
 * e confere invariantes de integridade ao final de cada cenário (nada perdido, duplicado ou trocado).
 *
 * Rodar:  npm run stress   (sobe o emulador, roda, derruba)
 * Segurança: aborta se FIRESTORE_EMULATOR_HOST não estiver definido — nunca toca a produção.
 */
import { randomUUID } from "node:crypto";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("✗ FIRESTORE_EMULATOR_HOST ausente. Este teste só roda no emulador (npm run stress).");
  process.exit(1);
}
process.env.FIREBASE_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-tecfy";

const { getAdminDb } = await import("../../src/lib/firebaseAdmin");
const { registerWebsiteLead } = await import("../../src/lib/admin/crm/websiteLead");
const leadsLib = await import("../../src/lib/admin/crm/leads");
const { addLeadNote } = await import("../../src/lib/admin/crm/notes");
const { emptyCompanyForm, emptyContactForm, emptyLeadForm, parseCreateLeadPayload } = await import("../../src/lib/admin/crm/validation");
const contactsLib = await import("../../src/lib/admin/crm/contacts");
const companiesLib = await import("../../src/lib/admin/crm/companies");

const db = getAdminDb();
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const ACTOR = { uid: "u_admin", name: "Admin Teste" };
const OWNER = { uid: "u_owner", name: "Ana Ribeiro" };

// ── utilidades ───────────────────────────────────────────────────────────────

interface ScenarioResult {
  name: string;
  ok: boolean;
  ms: number;
  details: string[];
  errors: number;
}
const results: ScenarioResult[] = [];

async function wipe() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`wipe falhou: ${res.status}`);
}

const count = async (path: string) => (await db.collection(path).count().get()).data().count;

/** Roda tudo ao mesmo tempo; devolve sucessos e falhas (com a mensagem). */
async function concurrently<T>(tasks: (() => Promise<T>)[]) {
  const settled = await Promise.allSettled(tasks.map((t) => t()));
  const ok = settled.filter((s): s is PromiseFulfilledResult<Awaited<T>> => s.status === "fulfilled").map((s) => s.value as T);
  const failed = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => String(s.reason?.message ?? s.reason));
  return { ok, failed };
}

async function scenario(name: string, fn: (check: (cond: boolean, msg: string) => void, info: (msg: string) => void) => Promise<number>) {
  await wipe();
  const details: string[] = [];
  let ok = true;
  const check = (cond: boolean, msg: string) => {
    details.push(`${cond ? "✓" : "✗"} ${msg}`);
    if (!cond) ok = false;
  };
  const info = (msg: string) => details.push(`· ${msg}`);
  const start = performance.now();
  let errors = 0;
  try {
    errors = await fn(check, info);
  } catch (error) {
    ok = false;
    details.push(`✗ exceção: ${error instanceof Error ? error.message : String(error)}`);
  }
  const ms = Math.round(performance.now() - start);
  if (errors > 0) ok = false;
  results.push({ name, ok, ms, details, errors });
  console.log(`\n${ok ? "PASSOU" : "FALHOU"} · ${name} · ${ms} ms`);
  for (const d of details) console.log(`   ${d}`);
}

const manualPayload = (i: number, opts: { contactEmail?: string; withCompany?: boolean } = {}) => {
  const body = {
    lead: { ...emptyLeadForm(OWNER.uid), title: `Lead manual ${i}`, email: `manual${i}@teste.dev`, phone: "(11) 99999-0000" },
    contact: { mode: "new", draft: { ...emptyContactForm(), name: `Contato ${i}`, email: opts.contactEmail ?? `contato${i}@teste.dev` } },
    company: opts.withCompany === false ? { mode: "none" } : { mode: "new", draft: { ...emptyCompanyForm(), trade_name: `Empresa ${i}` } },
  };
  const parsed = parseCreateLeadPayload(body, [OWNER.uid]);
  if (!parsed) throw new Error("payload inválido no teste");
  return parsed;
};

// ── cenários ─────────────────────────────────────────────────────────────────

await scenario("1. 300 envios simultâneos do formulário do site (e-mails diferentes)", async (check, info) => {
  const N = 300;
  const inputs = Array.from({ length: N }, (_, i) => ({ name: `Pessoa ${i}`, email: `pessoa${i}@teste.dev`, phone: `119${String(i).padStart(8, "0")}`, plan: "pro" }));
  const { ok, failed } = await concurrently(inputs.map((input) => () => registerWebsiteLead(input)));
  check(failed.length === 0, `${ok.length}/${N} gravados sem erro${failed.length ? ` (erros: ${[...new Set(failed)].slice(0, 3).join(" | ")})` : ""}`);
  check((await count("leads")) === N, `leads = ${await count("leads")} (esperado ${N})`);
  check((await count("contacts")) === N, `contatos = ${await count("contacts")} (esperado ${N})`);
  check((await count("contact_emails")) === N, `índice de e-mail = ${await count("contact_emails")} (esperado ${N})`);
  check((await count("admin_notifications")) === N, `notificações = ${await count("admin_notifications")} (esperado ${N})`);

  // Nada trocado: cada lead aponta para o contato com o MESMO e-mail/telefone/nome.
  const leads = await db.collection("leads").get();
  const contacts = new Map((await db.collection("contacts").get()).docs.map((d) => [d.id, d.data()]));
  let mismatches = 0;
  for (const lead of leads.docs) {
    const d = lead.data();
    const c = contacts.get(d.contact_id);
    if (!c || c.email !== d.email || c.phone !== d.phone || !String(d.title).startsWith(c.name)) mismatches += 1;
  }
  check(mismatches === 0, `vínculo lead ↔ contato correto em todos (divergências: ${mismatches})`);
  info(`${Math.round(N / 1)} gravações concorrentes`);
  return failed.length;
});

await scenario("2. 25 envios simultâneos com o MESMO e-mail (corrida de duplicidade)", async (check) => {
  const N = 25;
  const input = { name: "Maria Repetida", email: "repetida@teste.dev", phone: "11988887777", plan: "starter" };
  const { ok, failed } = await concurrently(Array.from({ length: N }, () => () => registerWebsiteLead(input)));
  check(failed.length === 0, `${ok.length}/${N} processados sem erro${failed.length ? ` (erros: ${[...new Set(failed)].slice(0, 2).join(" | ")})` : ""}`);
  check((await count("contacts")) === 1, `contatos = ${await count("contacts")} (esperado 1 — nenhum duplicado)`);
  check((await count("leads")) === 1, `leads = ${await count("leads")} (esperado 1)`);
  check(ok.filter((r) => !r.returning).length === 1, `exatamente 1 "lead novo" (obtido ${ok.filter((r) => !r.returning).length})`);
  const leadId = ok[0]?.leadId;
  const notes = leadId ? await db.collection(`leads/${leadId}/notes`).count().get() : null;
  check(notes?.data().count === N - 1, `registros "voltou pelo site" = ${notes?.data().count} (esperado ${N - 1})`);
  const returned = await db.collection("admin_notifications").where("type", "==", "lead_returned").count().get();
  check(returned.data().count === N - 1, `notificações "lead voltou" = ${returned.data().count} (esperado ${N - 1})`);
  return failed.length;
});

await scenario("3. 200 'Criar lead' simultâneos + 50 reenvios (idempotência) + 20 com o mesmo e-mail de contato", async (check) => {
  const N = 200;
  const ids = Array.from({ length: N }, () => randomUUID());
  const tasks = ids.map((id, i) => () => leadsLib.createManualLead(manualPayload(i), OWNER, ACTOR, id));
  // 50 reenvios (mesmo request_id) disparados junto
  tasks.push(...ids.slice(0, 50).map((id, i) => () => leadsLib.createManualLead(manualPayload(i), OWNER, ACTOR, id)));
  // 20 leads cujo contato "novo" tem o mesmo e-mail
  const shared = Array.from({ length: 20 }, () => randomUUID());
  tasks.push(...shared.map((id, i) => () => leadsLib.createManualLead(manualPayload(1000 + i, { contactEmail: "compartilhado@teste.dev", withCompany: false }), OWNER, ACTOR, id)));

  const { ok, failed } = await concurrently(tasks);
  check(failed.length === 0, `${ok.length}/${tasks.length} requisições sem erro${failed.length ? ` (erros: ${[...new Set(failed)].slice(0, 2).join(" | ")})` : ""}`);
  const leadsTotal = await count("leads");
  check(leadsTotal === N + 20, `leads = ${leadsTotal} (esperado ${N + 20}: reenvios não duplicaram)`);
  check(ok.filter((r) => !r.created).length === 50, `reenvios reconhecidos = ${ok.filter((r) => !r.created).length} (esperado 50)`);
  check((await count("companies")) === N, `empresas = ${await count("companies")} (esperado ${N})`);
  check((await count("contacts")) === N + 1, `contatos = ${await count("contacts")} (esperado ${N + 1}: os 20 com e-mail igual viraram 1)`);

  // Os 20 do e-mail compartilhado: títulos "Lead manual 1000"…"Lead manual 1019" (filtro exato, não por faixa de texto).
  const sharedLeads = (await db.collection("leads").get()).docs.filter((d) => /^Lead manual 10[01]\d$/.test(String(d.get("title"))));
  const sharedContacts = new Set(sharedLeads.map((d) => d.get("contact_id")));
  check(sharedLeads.length === 20 && sharedContacts.size === 1, `${sharedLeads.length} leads com e-mail igual → ${sharedContacts.size} contato (esperado 20 → 1)`);

  // Vínculos consistentes: todo contact_id/company_id aponta para um documento que existe.
  const leads = await db.collection("leads").get();
  const contactIds = new Set((await db.collection("contacts").select().get()).docs.map((d) => d.id));
  const companyIds = new Set((await db.collection("companies").select().get()).docs.map((d) => d.id));
  const broken = leads.docs.filter((d) => (d.get("contact_id") && !contactIds.has(d.get("contact_id"))) || (d.get("company_id") && !companyIds.has(d.get("company_id"))));
  check(broken.length === 0, `vínculos quebrados: ${broken.length}`);
  return failed.length;
});

async function seedLeads(n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 400) {
    const batch = db.batch();
    for (let j = i; j < Math.min(n, i + 400); j++) {
      const ref = db.collection("leads").doc();
      ids.push(ref.id);
      batch.set(ref, {
        title: `Lead ${j}`,
        stage: "novo",
        qualification: "a_qualificar",
        status: "novo",
        entry: "manual",
        schema_version: 2,
        tags: [],
        created_at: new Date(Date.now() - j * 1000),
      });
    }
    await batch.commit();
  }
  return ids;
}

await scenario("4. Ações em massa concorrentes (conversão dupla, atribuição + etapa + exclusão juntas)", async (check) => {
  const ids = await seedLeads(200);
  // Duas conversões simultâneas dos mesmos 200 leads → só 200 negociações.
  const conv = await concurrently([() => leadsLib.convertLeads(ids, ACTOR), () => leadsLib.convertLeads(ids, ACTOR)]);
  check(conv.failed.length === 0, `conversões sem erro${conv.failed.length ? ` (erros: ${conv.failed.slice(0, 2).join(" | ")})` : ""}`);
  check((await count("deals")) === 200, `negociações = ${await count("deals")} (esperado 200, nenhuma duplicada)`);
  const leads = await db.collection("leads").get();
  const deals = new Map((await db.collection("deals").get()).docs.map((d) => [d.id, d.get("lead_id")]));
  check(leads.docs.every((l) => deals.get(l.get("deal_id")) === l.id), "cada lead aponta para a SUA negociação");

  // Atribuir + mudar etapa + excluir 50 ao mesmo tempo.
  const toDelete = ids.slice(0, 50);
  const ops = await concurrently<unknown>([
    () => leadsLib.assignOwner(ids, OWNER, ACTOR),
    () => leadsLib.updateLeads(ids, { stage: "proposta_enviada" }),
    () => leadsLib.deleteLeads(toDelete),
  ]);
  check(ops.failed.length === 0, `operações simultâneas sem erro${ops.failed.length ? ` (erros: ${ops.failed.slice(0, 2).join(" | ")})` : ""}`);
  const after = await db.collection("leads").get();
  check(after.size === 150, `restaram ${after.size} leads (esperado 150)`);
  check(after.docs.every((d) => d.get("owner_uid") === OWNER.uid), "todos os restantes com responsável");
  check(after.docs.every((d) => d.get("stage") === "proposta_enviada"), "todos os restantes com a etapa nova");
  // Nenhum lead "meio gravado": quem tem responsável tem o registro na timeline.
  let missingNotes = 0;
  for (const d of after.docs) if ((await db.collection(`leads/${d.id}/notes`).count().get()).data().count < 1) missingNotes += 1;
  check(missingNotes === 0, `leads com responsável sem registro na timeline: ${missingNotes}`);
  return conv.failed.length + ops.failed.length;
});

await scenario("5. 500 observações simultâneas no mesmo lead", async (check) => {
  const [leadId] = await seedLeads(1);
  const N = 500;
  const { failed } = await concurrently(Array.from({ length: N }, (_, i) => () => addLeadNote(leadId, `Observação ${i}`, ACTOR)));
  check(failed.length === 0, `${N - failed.length}/${N} gravadas sem erro${failed.length ? ` (erros: ${[...new Set(failed)].slice(0, 2).join(" | ")})` : ""}`);
  const notes = await db.collection(`leads/${leadId}/notes`).get();
  const texts = new Set(notes.docs.map((d) => d.get("text")));
  check(notes.size === N - failed.length && texts.size === notes.size, `${notes.size} registros, todos distintos (nenhuma perdida/duplicada)`);
  return failed.length;
});

await scenario("6. Lista com 5.000 leads em páginas (metade com o MESMO horário) — sem pular nem repetir", async (check, info) => {
  // 2.500 leads com horários distintos + 2.500 com exatamente o mesmo horário (pior caso de cursor).
  const sameInstant = new Date(Date.now() - 10_000_000);
  for (let i = 0; i < 5000; i += 400) {
    const batch = db.batch();
    for (let j = i; j < Math.min(5000, i + 400); j++) {
      batch.set(db.collection("leads").doc(), {
        title: `Lead ${j}`,
        stage: "novo",
        qualification: "a_qualificar",
        status: "novo",
        entry: "manual",
        schema_version: 2,
        tags: ["b2b", "consultoria"],
        notes: "Observação de cadastro com um texto de tamanho realista para medir o payload da lista.",
        created_at: j < 2500 ? new Date(Date.now() - j * 1000) : sameInstant,
      });
    }
    await batch.commit();
  }

  const t = performance.now();
  const seen = new Set<string>();
  let duplicates = 0;
  let pages = 0;
  let biggestKb = 0;
  let cursor: Awaited<ReturnType<typeof leadsLib.listLeadsPage>>["next"] = null;
  do {
    const page = await leadsLib.listLeadsPage(cursor);
    pages += 1;
    biggestKb = Math.max(biggestKb, Math.round(Buffer.byteLength(JSON.stringify(page)) / 1024));
    for (const row of page.rows) {
      if (seen.has(row.id)) duplicates += 1;
      seen.add(row.id);
    }
    cursor = page.next;
  } while (cursor);
  const ms = Math.round(performance.now() - t);

  check(seen.size === 5000, `${seen.size} leads distintos lidos (esperado 5000 — nenhum pulado)`);
  check(duplicates === 0, `leads repetidos entre páginas: ${duplicates}`);
  check(biggestKb < 2048, `maior página: ${biggestKb} KB (abaixo do limite de 2 MB do cache)`);
  info(`${pages} páginas · leitura total: ${ms} ms`);
  return 0;
});

await scenario("7. Dois 'Vincular contato' simultâneos no mesmo lead (só um vence, nada órfão)", async (check) => {
  const [leadId] = await seedLeads(1);
  const link = (i: number) => () =>
    leadsLib.linkLeadRelations(
      leadId,
      { contact: { mode: "new", data: { ...emptyContactForm(), name: `Vínculo ${i}`, email: `vinculo${i}@teste.dev`, phone: null, role: null, preferred_channel: null, notes: null, comm_consent: "nao_informada", company_choice: "__none__" } as never }, company: { mode: "none" } },
      ACTOR,
    );
  const { ok, failed } = await concurrently([link(1), link(2)]);
  check(ok.length === 1 && failed.length === 1, `1 venceu e 1 foi recusado (venceram ${ok.length}, recusados ${failed.length})`);
  const lead = await db.collection("leads").doc(leadId).get();
  const contacts = await db.collection("contacts").get();
  check(contacts.size === 1 && lead.get("contact_id") === contacts.docs[0].id, `1 contato criado e é o do lead (contatos: ${contacts.size})`);
  return 0;
});

await scenario("8. Mesmo e-mail ao mesmo tempo pelo site e pelo cadastro manual (1 contato só)", async (check) => {
  const email = "cruzado@teste.dev";
  const tasks: (() => Promise<unknown>)[] = [];
  for (let i = 0; i < 10; i++) tasks.push(() => registerWebsiteLead({ name: "Pessoa Cruzada", email, phone: "11977776666", plan: "" }));
  for (let i = 0; i < 10; i++) tasks.push(() => leadsLib.createManualLead(manualPayload(2000 + i, { contactEmail: email, withCompany: false }), OWNER, ACTOR, randomUUID()));
  const { failed } = await concurrently(tasks);
  check(failed.length === 0, `20/20 sem erro${failed.length ? ` (erros: ${[...new Set(failed)].slice(0, 2).join(" | ")})` : ""}`);
  const contacts = await db.collection("contacts").where("email", "==", email).get();
  check(contacts.size === 1, `contatos com o e-mail = ${contacts.size} (esperado 1)`);
  const leads = await db.collection("leads").get();
  const linked = new Set(leads.docs.map((d) => d.get("contact_id")));
  check(linked.size === 1 && linked.has(contacts.docs[0]?.id), "todos os leads apontam para esse único contato");
  return failed.length;
});

// ── Contatos e empresas ──────────────────────────────────────────────────────

const contactInput = (i: number, extra: Record<string, unknown> = {}) =>
  ({
    name: `Pessoa ${i}`,
    email: `pessoa${i}@teste.dev`,
    phone: `119${String(i).padStart(8, "0")}`,
    role: null,
    preferred_channel: null,
    notes: null,
    comm_consent: "nao_informada",
    company_choice: "__none__",
    ...extra,
  }) as never;

const companyInput = (i: number, cnpj: string | null, extra: Record<string, unknown> = {}) =>
  ({
    trade_name: `Empresa ${i}`,
    legal_name: null,
    cnpj,
    website: null,
    email: null,
    phone: null,
    segment: null,
    size: null,
    address: { street: null, number: null, zip: null, district: null, city: null, region: null },
    notes: null,
    ...extra,
  }) as never;

// CNPJs válidos (dígitos verificadores corretos) gerados a partir de uma base.
function cnpjFrom(base: number): string {
  const b = String(base).padStart(8, "0") + "0001";
  const calc = (digits: string) => {
    const w = digits.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((acc, x, i) => acc + Number(digits[i]) * x, 0) % 11;
    return sum < 2 ? 0 : 11 - sum;
  };
  const d1 = calc(b);
  return b + d1 + calc(b + d1);
}

await scenario("9. 200 contatos criados ao mesmo tempo + 20 tentando e-mails repetidos", async (check) => {
  const tasks = Array.from({ length: 200 }, (_, i) => () => contactsLib.createContact(contactInput(i), ACTOR));
  tasks.push(...Array.from({ length: 20 }, (_, i) => () => contactsLib.createContact(contactInput(i, { name: `Duplicado ${i}` }), ACTOR)));
  const { ok, failed } = await concurrently(tasks);
  const dupErrors = failed.filter((f) => f === "duplicate_email").length;
  check(ok.length === 200, `${ok.length} contatos criados (esperado 200)`);
  check(dupErrors === 20 && failed.length === 20, `${dupErrors} recusados por e-mail repetido (esperado 20; outros erros: ${failed.length - dupErrors})`);
  check((await count("contacts")) === 200, `contatos no banco = ${await count("contacts")}`);
  check((await count("contact_emails")) === 200, `índice de e-mail = ${await count("contact_emails")}`);
  return failed.length - dupErrors;
});

await scenario("10. Dois contatos trocando para o MESMO e-mail ao mesmo tempo", async (check) => {
  const a = await contactsLib.createContact(contactInput(1), ACTOR);
  const b = await contactsLib.createContact(contactInput(2), ACTOR);
  const target = "disputado@teste.dev";
  const { ok, failed } = await concurrently([
    () => contactsLib.updateContact(a.id, contactInput(1, { email: target }), ACTOR),
    () => contactsLib.updateContact(b.id, contactInput(2, { email: target }), ACTOR),
  ]);
  check(ok.length === 1 && failed.length === 1 && failed[0] === "duplicate_email", `1 conseguiu, 1 recusado por e-mail repetido (ok ${ok.length}, recusados ${failed.join(",")})`);
  const docs = await db.collection("contacts").where("email", "==", target).get();
  check(docs.size === 1, `contatos com o e-mail disputado: ${docs.size} (esperado 1)`);
  const winner = docs.docs[0]?.id;
  const loser = winner === a.id ? b : a;
  const loserDoc = await db.collection("contacts").doc(loser.id).get();
  check(loserDoc.get("email") === loser.email, "o outro continuou com o e-mail antigo");
  // Índices: disputado → vencedor; e-mail antigo do vencedor liberado; o do perdedor intacto.
  const idx = async (email: string) => (await db.collection("contact_emails").where("email", "==", email).get()).docs.map((d) => d.get("contact_id"));
  check(JSON.stringify(await idx(target)) === JSON.stringify([winner]), "índice do e-mail disputado aponta para o vencedor");
  check((await idx(loser.email!)).length === 1, "índice do perdedor intacto");
  const winnerOld = winner === a.id ? a.email! : b.email!;
  check((await idx(winnerOld)).length === 0, "e-mail antigo do vencedor foi liberado");
  return 0;
});

await scenario("11. 50 edições simultâneas no mesmo contato (histórico completo e consistente)", async (check) => {
  const c = await contactsLib.createContact(contactInput(1), ACTOR);
  const { ok, failed } = await concurrently(
    Array.from({ length: 50 }, (_, i) => () => contactsLib.updateContact(c.id, contactInput(1, { phone: `1198888${String(i).padStart(4, "0")}` }), ACTOR)),
  );
  check(failed.length === 0, `${ok.length}/50 edições sem erro${failed.length ? ` (erros: ${[...new Set(failed)].slice(0, 2).join(" | ")})` : ""}`);
  const changed = ok.filter((r) => r.changed).length;
  const notes = await db.collection(`contacts/${c.id}/notes`).orderBy("created_at", "desc").get();
  check(notes.size === changed, `registros no histórico = ${notes.size} (= edições que mudaram algo: ${changed})`);
  const doc = await db.collection("contacts").doc(c.id).get();
  const lastNote = String(notes.docs[0]?.get("text") ?? "");
  const final = String(doc.get("phone"));
  const shown = `(${final.slice(0, 2)}) ${final.slice(2, 7)}-${final.slice(7)}`;
  check(lastNote.includes(`→ ${shown}`), `o último registro do histórico bate com o dado final (${shown})`);
  return failed.length;
});

await scenario("12. 20 empresas com o MESMO CNPJ ao mesmo tempo + 10 'Criar lead' com esse CNPJ", async (check) => {
  const cnpj = cnpjFrom(12345678);
  const tasks: (() => Promise<unknown>)[] = Array.from({ length: 20 }, (_, i) => () => companiesLib.createCompany(companyInput(i, cnpj), ACTOR));
  for (let i = 0; i < 10; i++) {
    const body = {
      lead: { ...emptyLeadForm(OWNER.uid), title: `Lead CNPJ ${i}` },
      contact: { mode: "none" },
      company: { mode: "new", draft: { ...emptyCompanyForm(), trade_name: `Empresa via lead ${i}`, cnpj } },
    };
    const parsed = parseCreateLeadPayload(body, [OWNER.uid]);
    if (!parsed) throw new Error("payload");
    tasks.push(() => leadsLib.createManualLead(parsed, OWNER, ACTOR, randomUUID()));
  }
  const { failed } = await concurrently(tasks);
  const dup = failed.filter((f) => f === "duplicate_cnpj").length;
  check(failed.length === dup, `só recusas por CNPJ repetido (outros erros: ${failed.length - dup})`);
  const companies = await db.collection("companies").where("cnpj", "==", cnpj).get();
  check(companies.size === 1, `empresas com esse CNPJ: ${companies.size} (esperado 1)`);
  const leads = await db.collection("leads").get();
  check(leads.size === 10 && leads.docs.every((l) => l.get("company_id") === companies.docs[0]?.id), "os 10 leads apontam para essa única empresa");
  return failed.length - dup;
});

await scenario("13. Mesmo contato adicionado a 2 empresas ao mesmo tempo (fica em 1, histórico coerente)", async (check) => {
  const c = await contactsLib.createContact(contactInput(1), ACTOR);
  const e1 = await companiesLib.createCompany(companyInput(1, null), ACTOR);
  const e2 = await companiesLib.createCompany(companyInput(2, null), ACTOR);
  const { failed } = await concurrently([
    () => companiesLib.addCompanyMember(e1.id, { mode: "existing", id: c.id }, ACTOR),
    () => companiesLib.addCompanyMember(e2.id, { mode: "existing", id: c.id }, ACTOR),
  ]);
  check(failed.length === 0, "as duas operações terminaram sem erro");
  const doc = await db.collection("contacts").doc(c.id).get();
  const final = doc.get("company_id");
  check(final === e1.id || final === e2.id, "o contato terminou em uma das empresas");
  const members = (id: string) => db.collection("contacts").where("company_id", "==", id).count().get();
  const [m1, m2] = await Promise.all([members(e1.id), members(e2.id)]);
  check(m1.data().count + m2.data().count === 1, `aparece como funcionário em exatamente 1 empresa (${m1.data().count} + ${m2.data().count})`);
  const lastContactNote = (await db.collection(`contacts/${c.id}/notes`).orderBy("created_at", "desc").limit(1).get()).docs[0]?.get("text") ?? "";
  const finalName = final === e1.id ? "Empresa 1" : "Empresa 2";
  check(String(lastContactNote).includes(finalName), `último registro do contato aponta a empresa final (${finalName})`);
  return failed.length;
});

await scenario("14. 30 trocas de status simultâneas (Ativo/Inativo) no mesmo contato", async (check) => {
  const c = await contactsLib.createContact(contactInput(1), ACTOR);
  const { ok, failed } = await concurrently(
    Array.from({ length: 30 }, (_, i) => () => contactsLib.setContactStatus(c.id, i % 2 ? "ativo" : "inativo", ACTOR)),
  );
  check(failed.length === 0, `${ok.length}/30 sem erro`);
  const changes = ok.filter((r) => r.changed).length;
  const notes = await db.collection(`contacts/${c.id}/notes`).orderBy("created_at", "desc").get();
  check(notes.size === changes, `registros = mudanças reais (${notes.size} = ${changes})`);
  const final = (await db.collection("contacts").doc(c.id).get()).get("status");
  const last = String(notes.docs[0]?.get("text") ?? "");
  check(!notes.size || last.endsWith(`${final === "ativo" ? "Ativo" : "Inativo"}.`), `último registro bate com o status final (${final})`);
  return failed.length;
});

await scenario("15. Listas com 5.000 contatos e 5.000 empresas em páginas — sem pular nem repetir", async (check, info) => {
  const sameInstant = new Date(Date.now() - 5_000_000);
  for (const coll of ["contacts", "companies"]) {
    for (let i = 0; i < 5000; i += 400) {
      const batch = db.batch();
      for (let j = i; j < Math.min(5000, i + 400); j++) {
        batch.set(db.collection(coll).doc(), {
          ...(coll === "contacts" ? { name: `Contato ${j}`, email: `c${j}@teste.dev` } : { trade_name: `Empresa ${j}` }),
          status: "ativo",
          created_at: j < 2500 ? new Date(Date.now() - j * 1000) : sameInstant,
        });
      }
      await batch.commit();
    }
  }
  for (const [label, fetchPage] of [
    ["contatos", (c: unknown) => contactsLib.listContactsPage(c as never)],
    ["empresas", (c: unknown) => companiesLib.listCompaniesPage(c as never, new Set())],
  ] as const) {
    const t = performance.now();
    const seen = new Set<string>();
    let dup = 0;
    let biggest = 0;
    let cursor: unknown = null;
    do {
      const page = await fetchPage(cursor);
      biggest = Math.max(biggest, Math.round(Buffer.byteLength(JSON.stringify(page)) / 1024));
      for (const r of page.rows) {
        if (seen.has(r.id)) dup += 1;
        seen.add(r.id);
      }
      cursor = page.next;
    } while (cursor);
    check(seen.size === 5000 && dup === 0, `${label}: ${seen.size} distintos, ${dup} repetidos`);
    check(biggest < 2048, `${label}: maior página ${biggest} KB (< 2 MB do cache)`);
    info(`${label}: leitura completa em ${Math.round(performance.now() - t)} ms`);
  }
  return 0;
});

// ── relatório ────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
console.log(`\n══ ${passed}/${results.length} cenários passaram ══`);
process.exit(passed === results.length ? 0 : 1);
