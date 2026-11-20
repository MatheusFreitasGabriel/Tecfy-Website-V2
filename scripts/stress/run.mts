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

// ── Contador de operações do Firestore (custo real de cada função) ──────────
// Embrulha os métodos do firebase-admin. Use em chamadas SEQUENCIAIS (measure): o "depth" evita
// contar duas vezes quando um método chama outro por dentro (ex.: doc.get → firestore.getAll).
const fsMod = await import("firebase-admin/firestore");
const ops = { reads: 0, writes: 0 };
const { AsyncLocalStorage } = await import("node:async_hooks");
const inside = new AsyncLocalStorage<boolean>();
function wrapRead(proto: Record<string, unknown>, name: string, countOf: (args: unknown[], result: unknown) => number) {
  const original = proto[name] as (...a: unknown[]) => Promise<unknown>;
  proto[name] = function (this: unknown, ...args: unknown[]) {
    // Chamada interna de outra leitura já contada (ex.: doc.get → firestore.getAll): não conta de novo.
    if (inside.getStore()) return original.apply(this, args);
    return inside.run(true, async () => {
      const result = await original.apply(this, args);
      ops.reads += countOf(args, result);
      return result;
    });
  };
}
const refCount = (args: unknown[]) => args.filter((a) => a instanceof fsMod.DocumentReference).length;
const querySize = (result: unknown) => Math.max(1, (result as { size?: number }).size ?? 1);
wrapRead(fsMod.Firestore.prototype as never, "getAll", (args) => refCount(args));
wrapRead(fsMod.Query.prototype as never, "get", (_a, r) => querySize(r));
wrapRead(fsMod.Transaction.prototype as never, "getAll", (args) => refCount(args));
wrapRead(fsMod.Transaction.prototype as never, "get", (args, r) => (args[0] instanceof fsMod.DocumentReference ? 1 : querySize(r)));
for (const name of ["set", "create", "update", "delete"]) {
  const proto = fsMod.WriteBatch.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const original = proto[name];
  proto[name] = function (this: unknown, ...args: unknown[]) {
    ops.writes++;
    return original.apply(this, args);
  };
}

interface Cost {
  name: string;
  reads: number;
  writes: number;
  ms: number;
  budget: { reads: number; writes: number };
}
const costs: Cost[] = [];
/** Mede leituras/gravações/tempo de UMA chamada e confere o orçamento. */
async function measure<T>(name: string, budget: { reads: number; writes: number }, fn: () => Promise<T>): Promise<T> {
  ops.reads = 0;
  ops.writes = 0;
  const t = performance.now();
  const result = await fn();
  costs.push({ name, reads: ops.reads, writes: ops.writes, ms: Math.round(performance.now() - t), budget });
  return result;
}
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

// ── Negociações (quadros, funis, Kanban, conversão, tarefas) ─────────────────

const dealsLib = await import("../../src/lib/admin/crm/deals");
const { emptyDealForm, validateDealForm, brazilDateTime } = await import("../../src/lib/admin/crm/dealValidation");

const OWNER_UIDS = [OWNER.uid, ACTOR.uid];

/** Funil padrão (criado na 1ª leitura) e os dados de negociação válidos. */
async function defaultPipeline() {
  const setup = await dealsLib.listPipelineSetup();
  return setup.pipelines.find((p) => p.id === dealsLib.DEFAULT_PIPELINE_ID)!;
}

function dealCore(pipeline: { id: string; stages: { id: string }[] }, title: string, stageIndex = 0) {
  const form = { ...emptyDealForm(OWNER.uid, "comercial", pipeline.id, pipeline.stages[stageIndex].id), title, value: "R$ 1.000,00" };
  const parsed = validateDealForm(form, OWNER_UIDS, [pipeline as never]);
  if (!parsed.ok) throw new Error("deal form inválido: " + JSON.stringify(parsed.errors));
  return parsed.value;
}

async function seedContact(name: string) {
  const ref = db.collection("contacts").doc();
  await ref.set({ name, email: null, status: "ativo", created_at: new Date() });
  return ref.id;
}

const historyCount = async (dealId: string) => (await db.collection(`deals/${dealId}/history`).count().get()).data().count;

await scenario("16. 20 aberturas simultâneas (funil padrão) + 30 conversões do MESMO lead (tela nova + ação em massa)", async (check) => {
  const setups = await concurrently(Array.from({ length: 20 }, () => () => dealsLib.listPipelineSetup()));
  check(setups.failed.length === 0, `20 aberturas sem erro (${setups.failed.length} falhas)`);
  check((await count("boards")) === 1 && (await count("pipelines")) === 1, "1 quadro e 1 funil padrão (sem duplicar)");

  const pipeline = await defaultPipeline();
  const [leadId] = await seedLeads(1);
  const contactId = await seedContact("Maria Teste");
  await db.collection("leads").doc(leadId).update({ contact_id: contactId });

  const viaModal = Array.from({ length: 20 }, () => () =>
    dealsLib.convertLeadToDeal({ lead_id: leadId, deal: dealCore(pipeline, "Conversão"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR),
  );
  const viaBulk = Array.from({ length: 10 }, () => () => leadsLib.convertLeads([leadId], ACTOR));
  const { ok, failed } = await concurrently<unknown>([...viaModal, ...viaBulk]);
  const created = ok.filter((r) => (Array.isArray(r) ? r.length > 0 : Boolean(r))).length;
  check(created === 1, `exatamente 1 conversão venceu (${created})`);
  check(failed.every((f) => f.includes("already_converted")), `as demais recusadas como "já convertido" (${failed.length} recusas)`);
  check((await count("deals")) === 1, "1 negociação só");
  const lead = await db.collection("leads").doc(leadId).get();
  const dealId = lead.get("deal_id") as string;
  check(typeof dealId === "string" && dealId.startsWith(`l_${leadId}_`) && (await db.collection("deals").doc(dealId).get()).exists, "lead aponta para a negociação criada");
  check((await historyCount(dealId)) === 1, "1 registro de criação no histórico");
  return 0;
});

await scenario("17. 300 negociações manuais simultâneas + 100 reenvios do mesmo pedido (idempotência)", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("Cliente");
  const ids = Array.from({ length: 300 }, () => randomUUID());
  const tasks = [...ids, ...ids.slice(0, 100)].map((id, i) => () =>
    dealsLib.createDeal({ request_id: id, deal: dealCore(pipeline, `Neg ${i}`, i % pipeline.stages.length), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR),
  );
  const { ok, failed } = await concurrently(tasks);
  check(failed.length === 0, `sem erros (${failed.length})`);
  check(ok.filter((r) => r.created).length === 300, "300 criadas, reenvios não duplicaram");
  check((await count("deals")) === 300, "300 documentos de negociação");
  const histories = await Promise.all(ids.slice(0, 50).map((id) => historyCount(`d_${id}`)));
  check(histories.every((n) => n === 1), "cada negociação tem 1 registro de criação");
  const missing = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "x"), custom: {}, contact_id: "nao_existe", company_id: null }, OWNER, ACTOR).then(
    () => false,
    (e) => e instanceof dealsLib.MissingLinkError,
  );
  check(missing, "contato inexistente é recusado");
  return 0;
});

await scenario("18. 400 arrastos simultâneos no Kanban (50 negociações × 8) — nenhuma atualização perdida", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("C");
  const created = await Promise.all(
    Array.from({ length: 50 }, (_, i) => dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, `K${i}`), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR)),
  );
  const moves = created.flatMap(({ id }) =>
    Array.from({ length: 8 }, (_, k) => () => dealsLib.moveDeal({ deal_id: id, stage_id: pipeline.stages[(k + 1) % pipeline.stages.length].id, position: k * 10 + Math.random(), version: 1 }, ACTOR)),
  );
  const { ok, failed } = await concurrently(moves);
  check(failed.length === 0, `400 arrastos sem erro (${failed.length} falhas)`);
  const snaps = await db.getAll(...created.map(({ id }) => db.collection("deals").doc(id)));
  const stageIds = new Set(pipeline.stages.map((s) => s.id));
  check(snaps.every((s) => stageIds.has(s.get("stage_id"))), "toda negociação está numa etapa válida");
  check(snaps.every((s) => s.get("version") === 9), "versão = 1 + 8 movimentos em todas (nada perdido)");
  check(ok.length === 400, "400 respostas de movimento");
  return 0;
});

