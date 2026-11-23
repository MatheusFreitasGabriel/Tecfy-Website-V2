import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Chave privada como vem da env, em qualquer formato comum de colagem (Vercel, .env, JSON):
 * aspas em volta, `\n` literais (ou `\\n`), quebras reais do Windows (`\r\n`) e espaços nas pontas.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1).trim();
  key = key.replace(/\\\\n/g, "\n").replace(/\\r\\n|\\n/g, "\n").replace(/\r\n/g, "\n");
  return key.endsWith("\n") ? key : `${key}\n`;
}

/**
 * Inicialização preguiçosa: o app só é criado na primeira chamada (em tempo de
 * requisição), não no import. Assim o `next build` não quebra quando as envs do
 * Firebase não estão presentes no ambiente de build.
 */
function getAdminApp(): App {
  const apps = getApps();
  if (apps.length > 0) return apps[0];

  // Emulador local do Firestore (testes de stress): sem credencial, projeto "demo-*".
  // Só acontece com FIRESTORE_EMULATOR_HOST definido — nunca em produção.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-tecfy" });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin: variáveis FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY ausentes.");
  }

  try {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: normalizePrivateKey(privateKey),
      }),
    });
  } catch (error) {
    // Diagnóstico SEM o conteúdo da chave: só o formato, para achar erro de colagem na Vercel.
    console.error("firebase private key shape", JSON.stringify(describePrivateKey(privateKey)));
    throw error;
  }
}

/** Formato da chave (nunca o valor): tamanho, cabeçalhos, tipo de quebra de linha e caracteres fora do base64. */
function describePrivateKey(raw: string) {
  const key = normalizePrivateKey(raw);
  const body = key.replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/\n/g, "");
  return {
    rawLength: raw.length,
    quoted: /^\s*["']/.test(raw),
    begin: /-----BEGIN PRIVATE KEY-----/.test(key),
    beginRsa: /-----BEGIN RSA PRIVATE KEY-----/.test(key),
    end: /-----END PRIVATE KEY-----/.test(key),
    literalBackslashN: (raw.match(/\\n/g) ?? []).length,
    realNewlines: (raw.match(/\n/g) ?? []).length,
    carriageReturns: (raw.match(/\r/g) ?? []).length,
    bodyLength: body.length,
    bodyLengthMod4: body.length % 4,
    spacesInBody: (body.match(/ /g) ?? []).length,
    otherNonBase64: (body.replace(/ /g, "").match(/[^A-Za-z0-9+/=]/g) ?? []).length,
  };
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/**
 * Bucket do Firebase Storage para arquivos/propostas das negociações (privado: só o servidor acessa,
 * por URLs assinadas de poucos minutos). null = Storage ainda não configurado (FIREBASE_STORAGE_BUCKET).
 */
export async function getAdminBucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET;
  if (!name) return null;
  const { getStorage } = await import("firebase-admin/storage");
  return getStorage(getAdminApp()).bucket(name);
}
