import "server-only";
import type { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { computeDashboardMetrics, type DashboardMetrics } from "./revenue";
import { CONTRACT_MIN_TERM_MONTHS, CONTRACTS_COLLECTION, type Contract, type ContractStatus } from "./types";

function toDate(value: unknown): Date | null {
  if (value && typeof (value as Timestamp).toDate === "function") return (value as Timestamp).toDate();
  return null;
}

/** Lê os contratos que entram nas métricas (ativos + cancelados). Ignora documentos malformados. */
export async function listContracts(): Promise<Contract[]> {
  const snap = await getAdminDb()
    .collection(CONTRACTS_COLLECTION)
    .select("lead_id", "product_id", "product_name", "monthly_value", "status", "signed_at", "cancelled_at", "min_term_months")
    .get();

  const contracts: Contract[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const signedAt = toDate(d.signed_at);
    const status = d.status as ContractStatus;
    if (!signedAt || typeof d.monthly_value !== "number" || (status !== "active" && status !== "cancelled")) continue;
    contracts.push({
      id: doc.id,
      lead_id: String(d.lead_id ?? ""),
      product_id: String(d.product_id ?? ""),
      product_name: String(d.product_name ?? ""),
      monthly_value: d.monthly_value,
      status,
      signed_at: signedAt,
      cancelled_at: toDate(d.cancelled_at),
      min_term_months: typeof d.min_term_months === "number" ? d.min_term_months : CONTRACT_MIN_TERM_MONTHS,
    });
  }
  return contracts;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return computeDashboardMetrics(await listContracts());
}