await scenario("19. Etapa removida do funil enquanto 120 arrastos vão para ela", async (check, info) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("C");
  const created = await Promise.all(
    Array.from({ length: 40 }, (_, i) => dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, `R${i}`), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR)),
  );
  const target = pipeline.stages[2];
  const keep = pipeline.stages.filter((s) => s.id !== target.id);
  const moves = created.flatMap(({ id }) => Array.from({ length: 3 }, (_, k) => () => dealsLib.moveDeal({ deal_id: id, stage_id: target.id, position: k, version: 1 }, ACTOR)));
  const edit = () => dealsLib.updatePipeline(pipeline.id, { board_id: pipeline.board_id, name: pipeline.name, description: null, stages: keep, custom_fields: [] }, { [target.id]: keep[0].id }, ACTOR);
  const { failed } = await concurrently<unknown>([...moves.slice(0, 60), edit, ...moves.slice(60)]);
  info(`${failed.length} arrastos recusados porque a etapa já não existia`);
  check(failed.every((f) => f === "pipeline_changed"), `toda recusa foi "etapa não existe mais" (${failed.length})`);
  const snaps = await db.collection("deals").get();
  const valid = new Set(keep.map((s) => s.id));
  const orphans = snaps.docs.filter((d) => !valid.has(d.get("stage_id"))).length;
  check(orphans === 0, `nenhuma negociação ficou na etapa removida (${orphans})`);
  const fresh = await defaultPipeline();
  check(fresh.stages.length === keep.length, "funil salvo com uma etapa a menos");
  return 0;
});

await scenario("20. Ações em massa concorrentes em 200 negociações (status, responsável, etapa, estrelas)", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("C");
  const created = await Promise.all(
    Array.from({ length: 200 }, (_, i) => dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, `B${i}`), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR)),
  );
  const ids = created.map((c) => c.id);
  const half = ids.slice(0, 100);
  const { failed } = await concurrently<string[]>([
    () => dealsLib.bulkUpdateDeals({ action: "set_status", ids, value: "pausada" }, null, ACTOR),
    () => dealsLib.bulkUpdateDeals({ action: "set_owner", ids, value: ACTOR.uid }, ACTOR, ACTOR),
    () => dealsLib.bulkUpdateDeals({ action: "set_stage", ids: half, value: pipeline.stages[3].id }, null, ACTOR),
    () => dealsLib.bulkUpdateDeals({ action: "set_qualification", ids, value: 5 }, null, ACTOR),
  ]);
  check(failed.length === 0, `4 ações simultâneas sem erro (${failed.length})`);
  const snaps = await db.getAll(...ids.map((id) => db.collection("deals").doc(id)));
  check(snaps.every((s) => s.get("status") === "pausada" && s.get("owner_uid") === ACTOR.uid && s.get("qualification") === 5), "status, responsável e estrelas aplicados em todas");
  check(snaps.slice(0, 100).every((s) => s.get("stage_id") === pipeline.stages[3].id), "etapa aplicada nas 100 escolhidas");
  const histories = await Promise.all(snaps.slice(0, 40).map((s) => historyCount(s.id)));
  check(
    snaps.slice(0, 40).every((s, i) => histories[i] === s.get("version")),
    "histórico coerente: 1 registro por alteração (versão = criação + alterações)",
  );
  return 0;
});

await scenario("21. Lista com 2.000 negociações em páginas (metade com o MESMO horário) — sem pular nem repetir", async (check, info) => {
  const same = new Date();
  for (let i = 0; i < 2000; i += 400) {
    const batch = db.batch();
    for (let j = i; j < i + 400; j++) {
      batch.set(db.collection("deals").doc(), { title: `P${j}`, status: "em_andamento", created_at: j % 2 ? same : new Date(Date.now() - j * 1000) });
    }
    await batch.commit();
  }
  const seen = new Set<string>();
  let dup = 0;
  let biggest = 0;
  let cursor: Parameters<typeof dealsLib.listDealsPage>[0] = null;
  const t = performance.now();
  do {
    const page = await dealsLib.listDealsPage(cursor);
    biggest = Math.max(biggest, Math.round(JSON.stringify(page.rows).length / 1024));
    for (const r of page.rows) {
      if (seen.has(r.id)) dup++;
      else seen.add(r.id);
    }
    cursor = page.next;
  } while (cursor);
  check(seen.size === 2000 && dup === 0, `${seen.size} distintas, ${dup} repetidas`);
  check(biggest < 2048, `maior página ${biggest} KB (< 2 MB do cache)`);
  const placed = dealsLib.placeDeals([...seen].slice(0, 5).map((id) => ({ id, pipeline_id: null, stage_id: null, task_due: [] }) as never), (await dealsLib.listPipelineSetup()).pipelines, []);
  check(placed.every((d) => d.pipeline_id === dealsLib.DEFAULT_PIPELINE_ID && d.stage_id), "negociações antigas (sem funil) caem no funil padrão");
  info(`leitura completa em ${Math.round(performance.now() - t)} ms`);
  return 0;
});

await scenario("22. 300 tarefas simultâneas em 30 negociações + 100 conclusões em paralelo", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("C");
  const created = await Promise.all(
    Array.from({ length: 30 }, (_, i) => dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, `T${i}`), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR)),
  );
  const due = brazilDateTime("2030-01-15", "10:00");
  const { ok, failed } = await concurrently(
    Array.from({ length: 300 }, (_, i) => () => dealsLib.createTask({ deal_id: created[i % 30].id, title: `Tarefa ${i}`, type: "follow_up", due_at: due, assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR)),
  );
  check(failed.length === 0 && ok.length === 300, `300 tarefas criadas (${failed.length} falhas)`);
  const toFinish = ok.slice(0, 100);
  const done = await concurrently(toFinish.flatMap((t) => [() => dealsLib.setTaskDone(t.id, true, ACTOR), () => dealsLib.setTaskDone(t.id, true, ACTOR)]));
  check(done.failed.length === 0, "conclusões (inclusive duplicadas) sem erro");
  const open = await dealsLib.listOpenTaskDue();
  check(open.length === 200, `200 tarefas abertas nos indicadores (${open.length})`);
  const histories = await Promise.all(created.map((c) => historyCount(c.id)));
  const total = histories.reduce((a, n) => a + n, 0);
  check(total === 30 + 300 + 100, `histórico: 30 criações + 300 tarefas + 100 conclusões, sem duplicar (${total})`);
  const ghost = await dealsLib.createTask({ deal_id: "nao_existe", title: "x", type: "outro", due_at: due, assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR).then(
    () => false,
    (e) => e.message === "parent_not_found",
  );
  check(ghost, "tarefa em negociação inexistente é recusada");
  return 0;
});

// ── Página da negociação (edição, venda, perda, vínculos, registros) ─────────

const detailLib = await import("../../src/lib/admin/crm/dealDetail");
const { parseUploadRequest } = await import("../../src/lib/admin/crm/dealValidation");
const { DEAL_FILE_TYPES, DEAL_FILE_MAX_BYTES } = await import("../../src/lib/admin/crm/options");

async function seedCompany(name: string) {
  const ref = db.collection("companies").doc();
  await ref.set({ trade_name: name, status: "ativo", created_at: new Date() });
  return ref.id;
}

await scenario("23. 50 edições simultâneas da MESMA versão (só 1 vence; nenhuma sobrescreve outra sem saber)", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("C");
  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Edit"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR);
  const { ok, failed } = await concurrently(Array.from({ length: 50 }, (_, i) => () => detailLib.updateDeal(id, 1, { title: `Título ${i}`, value_cents: (i + 1) * 100 }, null, ACTOR)));
  check(ok.length === 1, `exatamente 1 edição aplicada (${ok.length})`);
  check(failed.length === 49 && failed.every((f) => f === "stale"), `49 recusadas como "alterada por outra pessoa" (${failed.length})`);
  const snap = await db.collection("deals").doc(id).get();
  check(snap.get("version") === 2, "versão 2 (criação + 1 edição)");
  check((await historyCount(id)) === 3, "histórico: criação + nome + valor (3)");
  return 0;
});

