import "server-only";
import type { DocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { productBillings } from "./options";
import { computeDashboardMetrics, type DashboardMetrics } from "./revenue";
import { CONTRACT_MIN_TERM_MONTHS, CONTRACTS_COLLECTION, type Contract, type ContractStatus } from "./types";

function toDate(value: unknown): Date | null {
  if (value && typeof (value as Timestamp).toDate === "function") return (value as Timestamp).toDate();
  return null;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const CONTRACT_FIELDS = [
  "lead_id",
  "product_id",
  "product_name",
  "billing",
  "monthly_value",
  "setup_value",
  "one_time_value",
  "status",
  "signed_at",
  "cancelled_at",
  "min_term_months",
] as const;

/** Documento → contrato das métricas. null = malformado (ignorado). Contratos antigos sem `billing` = mensal. */
export function toContract(doc: DocumentSnapshot): Contract | null {
  const d = doc.data() ?? {};
  const signedAt = toDate(d.signed_at);
  const status = d.status as ContractStatus;
  if (!signedAt || typeof d.monthly_value !== "number" || (status !== "active" && status !== "cancelled")) return null;
  return {
    id: doc.id,
    lead_id: String(d.lead_id ?? ""),
    product_id: String(d.product_id ?? ""),
    product_name: String(d.product_name ?? ""),
    billing: productBillings.is(d.billing) ? d.billing : "mensal",
    monthly_value: d.monthly_value,
    setup_value: num(d.setup_value),
    one_time_value: num(d.one_time_value),
    status,
    signed_at: signedAt,
    cancelled_at: toDate(d.cancelled_at),
    min_term_months: typeof d.min_term_months === "number" ? d.min_term_months : CONTRACT_MIN_TERM_MONTHS,
  };
}

/** Lê os contratos que entram nas métricas (ativos + cancelados). Ignora documentos malformados. */
export async function listContracts(): Promise<Contract[]> {
  const snap = await getAdminDb()
    .collection(CONTRACTS_COLLECTION)
    .select(...CONTRACT_FIELDS)
    .get();
  return snap.docs.map(toContract).filter((c): c is Contract => c !== null);
}

/** Contratos para o Dashboard (com id, produto, empresa e fidelidade), já serializáveis. */
export async function listContractsLite(): Promise<{ id: string; product_id: string; product_name: string; company_id: string | null; min_term_months: number; billing: Contract["billing"]; monthly_value: number; setup_value: number; one_time_value: number; status: ContractStatus; signed_at: string; cancelled_at: string | null }[]> {
  const snap = await getAdminDb()
    .collection(CONTRACTS_COLLECTION)
    .select(...CONTRACT_FIELDS, "company_id")
    .get();
  return snap.docs.flatMap((doc) => {
    const c = toContract(doc);
    if (!c) return [];
    const company = doc.get("company_id");
    return [{
      id: c.id,
      product_id: c.product_id,
      product_name: c.product_name || "Venda",
      company_id: typeof company === "string" && company ? company : null,
      min_term_months: c.billing === "unico" ? 0 : c.min_term_months,
      billing: c.billing,
      monthly_value: c.monthly_value,
      setup_value: c.setup_value,
      one_time_value: c.one_time_value,
      status: c.status,
      signed_at: c.signed_at.toISOString(),
      cancelled_at: c.cancelled_at?.toISOString() ?? null,
    }];
  });
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return computeDashboardMetrics(await listContracts());
}
