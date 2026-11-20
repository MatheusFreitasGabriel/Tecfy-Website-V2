/**
 * Configura o bucket do Firebase Storage para os arquivos/propostas das negociações.
 *
 *   node --env-file=.env.local scripts/storage-setup.mjs [--origin https://tecfy.dev] [--origin http://localhost:3000]
 *
 * O que faz: libera (CORS) o envio direto do navegador SÓ a partir das origens informadas, com
 * PUT (upload pela URL assinada de 5 min) e GET (download pela URL assinada). Sem URL assinada
 * gerada pelo servidor, ninguém lê nem grava — o bucket continua privado.
 * Padrão de origens: https://tecfy.dev, https://www.tecfy.dev e http://localhost:3000.
 *
 * Recomendado no console do Firebase → Storage → Regras (o painel usa só o Admin SDK):
 *   rules_version = '2';
 *   service firebase.storage { match /b/{bucket}/o { match /{all=**} { allow read, write: if false; } } }
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_STORAGE_BUCKET } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !FIREBASE_STORAGE_BUCKET) {
  console.error("✗ Faltam variáveis: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY e FIREBASE_STORAGE_BUCKET.");
  process.exit(1);
}

const args = process.argv.slice(2);
const origins = args.flatMap((a, i) => (a === "--origin" && args[i + 1] ? [args[i + 1]] : []));
const allowed = origins.length ? origins : ["https://tecfy.dev", "https://www.tecfy.dev", "http://localhost:3000"];
for (const o of allowed) {
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) {
    console.error(`✗ Origem inválida: ${o}`);
    process.exit(1);
  }
}

initializeApp({ credential: cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) });
const bucket = getStorage().bucket(FIREBASE_STORAGE_BUCKET);

const [exists] = await bucket.exists();
if (!exists) {
  console.error(`✗ Bucket "${FIREBASE_STORAGE_BUCKET}" não encontrado. Ative o Storage no console do Firebase (plano Blaze).`);
  process.exit(1);
}

await bucket.setCorsConfiguration([
  {
    origin: allowed,
    method: ["PUT", "GET"],
    responseHeader: ["Content-Type", "x-goog-content-length-range"],
    maxAgeSeconds: 3600,
  },
]);
console.log(`✓ CORS configurado em ${FIREBASE_STORAGE_BUCKET} para: ${allowed.join(", ")}`);
console.log("  Lembre-se: deixe as regras do Storage negando acesso direto (veja o comentário no topo deste arquivo).");