await scenario("24. Venda com clique duplo (20 simultâneos) → 1 contrato; desfazer remove; perda depois da venda é recusada", async (check) => {
  const pipeline = await defaultPipeline();
  const companyId = await seedCompany("Padaria");
  const product = db.collection("products").doc("plano_teste");
  await product.set({ name: "Plano Teste", monthly_price: 199, active: true, sort: 1 });
  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Venda"), custom: {}, contact_id: null, company_id: companyId }, OWNER, ACTOR);

  const won = await concurrently(Array.from({ length: 20 }, () => () => detailLib.markDealWon(id, { product_id: "plano_teste", product_name: null, monthly_cents: 19900, signed_date: "2026-11-19" }, ACTOR)));
  check(won.failed.length === 0, `20 cliques sem erro (${won.failed.length})`);
  const contracts = await db.collection("contracts").where("deal_id", "==", id).get();
  check(contracts.size === 1, `1 contrato só (${contracts.size})`);
  const c = contracts.docs[0];
  check(c?.get("company_id") === companyId && c?.get("status") === "active" && c?.get("monthly_value") === 199, "contrato ativo, da empresa, R$ 199/mês");
  const wonHistory = (await db.collection(`deals/${id}/history`).where("type", "==", "won").get()).size;
  check(wonHistory === 1, `1 registro de venda no histórico (${wonHistory})`);

  const lostAfter = await detailLib.markDealLost(id, "preco", null, ACTOR).then(
    () => "ok",
    (e) => e.message,
  );
  check(lostAfter === "deal_closed", "marcar perda numa negociação vendida é recusado");

  await detailLib.reopenDeal(id, ACTOR);
  check((await db.collection("contracts").where("deal_id", "==", id).get()).empty, "desfazer venda remove o contrato do faturamento");
  check((await db.collection("deals").doc(id).get()).get("status") === "em_andamento", "volta para Em andamento");

  const { id: noCompany } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Sem empresa"), custom: {}, contact_id: await seedContact("X"), company_id: null }, OWNER, ACTOR);
  const needs = await detailLib.markDealWon(noCompany, { product_id: "plano_teste", product_name: null, monthly_cents: 100, signed_date: "2026-11-19" }, ACTOR).then(
    () => "ok",
    (e) => e.message,
  );
  check(needs === "needs_company", "venda sem empresa é recusada (contrato precisa de empresa)");
  return 0;
});

await scenario("25. Duas empresas vinculadas ao mesmo tempo (só 1 vence) + 200 registros simultâneos no histórico", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("C");
  const [a, b] = await Promise.all([seedCompany("A"), seedCompany("B")]);
  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Link"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR);
  const link = await concurrently([a, b].map((companyId) => async () => {
    const version = (await db.collection("deals").doc(id).get()).get("version");
    return detailLib.updateDeal(id, version, { company_id: companyId }, null, ACTOR);
  }));
  check(link.ok.length === 1, `1 vínculo aplicado (${link.ok.length}; recusas: ${link.failed.join(", ")})`);
  const company = (await db.collection("deals").doc(id).get()).get("company_id");
  check(company === a || company === b, "negociação ficou com uma das empresas");

  const logs = await concurrently(Array.from({ length: 200 }, (_, i) => () => detailLib.logDealActivity(id, i % 3 === 0 ? "whatsapp" : i % 3 === 1 ? "call" : "note", `registro ${i}`, ACTOR)));
  check(logs.failed.length === 0, `200 registros sem erro (${logs.failed.length})`);
  const history = await detailLib.listDealHistory(id);
  check(history.filter((h) => /^registro /.test(h.description ?? "")).length === 200, "todos os 200 aparecem no histórico");
  const ghost = await detailLib.logDealActivity("nao_existe", "note", "x", ACTOR).then(
    () => "ok",
    (e) => e.message,
  );
  check(ghost === "deal_not_found", "registro em negociação inexistente é recusado");
  return 0;
});

await scenario("26. Nomes de arquivo maliciosos e tipos proibidos são barrados antes do upload", async (check) => {
  const pdf = "application/pdf";
  const cases: [Record<string, unknown>, string | null][] = [
    [{ name: "../../etc/passwd.pdf", size: 10, mime: pdf, kind: "proposta" }, "passwd.pdf"],
    [{ name: "Proposta <script>.pdf", size: 10, mime: pdf, kind: "proposta" }, "Proposta script.pdf"],
    [{ name: "contrato.exe", size: 10, mime: pdf, kind: "arquivo" }, "contrato.pdf"],
    [{ name: "virus.exe", size: 10, mime: "application/x-msdownload", kind: "arquivo" }, null],
    [{ name: "foto.png", size: 10, mime: "image/png", kind: "arquivo" }, null],
    [{ name: "grande.pdf", size: DEAL_FILE_MAX_BYTES + 1, mime: pdf, kind: "arquivo" }, null],
    [{ name: "vazio.pdf", size: 0, mime: pdf, kind: "arquivo" }, null],
    [{ name: "ok.docx", size: 10, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "qualquer" }, null],
  ];
  for (const [input, expected] of cases) {
    const result = parseUploadRequest(input, DEAL_FILE_TYPES, DEAL_FILE_MAX_BYTES);
    check((result?.name ?? null) === expected, `${String(input.name)} (${String(input.mime)}) → ${result?.name ?? "recusado"}`);
  }
  return 0;
});

// ── Faxina: tempo por etapa, pausar, venda livre, excluir, tarefas ──────────

await scenario("27. Tempo por etapa acumula certo (arrastos concorrentes + mudança pela página)", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("C");
  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Tempo"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR);
  // Simula que entrou na etapa 1 há 3 dias.
  await db.collection("deals").doc(id).update({ stage_entered_at: new Date(Date.now() - 3 * 86_400_000) });
  const [s1, s2, s3] = pipeline.stages;
  await dealsLib.moveDeal({ deal_id: id, stage_id: s2.id, position: 1, version: 1 }, ACTOR);
  await db.collection("deals").doc(id).update({ stage_entered_at: new Date(Date.now() - 2 * 86_400_000) });
  const version = (await db.collection("deals").doc(id).get()).get("version");
  await detailLib.updateDeal(id, version, { stage_id: s3.id }, null, ACTOR);
  const snap = await db.collection("deals").doc(id).get();
  const time = snap.get("stage_time") ?? {};
  const days = (ms: number) => Math.floor(ms / 86_400_000);
  check(days(time[s1.id] ?? 0) === 3, `etapa 1: 3 dias (${days(time[s1.id] ?? 0)})`);
  check(days(time[s2.id] ?? 0) === 2, `etapa 2: 2 dias (${days(time[s2.id] ?? 0)})`);
  check(snap.get("stage_id") === s3.id && time[s3.id] === undefined, "etapa atual sem tempo acumulado (conta desde a entrada)");

  // 30 arrastos simultâneos ida/volta: o tempo nunca fica negativo nem some.
  const moves = Array.from({ length: 30 }, (_, k) => () => dealsLib.moveDeal({ deal_id: id, stage_id: k % 2 ? s1.id : s2.id, position: k, version: 0 }, ACTOR));
  const { failed } = await concurrently(moves);
  check(failed.length === 0, `30 arrastos sem erro (${failed.length})`);
  const after = (await db.collection("deals").doc(id).get()).get("stage_time") ?? {};
  check(Object.values(after).every((v) => typeof v === "number" && v >= 0), "todos os tempos são números ≥ 0");
  check(days(after[s1.id] ?? 0) >= 3 && days(after[s2.id] ?? 0) >= 2, "os dias já acumulados foram preservados");
  return 0;
});

