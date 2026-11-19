import "server-only";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";

/**
 * Rate limit do formulário público (/api/leads), guardado no Firestore para valer entre todas as
 * instâncias da Vercel (o antigo Map em memória não valia). Janela fixa por IP (IP com hash).
 * Chamado DEPOIS do Turnstile, para bot não gerar escrita no banco.
 * Falha do Firestore → deixa passar (o Turnstile já barrou bots; não perder lead real).
 */
const COLLECTION = "site_rate_limits";
const WINDOW_MS = 60 * 60 * 1000;
export const SITE_MAX_PER_WINDOW = 10;

export async function allowSiteSubmission(ip: string): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(`lead_${createHash("sha256").update(ip).digest("hex").slice(0, 40)}`);
  const now = Date.now();
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const start = snap.get("window_start");
      const count = snap.get("count");
      if (!snap.exists || typeof start !== "number" || now - start >= WINDOW_MS) {
        tx.set(ref, { window_start: now, count: 1, expires_at: new Date(now + WINDOW_MS) });
        return true;
      }
      if (typeof count === "number" && count >= SITE_MAX_PER_WINDOW) return false;
      tx.update(ref, { count: (typeof count === "number" ? count : 0) + 1 });
      return true;
    });
  } catch {
    console.error("site rate limit unavailable");
    return true;
  }
}
