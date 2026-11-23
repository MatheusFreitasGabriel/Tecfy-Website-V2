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

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKey),
    }),
  });
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