await scenario("28. Pausar com data de retomada (10 cliques ao mesmo tempo) → 1 pausa e 1 tarefa; retomar", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("C");
  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Pausa"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR);
  const { failed } = await concurrently(Array.from({ length: 10 }, () => () => detailLib.pauseDeal(id, { reason: "Férias do cliente", resume_date: "2030-02-01" }, ACTOR)));
  check(failed.length === 0, `10 cliques sem erro (${failed.length})`);
  const snap = await db.collection("deals").doc(id).get();
  check(snap.get("status") === "pausada" && snap.get("paused_until") === "2030-02-01", "pausada até 01/02/2030");
  const tasks = await db.collection("tasks").where("deal_id", "==", id).get();
  check(tasks.size === 1 && tasks.docs[0].get("title") === "Retomar negociação", `1 tarefa "Retomar negociação" (${tasks.size})`);
  check(tasks.docs[0]?.get("assignee_uid") === OWNER.uid, "tarefa para o responsável da negociação");
  await detailLib.resumeDeal(id, ACTOR);
  const resumed = await db.collection("deals").doc(id).get();
  check(resumed.get("status") === "em_andamento" && resumed.get("paused_until") === null, "retomada: em andamento, sem data de pausa");
  const types = (await detailLib.listDealHistory(id)).map((h) => h.title);
  check(types.includes("Negociação pausada") && types.includes("Negociação retomada"), "pausa e retomada no histórico");
  const bad = (await import("../../src/lib/admin/crm/dealValidation")).parsePause({ resume_date: "2001-01-01" });
  check("errors" in bad, "data de retomada no passado é recusada");
  return 0;
});

await scenario("29. Venda com descrição livre (sem produto) + clique duplo → 1 contrato", async (check) => {
  const pipeline = await defaultPipeline();
  const companyId = await seedCompany("Mercado");
  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Livre"), custom: {}, contact_id: null, company_id: companyId }, OWNER, ACTOR);
  const { failed } = await concurrently(Array.from({ length: 10 }, () => () => detailLib.markDealWon(id, { product_id: null, product_name: "Sistema sob medida", monthly_cents: 350000, signed_date: "2026-11-19" }, ACTOR)));
  check(failed.length === 0, `10 cliques sem erro (${failed.length})`);
  const contracts = await db.collection("contracts").where("deal_id", "==", id).get();
  check(contracts.size === 1, `1 contrato (${contracts.size})`);
  const c = contracts.docs[0];
  check(c?.get("product_name") === "Sistema sob medida" && c?.get("product_id") === "" && c?.get("monthly_value") === 3500, "contrato com a descrição e R$ 3.500/mês");
  const { parseWon } = await import("../../src/lib/admin/crm/dealValidation");
  check("errors" in parseWon({ monthly_value: "R$ 10,00", signed_date: "2026-11-19" }), "sem produto e sem descrição é recusado");
  return 0;
});

await scenario("30. Excluir negociação: limpa histórico/tarefas, lead volta a ser convertível; vendida é recusada", async (check) => {
  const pipeline = await defaultPipeline();
  const [leadId] = await seedLeads(1);
  const contactId = await seedContact("C");
  const { id } = await dealsLib.convertLeadToDeal({ lead_id: leadId, deal: dealCore(pipeline, "Excluir"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR);
  const due = brazilDateTime("2030-01-15", "10:00");
  const created = await Promise.all(Array.from({ length: 5 }, (_, i) => dealsLib.createTask({ deal_id: id, title: `T${i}`, type: "outro", due_at: due, assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR)));
  await detailLib.updateTask(created[0].id, { title: "T0 reagendada", type: "ligacao", due_at: brazilDateTime("2030-01-20", "15:00"), notes: null }, OWNER, ACTOR);
  const t0 = await db.collection("tasks").doc(created[0].id).get();
  check(t0.get("title") === "T0 reagendada" && t0.get("type") === "ligacao", "tarefa editada e reagendada");
  await detailLib.deleteTask(created[1].id, ACTOR);
  check(!(await db.collection("tasks").doc(created[1].id).get()).exists, "tarefa excluída");
  const titles = (await detailLib.listDealHistory(id)).map((h) => h.title);
  check(titles.includes("Tarefa reagendada") && titles.includes("Tarefa excluída"), "reagendar e excluir tarefa no histórico");

  await detailLib.deleteDeal(id, ACTOR);
  check(!(await db.collection("deals").doc(id).get()).exists, "negociação apagada");
  check((await historyCount(id)) === 0, "histórico apagado");
  check((await db.collection("tasks").where("deal_id", "==", id).get()).empty, "tarefas apagadas");
  const lead = await db.collection("leads").doc(leadId).get();
  check(lead.exists && lead.get("deal_id") === null, "lead continua e pode ser convertido de novo");
  const again = await dealsLib.convertLeadToDeal({ lead_id: leadId, deal: dealCore(pipeline, "De novo"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR).then(
    () => "ok",
    (e) => e.message,
  );
  check(again === "ok", "lead reconvertido sem erro");

  const companyId = await seedCompany("Vendida");
  const { id: sold } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Vendida"), custom: {}, contact_id: null, company_id: companyId }, OWNER, ACTOR);
  await detailLib.markDealWon(sold, { product_id: null, product_name: "X", monthly_cents: 100, signed_date: "2026-11-19" }, ACTOR);
  const blocked = await detailLib.deleteDeal(sold, ACTOR).then(
    () => "ok",
    (e) => e.message,
  );
  check(blocked === "deal_sold", "negociação vendida não pode ser excluída");
  return 0;
});

await scenario("31. Mover negociação para outro funil (10 abas ao mesmo tempo → 1 vence) + mover 100 em massa", async (check) => {
  const pipeline = await defaultPipeline();
  const other = await dealsLib.createPipeline(
    { board_id: pipeline.board_id, name: "Pós-venda", description: null, stages: [{ id: "onboard1", name: "Onboarding", color: "slate", probability: 90 }, { id: "acomp001", name: "Acompanhamento", color: "slate", probability: 95 }], custom_fields: [] },
    ACTOR,
  );
  const contactId = await seedContact("C");
  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Mover"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR);
  await db.collection("deals").doc(id).update({ stage_entered_at: new Date(Date.now() - 4 * 86_400_000) });
  const { ok, failed } = await concurrently(Array.from({ length: 10 }, () => () => detailLib.moveDealToPipeline(id, { pipeline_id: other.id, stage_id: "acomp001", version: 1 }, ACTOR)));
  check(ok.length === 1 && failed.every((f) => f === "stale"), `1 movimento aplicado, ${failed.length} recusados como desatualizados`);
  const snap = await db.collection("deals").doc(id).get();
  check(snap.get("pipeline_id") === other.id && snap.get("stage_id") === "acomp001", "está no funil Pós-venda › Acompanhamento");
  check(Math.floor((snap.get("stage_time")?.[pipeline.stages[0].id] ?? 0) / 86_400_000) === 4, "os 4 dias da etapa anterior ficaram guardados");
  const moved = (await detailLib.listDealHistory(id)).filter((h) => h.type === "pipeline");
  check(moved.length === 1 && /Vendas.*→.*Pós-venda/.test(moved[0].description ?? ""), `histórico "funil de → para" (${moved[0]?.description})`);

  const many = await Promise.all(Array.from({ length: 100 }, (_, i) => dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, `M${i}`), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR)));
  const ids = many.map((m) => m.id);
  const res = await dealsLib.bulkUpdateDeals({ action: "set_pipeline", ids, value: `${other.id}:onboard1`, pipeline_id: other.id, stage_id: "onboard1" }, null, ACTOR);
  check(res.length === 100, `100 movidas em massa (${res.length})`);
  const snaps = await db.getAll(...ids.map((x) => db.collection("deals").doc(x)));
  check(snaps.every((s) => s.get("pipeline_id") === other.id && s.get("stage_id") === "onboard1"), "todas no Pós-venda › Onboarding");
  const bad = await dealsLib.bulkUpdateDeals({ action: "set_pipeline", ids: ids.slice(0, 2), value: `${other.id}:naoexiste`, pipeline_id: other.id, stage_id: "naoexiste" }, null, ACTOR).then(
    () => "ok",
    (e) => e.message,
  );
  check(bad === "pipeline_changed", "etapa inexistente no funil de destino é recusada");
  return 0;
});

// ── SUPER TESTES: custo por função, ciclo completo, concorrência cruzada, telas dependentes ──

const { getDashboardMetrics } = await import("../../src/lib/admin/crm/contracts");

await scenario("32. Custo de cada função (leituras/gravações no Firestore) dentro do orçamento", async (check, info) => {
  await measure("Abrir Kanban: quadros e funis (1ª vez cria o padrão)", { reads: 10, writes: 2 }, () => dealsLib.listPipelineSetup());
  await measure("Abrir Kanban: quadros e funis", { reads: 10, writes: 0 }, () => dealsLib.listPipelineSetup());
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("Custo");
  const companyId = await seedCompany("Custo Ltda");
  const [leadId] = await seedLeads(1);
  await db.collection("leads").doc(leadId).update({ contact_id: contactId, company_id: companyId });
  await db.collection("products").doc("p_custo").set({ name: "Plano Custo", monthly_price: 99, active: true, sort: 1 });

  const { id } = await measure("Criar negociação manual", { reads: 4, writes: 2 }, () =>
    dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Custo"), custom: {}, contact_id: contactId, company_id: companyId }, OWNER, ACTOR),
  );
  const converted = await measure("Converter lead", { reads: 5, writes: 4 }, () =>
    dealsLib.convertLeadToDeal({ lead_id: leadId, deal: dealCore(pipeline, "Convertida"), custom: {}, contact_id: contactId, company_id: companyId }, OWNER, ACTOR),
  );
  await measure("Arrastar no Kanban (muda etapa)", { reads: 2, writes: 2 }, () => dealsLib.moveDeal({ deal_id: id, stage_id: pipeline.stages[1].id, position: 5, version: 1 }, ACTOR));
  await measure("Arrastar no Kanban (só reordena)", { reads: 2, writes: 1 }, () => dealsLib.moveDeal({ deal_id: id, stage_id: pipeline.stages[1].id, position: 9, version: 2 }, ACTOR));
  await measure("Estrela no card (1 negociação)", { reads: 1, writes: 2 }, () => dealsLib.bulkUpdateDeals({ action: "set_qualification", ids: [id], value: 4 }, null, ACTOR));
  for (let i = 0; i < 5; i++) await dealsLib.createTask({ deal_id: id, title: `T${i}`, type: "follow_up", due_at: brazilDateTime("2030-01-1" + i, "10:00"), assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR);
  for (let i = 0; i < 40; i++) await detailLib.logDealActivity(id, "note", `nota ${i}`, ACTOR);

  // Abrir a página da negociação (o que a página faz, em paralelo, otimizado).
  await measure("Abrir página da negociação (tudo)", { reads: 80, writes: 0 }, async () => {
    const tasks = await dealsLib.listDealTasks(id);
    await Promise.all([detailLib.getDealDetail(id, { openTaskDue: tasks.filter((t) => !t.done_at).map((t) => t.due_at) }), detailLib.listDealHistory(id, 50), detailLib.listDealFiles(id)]);
  });
  await measure("  ↳ detalhe (sem buscar tarefas de novo)", { reads: 6, writes: 0 }, () => detailLib.getDealDetail(id, { openTaskDue: [] }));
  await measure("  ↳ histórico: 50 mais recentes", { reads: 50, writes: 0 }, () => detailLib.listDealHistory(id, 50));
  await measure("Recarregar histórico após ação (15)", { reads: 15, writes: 0 }, () => detailLib.listDealHistory(id, 15));
  const version = (await db.collection("deals").doc(id).get()).get("version");
  await measure("Editar negociação (valor + data)", { reads: 2, writes: 3 }, () => detailLib.updateDeal(id, version, { value_cents: 123400, expected_close_date: "2030-03-01" }, null, ACTOR));
  await measure("Mudar etapa pela página", { reads: 2, writes: 2 }, async () => {
    const v = (await db.collection("deals").doc(id).get()).get("version");
    ops.reads = 0;
    return detailLib.updateDeal(id, v, { stage_id: pipeline.stages[2].id }, null, ACTOR);
  });
  const task = await measure("Criar tarefa", { reads: 2, writes: 2 }, () => dealsLib.createTask({ deal_id: id, title: "Ligar", type: "ligacao", due_at: brazilDateTime("2030-02-01", "09:00"), assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR));
  // Tarefas leem também o vínculo (para registrar no histórico certo, nunca num vínculo apagado).
  await measure("Reagendar tarefa", { reads: 2, writes: 2 }, () => detailLib.updateTask(task.id, { title: "Ligar", type: "ligacao", due_at: brazilDateTime("2030-02-02", "09:00"), notes: null }, OWNER, ACTOR));
  await measure("Concluir tarefa", { reads: 3, writes: 2 }, () => dealsLib.setTaskDone(task.id, true, ACTOR));
  await measure("Excluir tarefa", { reads: 2, writes: 2 }, () => detailLib.deleteTask(task.id, ACTOR));
  await measure("Registrar observação / WhatsApp", { reads: 0, writes: 2 }, () => detailLib.logDealActivity(id, "whatsapp", "Conversa aberta", ACTOR));
  await measure("Pausar com data (cria tarefa)", { reads: 1, writes: 4 }, () => detailLib.pauseDeal(id, { reason: "Férias", resume_date: "2030-01-30" }, ACTOR));
  await measure("Retomar", { reads: 1, writes: 2 }, () => detailLib.resumeDeal(id, ACTOR));
  const other = await dealsLib.createPipeline({ board_id: pipeline.board_id, name: "Outro", description: null, stages: [{ id: "outro001", name: "Início", color: "slate", probability: 10 }], custom_fields: [] }, ACTOR);
  await measure("Trocar de funil", { reads: 5, writes: 2 }, async () => {
    const v = (await db.collection("deals").doc(id).get()).get("version");
    ops.reads = 0;
    return detailLib.moveDealToPipeline(id, { pipeline_id: other.id, stage_id: "outro001", version: v }, ACTOR);
  });
  await measure("Registrar venda (cria contrato)", { reads: 3, writes: 3 }, () => detailLib.markDealWon(id, { product_id: "p_custo", product_name: null, monthly_cents: 9900, signed_date: "2026-11-19" }, ACTOR));
  await measure("Desfazer venda", { reads: 1, writes: 3 }, () => detailLib.reopenDeal(id, ACTOR));
  await measure("Marcar perda", { reads: 1, writes: 2 }, () => detailLib.markDealLost(id, "preco", null, ACTOR));
  // Apagar documento conta como gravação: negociação + ~50 registros + tarefas.
  await measure("Excluir negociação (com 5 tarefas e ~50 registros)", { reads: 70, writes: 80 }, () => detailLib.deleteDeal(converted.id === id ? id : id, ACTOR));
  await measure("Ação em massa: 50 negociações (status)", { reads: 51, writes: 100 }, async () => {
    const many = await Promise.all(Array.from({ length: 50 }, (_, i) => dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, `L${i}`), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR)));
    ops.reads = 0;
    ops.writes = 0;
    return dealsLib.bulkUpdateDeals({ action: "set_status", ids: many.map((m) => m.id), value: "pausada" }, null, ACTOR);
  });
  await measure("Lista do Kanban: página de negociações (~52)", { reads: 60, writes: 0 }, () => dealsLib.listDealsPage(null));
  await measure("Vencimentos das tarefas abertas (indicadores)", { reads: 20, writes: 0 }, () => dealsLib.listOpenTaskDue());

  for (const c of costs) {
    const ok = c.reads <= c.budget.reads && c.writes <= c.budget.writes;
    check(ok, `${c.name}: ${c.reads} leitura(s), ${c.writes} gravação(ões), ${c.ms} ms (orçamento ${c.budget.reads}/${c.budget.writes})`);
  }
  info("Leituras/gravações = documentos do Firestore (o que o Firebase cobra). Tempos são do emulador local.");
  return 0;
});

await scenario("33. Ciclo completo de uma negociação (todas as ações em sequência, estado conferido a cada passo)", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("Ciclo");
  const companyId = await seedCompany("Ciclo SA");
  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Ciclo"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR);
  const state = async () => (await db.collection("deals").doc(id).get()).data() ?? {};
  const v = async () => (await state()).version as number;

  await dealsLib.moveDeal({ deal_id: id, stage_id: pipeline.stages[1].id, position: 1, version: await v() }, ACTOR);
  check((await state()).stage_id === pipeline.stages[1].id, "1. arrastou para a 2ª etapa");
  await detailLib.updateDeal(id, await v(), { title: "Ciclo editado", value_cents: 500000, qualification: 4, context: "Contexto" }, null, ACTOR);
  check((await state()).title === "Ciclo editado" && (await state()).value_cents === 500000, "2. editou nome, valor, estrelas e contexto");
  await detailLib.updateDeal(id, await v(), { company_id: companyId }, null, ACTOR);
  check((await state()).company_id === companyId, "3. vinculou a empresa");
  await detailLib.pauseDeal(id, { reason: "Aguardando", resume_date: "2030-05-01" }, ACTOR);
  check((await state()).status === "pausada", "4. pausou");
  await detailLib.resumeDeal(id, ACTOR);
  check((await state()).status === "em_andamento", "5. retomou");
  const task = await dealsLib.createTask({ deal_id: id, title: "Follow", type: "follow_up", due_at: brazilDateTime("2030-01-10", "10:00"), assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR);
  await detailLib.updateTask(task.id, { title: "Follow 2", type: "reuniao", due_at: brazilDateTime("2030-01-12", "11:00"), notes: "x" }, OWNER, ACTOR);
  await dealsLib.setTaskDone(task.id, true, ACTOR);
  check((await db.collection("tasks").doc(task.id).get()).get("done") === true, "6. tarefa criada, reagendada e concluída");
  const other = await dealsLib.createPipeline({ board_id: pipeline.board_id, name: "Ciclo 2", description: null, stages: [{ id: "ciclo001", name: "A", color: "slate", probability: 10 }, { id: "ciclo002", name: "B", color: "slate", probability: 60 }], custom_fields: [] }, ACTOR);
  await detailLib.moveDealToPipeline(id, { pipeline_id: other.id, stage_id: "ciclo002", version: await v() }, ACTOR);
  check((await state()).pipeline_id === other.id, "7. trocou de funil");
  await detailLib.markDealWon(id, { product_id: null, product_name: "Venda ciclo", monthly_cents: 10000, signed_date: "2026-11-19" }, ACTOR);
  check((await state()).status === "vendida" && (await db.collection("contracts").where("deal_id", "==", id).get()).size === 1, "8. vendeu (1 contrato)");
  const blockedMove = await dealsLib.moveDeal({ deal_id: id, stage_id: "ciclo001", position: 0, version: 0 }, ACTOR).then(() => "ok", (e) => e.message);
  check(blockedMove === "deal_closed", "9. vendida não pode ser arrastada");
  await detailLib.reopenDeal(id, ACTOR);
  check((await state()).status === "em_andamento" && (await db.collection("contracts").where("deal_id", "==", id).get()).empty, "10. desfez a venda (contrato removido)");
  await detailLib.markDealLost(id, "timing", "Ano que vem", ACTOR);
  const wonAfterLost = await detailLib.markDealWon(id, { product_id: null, product_name: "x", monthly_cents: 100, signed_date: "2026-11-19" }, ACTOR).then(() => "ok", (e) => e.message);
  check((await state()).status === "perdida" && wonAfterLost === "deal_closed", "11. perdeu (e venda direta numa perdida é recusada)");
  await detailLib.reopenDeal(id, ACTOR);
  check((await state()).status === "em_andamento" && (await state()).lost_reason === null, "12. reabriu (motivo da perda limpo)");
  const history = await detailLib.listDealHistory(id);
  const finalVersion = await v();
  check(history.length >= 14, `13. histórico com todos os passos (${history.length} registros)`);
  check(finalVersion >= 10, `14. versão subiu a cada mudança (${finalVersion})`);
  await detailLib.deleteDeal(id, ACTOR);
  check(!(await db.collection("deals").doc(id).get()).exists && (await historyCount(id)) === 0 && (await db.collection("tasks").where("deal_id", "==", id).get()).empty, "15. excluiu sem deixar rastro");
  return 0;
});

await scenario("34. Concorrência cruzada: arrastar + editar + pausar + vender + perder na MESMA negociação (20 rodadas)", async (check) => {
  const pipeline = await defaultPipeline();
  const companyId = await seedCompany("Cruzada");
  let invalid = 0;
  for (let round = 0; round < 20; round++) {
    const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, `X${round}`), custom: {}, contact_id: null, company_id: companyId }, OWNER, ACTOR);
    await concurrently<unknown>([
      () => dealsLib.moveDeal({ deal_id: id, stage_id: pipeline.stages[2].id, position: 1, version: 1 }, ACTOR),
      () => detailLib.updateDeal(id, 1, { value_cents: 999 }, null, ACTOR),
      () => detailLib.pauseDeal(id, { reason: null, resume_date: null }, ACTOR),
      () => detailLib.markDealWon(id, { product_id: null, product_name: "Venda", monthly_cents: 100, signed_date: "2026-11-19" }, ACTOR),
      () => detailLib.markDealLost(id, "preco", null, ACTOR),
      () => dealsLib.bulkUpdateDeals({ action: "set_status", ids: [id], value: "em_andamento" }, null, ACTOR),
    ]);
    const d = (await db.collection("deals").doc(id).get()).data() ?? {};
    const contracts = (await db.collection("contracts").where("deal_id", "==", id).get()).size;
    const ok =
      (d.status === "vendida" && contracts === 1 && !d.lost_reason) ||
      (d.status === "perdida" && contracts === 0 && d.lost_reason) ||
      ((d.status === "em_andamento" || d.status === "pausada") && contracts === 0 && !d.lost_reason);
    if (!ok) invalid++;
  }
  check(invalid === 0, `nenhum estado inválido em 20 rodadas (inválidos: ${invalid})`);
  return 0;
});

await scenario("35. Telas dependentes: lead excluído, contato/empresa inativados, venda → Cliente → dashboard", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("Dep");
  const companyId = await seedCompany("Dep Ltda");
  const [leadId] = await seedLeads(1);
  const conv = await dealsLib.convertLeadToDeal({ lead_id: leadId, deal: dealCore(pipeline, "Dep"), custom: {}, contact_id: contactId, company_id: companyId }, OWNER, ACTOR);
  await leadsLib.deleteLeads([leadId]);
  const detail = await detailLib.getDealDetail(conv.id);
  check(detail !== null && detail.lead_id === leadId, "lead excluído: a negociação continua abrindo normalmente");
  await detailLib.deleteDeal(conv.id, ACTOR).then(() => check(true, "e pode ser excluída sem o lead"), (e) => check(false, `excluir sem o lead falhou: ${e.message}`));

  const { id } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Dep 2"), custom: {}, contact_id: contactId, company_id: companyId }, OWNER, ACTOR);
  await contactsLib.setContactStatus(contactId, "inativo", ACTOR);
  await companiesLib.setCompanyStatus(companyId, "inativo", ACTOR);
  const withInactive = await detailLib.getDealDetail(id);
  check(withInactive?.contact_info?.id === contactId && withInactive?.company_info?.id === companyId, "contato/empresa inativos continuam vinculados e visíveis");

  const before = await getDashboardMetrics();
  await detailLib.markDealWon(id, { product_id: null, product_name: "Plano X", monthly_cents: 25000, signed_date: "2026-11-01" }, ACTOR);
  const clients = await companiesLib.activeClientIds();
  check(clients.has(companyId), "venda: a empresa passa a ser Cliente");
  const after = await getDashboardMetrics();
  check(after.activeContracts === before.activeContracts + 1 && Math.round((after.monthlyRevenue - before.monthlyRevenue) * 100) === 25000, "dashboard: +1 contrato e +R$ 250/mês");
  const company = await companiesLib.getCompanyDetail(companyId);
  check(Boolean(company?.deals?.some((d: { id: string }) => d.id === id)), "a página da empresa lista a negociação");
  await detailLib.reopenDeal(id, ACTOR);
  check(!(await companiesLib.activeClientIds()).has(companyId), "desfazer venda: volta a ser Prospect");
  check((await getDashboardMetrics()).activeContracts === before.activeContracts, "e sai do faturamento");
  return 0;
});

await scenario("36. Entradas maliciosas em todas as validações (tipos, tamanhos, ids, datas, valores)", async (check) => {
  const v = await import("../../src/lib/admin/crm/dealValidation");
  const big = "x".repeat(100_000);
  const evil = [null, undefined, 0, -1, 1e309, NaN, true, [], {}, "", big, "../../x", "a/b", "<script>", "'; DROP", { $gt: "" }, ["a"], "2026-02-30", "9999-99-99"];
  let crashes = 0;
  let accepted = 0;
  const pipelines = [{ id: "vendas", stages: [{ id: "qualific", name: "Q", color: "slate" as const, probability: 10 }] }];
  for (const x of evil) {
    const attempts: (() => unknown)[] = [
      () => v.parseMoveDeal({ deal_id: x, stage_id: x, position: x, version: x }),
      () => v.parseBulkDeals({ ids: x, action: "set_status", value: x }),
      () => v.parseBulkDeals({ ids: [x], action: "set_pipeline", value: x }),
      () => v.parseDealUpdate({ version: x, changes: { title: x, value: x, stage_id: x, owner_uid: x, contact_id: x, custom: x } }),
      () => v.parseWon({ product_id: x, product_name: x, monthly_value: x, signed_date: x }),
      () => v.parseLost({ reason: x, detail: x }, ["preco"]),
      () => v.parseCreateDealPayload({ request_id: x, deal: x, contact_id: x }, ["u"], pipelines),
      () => v.parseConvertLeadPayload({ lead_id: x, deal: { title: x }, contact_id: x }, ["u"], pipelines),
      () => v.validateTaskForm({ deal_id: x as never, title: x as never, type: x as never, due_date: x as never, due_time: x as never, assignee_uid: x as never }, ["u"]),
      () => v.validatePipelineForm({ board_id: x as never, name: x as never, stages: x as never, custom_fields: x as never }),
      // Números finitos (0, -1) são válidos num campo numérico: só o resto deve ser recusado.
      () => (typeof x === "number" && Number.isFinite(x) ? null : v.validateCustomValues([{ id: "f1", label: "F", type: "number", options: [], required: true }], { f1: x })),
    ];
    for (const attempt of attempts) {
      try {
        const r = attempt() as { ok?: boolean; errors?: unknown } | null;
        if (r && r.ok !== false && !("errors" in r)) accepted++;
      } catch {
        crashes++;
      }
    }
  }
  check(crashes === 0, `nenhuma validação quebrou com entrada maliciosa (${crashes} exceções)`);
  check(accepted === 0, `nenhuma entrada maliciosa foi aceita (${accepted} aceitas)`);
  // Texto livre (observação, motivo da pausa) é aceito, mas sempre como texto limitado; o resto vira nulo.
  let unsafe = 0;
  for (const x of evil) {
    const p = v.parsePause({ reason: x, resume_date: x });
    if ("errors" in p) continue;
    if ((p.reason !== null && (typeof p.reason !== "string" || p.reason.length > 500)) || (p.resume_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(p.resume_date))) unsafe++;
    const a = v.parseActivity({ kind: "note", text: x });
    if (a && (typeof a.text !== "string" || a.text.length > 2000)) unsafe++;
  }
  check(unsafe === 0, `texto livre sempre limpo e limitado (${unsafe} fora do padrão)`);
  const ok = v.parseMoveDeal({ deal_id: "abc", stage_id: "qualific", position: 1.5, version: 2 });
  check(ok !== null, "entrada válida continua aceita");
  return 0;
});

// ── Tela de Tarefas: recorrência, vínculos, ações em massa, listagem ─────────

const tasksLib = await import("../../src/lib/admin/crm/tasks");

await scenario("37. Recorrência: 20 conclusões simultâneas → 1 próxima; datas certas (diária, dias úteis, semanal, mensal, a cada N)", async (check) => {
  const at = (date: string, time = "10:00") => brazilDateTime(date, time);
  const br = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(",", "");
  const far = new Date("2000-01-01T00:00:00Z");
  check(br(tasksLib.nextOccurrence(at("2030-01-10"), { freq: "daily", interval: 1 }, far)) === "2030-01-11 10:00", "diária: dia seguinte, mesmo horário");
  check(br(tasksLib.nextOccurrence(at("2030-01-11"), { freq: "weekdays", interval: 1 }, far)) === "2030-01-14 10:00", "dias úteis: sexta → segunda");
  check(br(tasksLib.nextOccurrence(at("2030-01-10"), { freq: "weekly", interval: 1 }, far)) === "2030-01-17 10:00", "semanal: +7 dias");
  check(br(tasksLib.nextOccurrence(at("2030-01-31"), { freq: "monthly", interval: 1 }, far)) === "2030-02-28 10:00", "mensal: 31/jan → 28/fev (mês curto)");
  check(br(tasksLib.nextOccurrence(at("2030-01-10"), { freq: "every_n_days", interval: 3 }, far)) === "2030-01-13 10:00", "a cada 3 dias");
  const late = tasksLib.nextOccurrence(at("2020-01-01", "09:00"), { freq: "daily", interval: 1 });
  check(late > new Date() && br(late).endsWith("09:00"), "atrasada há anos: a próxima já cai no futuro, no mesmo horário");

  const t = await tasksLib.createTask({ deal_id: null, parent: null, recurrence: { freq: "weekly", interval: 1 }, remind_minutes: 15, title: "Semanal", type: "ligacao", due_at: at("2030-03-04", "08:30"), assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR);
  const { failed } = await concurrently(Array.from({ length: 20 }, () => () => tasksLib.setTaskDone(t.id, true, ACTOR)));
  check(failed.length === 0, `20 cliques em "concluir" sem erro (${failed.length})`);
  const all = await db.collection("tasks").get();
  const open = all.docs.filter((d) => d.get("done") === false);
  check(all.size === 2 && open.length === 1, `exatamente 1 próxima criada (${all.size - 1})`);
  check(br(open[0].get("due_at").toDate()) === "2030-03-11 08:30" && open[0].get("remind_minutes") === 15, "próxima: +7 dias, mesmo horário e mesmo lembrete");
  await tasksLib.setTaskDone(t.id, false, ACTOR);
  await tasksLib.setTaskDone(t.id, true, ACTOR);
  check((await db.collection("tasks").get()).size === 2, "reabrir e concluir de novo não cria outra");
  return 0;
});

await scenario("38. Vínculos: negociação → histórico; lead/contato/empresa → observação; avulsa; vínculo inexistente recusado", async (check) => {
  const pipeline = await defaultPipeline();
  const contactId = await seedContact("Vínculo");
  const companyId = await seedCompany("Vínculo SA");
  const [leadId] = await seedLeads(1);
  const { id: dealId } = await dealsLib.createDeal({ request_id: randomUUID(), deal: dealCore(pipeline, "Vínculo"), custom: {}, contact_id: contactId, company_id: null }, OWNER, ACTOR);
  const due = brazilDateTime("2030-05-05", "14:00");
  const make = (parent: { type: "deal" | "lead" | "contact" | "company"; id: string } | null) =>
    tasksLib.createTask({ deal_id: null, parent, recurrence: null, remind_minutes: null, title: `T ${parent?.type ?? "avulsa"}`, type: "follow_up", due_at: due, assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR);
  const [td, tl, tc, te, ta] = await Promise.all([make({ type: "deal", id: dealId }), make({ type: "lead", id: leadId }), make({ type: "contact", id: contactId }), make({ type: "company", id: companyId }), make(null)]);
  check(td.parent?.label === "Vínculo" && td.deal_id === dealId, "tarefa da negociação guarda o nome e o deal_id");
  check(tl.parent?.type === "lead" && tc.parent?.label === "Vínculo" && te.parent?.label === "Vínculo SA" && ta.parent === null, "lead, contato, empresa e avulsa com o vínculo certo");
  const notes = async (col: string, id: string) => (await db.collection(`${col}/${id}/notes`).get()).docs.map((d) => String(d.get("text") ?? ""));
  check((await notes("leads", leadId)).some((t) => t.startsWith("Tarefa criada")), "lead ganhou a observação automática");
  check((await notes("contacts", contactId)).some((t) => t.startsWith("Tarefa criada")), "contato ganhou a observação automática");
  check((await notes("companies", companyId)).some((t) => t.startsWith("Tarefa criada")), "empresa ganhou a observação automática");
  check((await detailLib.listDealHistory(dealId)).some((h) => h.title === "Tarefa criada"), "negociação registrou no histórico");
  await tasksLib.setTaskDone(tl.id, true, ACTOR);
  check((await notes("leads", leadId)).some((t) => t.startsWith("Tarefa concluída")), "concluir também registra no vínculo");
  const ghost = await make({ type: "company", id: "nao_existe" }).then(() => "ok", (e) => e.message);
  check(ghost === "parent_not_found", "vínculo inexistente é recusado");
  // Vínculo excluído depois: a tarefa continua funcionando (sem registrar em lugar nenhum).
  await db.collection("contacts").doc(contactId).delete();
  const afterDelete = await tasksLib.setTaskDone(tc.id, true, ACTOR).then((r) => (r ? "ok" : "null"), (e) => e.message);
  check(afterDelete === "ok", "concluir tarefa de um contato que foi apagado funciona");
  return 0;
});

await scenario("39. Ações em massa em 100 tarefas (concluir com recorrentes, reagendar, mover, atribuir, excluir) + concorrência", async (check) => {
  const due = brazilDateTime("2030-06-10", "09:15");
  const created = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      tasksLib.createTask({ deal_id: null, parent: null, recurrence: i % 10 === 0 ? { freq: "daily", interval: 1 } : null, remind_minutes: null, title: `M${i}`, type: "outro", due_at: due, assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR),
    ),
  );
  const ids = created.map((t) => t.id);
  const shifted = await tasksLib.bulkTasks({ action: "shift", ids, days: 2 }, ACTOR);
  check(shifted.length === 100, "+2 dias em 100");
  const sample = (await db.collection("tasks").doc(ids[5]).get()).get("due_at").toDate();
  check(sample.toISOString() === brazilDateTime("2030-06-12", "09:15").toISOString(), "reagendar mantém o horário (09:15)");
  await tasksLib.bulkTasks({ action: "move_to", ids: ids.slice(0, 50), date: "2030-07-01" }, ACTOR);
  check((await db.collection("tasks").doc(ids[3]).get()).get("due_at").toDate().toISOString() === brazilDateTime("2030-07-01", "09:15").toISOString(), "mover para 01/07 mantém o horário");
  await tasksLib.bulkTasks({ action: "assign", ids, assignee: ACTOR }, ACTOR);
  check((await db.collection("tasks").where("assignee_uid", "==", ACTOR.uid).get()).size === 100, "100 atribuídas a outra pessoa");
  const { failed } = await concurrently<unknown>([() => tasksLib.bulkTasks({ action: "complete", ids }, ACTOR), () => tasksLib.bulkTasks({ action: "complete", ids }, ACTOR), ...ids.slice(0, 20).map((id) => () => tasksLib.setTaskDone(id, true, ACTOR))]);
  check(failed.length === 0, `concluir em massa 2× + 20 individuais ao mesmo tempo sem erro (${failed.length})`);
  const total = (await db.collection("tasks").get()).size;
  check(total === 110, `as 10 recorrentes geraram exatamente 10 próximas (${total - 100})`);
  const deleted = await tasksLib.bulkTasks({ action: "delete", ids: ids.slice(50) }, ACTOR);
  check(deleted.length === 50 && (await db.collection("tasks").get()).size === 60, "excluir 50 em massa");
  check(tasksLib.parseBulkTasks({ ids, action: "move_to", value: "2030-02-30" }) === null, "data inexistente é recusada");
  check(tasksLib.parseBulkTasks({ ids: Array.from({ length: 101 }, (_, i) => `t${i}`), action: "complete" }) === null, "mais de 100 por vez é recusado");
  return 0;
});

await scenario("40. Lista de tarefas: 4.000 abertas em páginas (sem repetir) + concluídas recentes + custo", async (check, info) => {
  for (let i = 0; i < 4000; i += 400) {
    const batch = db.batch();
    for (let j = i; j < i + 400; j++) batch.set(db.collection("tasks").doc(), { title: `L${j}`, type: "outro", done: false, done_at: null, due_at: new Date(Date.now() + j * 60_000), assignee_uid: OWNER.uid, created_at: new Date() });
    await batch.commit();
  }
  const batch = db.batch();
  for (let j = 0; j < 100; j++) batch.set(db.collection("tasks").doc(), { title: `D${j}`, type: "outro", done: true, done_at: new Date(Date.now() - j * 3_600_000), due_at: new Date(), assignee_uid: OWNER.uid, created_at: new Date() });
  await batch.commit();
  const seen = new Set<string>();
  let dup = 0;
  let after: string | null = null;
  let biggest = 0;
  const t = performance.now();
  do {
    const page: { rows: { id: string }[]; next: string | null } = await tasksLib.listOpenTasksPage(after);
    biggest = Math.max(biggest, Math.round(JSON.stringify(page.rows).length / 1024));
    for (const r of page.rows) {
      if (seen.has(r.id)) dup++;
      else seen.add(r.id);
    }
    after = page.next;
  } while (after);
  check(seen.size === 4000 && dup === 0, `${seen.size} abertas distintas, ${dup} repetidas`);
  check(biggest < 2048, `maior página ${biggest} KB (< 2 MB do cache)`);
  const done = await tasksLib.listRecentDoneTasks();
  check(done.length === 100, `concluídas recentes: ${done.length}`);
  info(`lista completa em ${Math.round(performance.now() - t)} ms`);
  await measure("Tarefas: criar com vínculo (empresa)", { reads: 2, writes: 2 }, async () => {
    const companyId = await seedCompany("Custo T");
    ops.reads = 0;
    ops.writes = 0;
    return tasksLib.createTask({ deal_id: null, parent: { type: "company", id: companyId }, recurrence: null, remind_minutes: 15, title: "c", type: "outro", due_at: new Date(), assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR);
  });
  await measure("Tarefas: concluir recorrente (cria a próxima)", { reads: 2, writes: 3 }, async () => {
    const r = await tasksLib.createTask({ deal_id: null, parent: null, recurrence: { freq: "daily", interval: 1 }, remind_minutes: null, title: "r", type: "outro", due_at: new Date(), assignee_uid: OWNER.uid, notes: null }, OWNER, ACTOR);
    ops.reads = 0;
    ops.writes = 0;
    return tasksLib.setTaskDone(r.id, true, ACTOR);
  });
  for (const c of costs.slice(-2)) check(c.reads <= c.budget.reads && c.writes <= c.budget.writes, `${c.name}: ${c.reads} leitura(s), ${c.writes} gravação(ões)`);
  return 0;
});

// ── Relatório de custo ──
if (costs.length) {
  console.log("\n══ Custo por funcionalidade (documentos do Firestore) ══");
  console.log("Leituras | Gravações | Tempo | Funcionalidade");
  for (const c of costs) console.log(`${String(c.reads).padStart(8)} | ${String(c.writes).padStart(9)} | ${String(c.ms).padStart(4)}ms | ${c.name}`);
}

// ── relatório ────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
console.log(`\n══ ${passed}/${results.length} cenários passaram ══`);
process.exit(passed === results.length ? 0 : 1);
