/**
 * Importação de leads — tipos da análise (servidor → tela) e a classificação de cada linha
 * (situação + ação padrão). Módulo puro: a tela recalcula ao vivo enquanto o usuário edita.
 */
import type { LeadStage, LeadStatus } from "../options";
import {
  domainOf,
  emailKey,
  fold,
  hasNoReach,
  digitsOf,
  phoneKey,
  resolveOwner,
  validateImportRow,
  type ImportField,
  type ImportRow,
  type OwnerOption,
  type RowErrors,
} from "./columns";

// ── Resposta da análise (servidor) ───────────────────────────────────────────

export type CompanyMatchBy = "cnpj" | "site" | "nome";
export type ContactMatchBy = "email" | "telefone" | "nome";

export interface MatchedLead {
  id: string;
  title: string;
  status: LeadStatus;
  stage: LeadStage;
  owner_name: string | null;
  created_at: string | null;
  /** Por que este lead parece o mesmo. */
  reason: string;
}

/** Comparação de um campo: planilha × CRM. "novo" = CRM vazio (pode ser completado); "diferente" = só aviso. */
export interface FieldDiff {
  field: ImportField;
  label: string;
  sheet: string;
  crm: string | null;
  kind: "novo" | "diferente";
}

export interface RowMatch {
  line: number;
  company: { id: string; name: string; by: CompanyMatchBy } | null;
  /** Empresa com o mesmo telefone, mas sem outra coincidência: só aviso (não liga sozinho). */
  companyMaybe: { id: string; name: string } | null;
  contact: { id: string; name: string; by: ContactMatchBy; company_name: string | null } | null;
  /** Leads em aberto que parecem ser o mesmo. */
  openLeads: MatchedLead[];
  /** Leads perdidos/arquivados do mesmo contato/empresa. */
  closedLeads: MatchedLead[];
  companyDiff: FieldDiff[];
  contactDiff: FieldDiff[];
}

// ── Situação e ação ──────────────────────────────────────────────────────────

export type RowStatus = "erro" | "sem_contato" | "duplicado" | "repetido" | "existente" | "novo";
export type RowAction = "create" | "update" | "skip";

export const STATUS_INFO: Record<RowStatus, { label: string; hint: string }> = {
  novo: { label: "Novo", hint: "Lead, contato e empresa ainda não existem no CRM." },
  existente: { label: "Já conhecido", hint: "A empresa ou o contato já existem: o lead novo é ligado a eles." },
  duplicado: { label: "Lead duplicado", hint: "Já existe um lead em aberto desta empresa/contato." },
  repetido: { label: "Repetido na planilha", hint: "Outra linha acima tem a mesma empresa, e-mail ou telefone." },
  sem_contato: { label: "Sem contato", hint: "Sem e-mail, telefone e site: não vale cadastrar." },
  erro: { label: "Com erro", hint: "Algum campo está inválido. Corrija para poder importar." },
};

export const ACTION_LABELS: Record<RowAction, string> = {
  create: "Criar lead",
  update: "Atualizar existente",
  skip: "Pular",
};

export function allowedActions(status: RowStatus): RowAction[] {
  switch (status) {
    case "erro":
    case "sem_contato":
      return ["skip"];
    case "duplicado":
      return ["skip", "update", "create"];
    case "repetido":
      return ["skip", "create"];
    default:
      return ["create", "skip"];
  }
}

export const defaultAction = (status: RowStatus): RowAction => allowedActions(status)[0];

/** Escolha manual do usuário para uma linha. */
export interface RowChoice {
  action?: RowAction;
  /** Completar campos vazios do contato/empresa existentes com os dados da planilha (padrão: sim). */
  fill?: boolean;
  /** Lead existente que recebe a atualização (quando há mais de um em aberto). */
  leadId?: string;
}

export interface ReviewedRow extends ImportRow {
  ownerUid: string | null;
  errors: RowErrors;
  status: RowStatus;
  action: RowAction;
  fill: boolean;
  match: RowMatch | null;
  /** Linha anterior com os mesmos dados (status "repetido"). */
  repeatOf: number | null;
  /** Lead existente que recebe a ação "Atualizar existente". */
  targetLeadId: string | null;
  /** Avisos que não impedem a importação. */
  warnings: string[];
}

/** Chaves de identidade da linha (para repetição dentro da planilha). */
function identityKeys(row: ImportRow): string[] {
  const v = row.values;
  const keys: string[] = [];
  const cnpj = digitsOf(v.cnpj);
  if (cnpj.length === 14) keys.push(`cnpj:${cnpj}`);
  const domain = domainOf(v.website);
  if (domain) keys.push(`site:${domain}`);
  if (v.trade_name.trim()) keys.push(`empresa:${fold(v.trade_name)}`);
  for (const e of [v.lead_email, v.contact_email]) if (emailKey(e)) keys.push(`email:${emailKey(e)}`);
  for (const p of [v.lead_phone, v.contact_phone]) if (phoneKey(p)) keys.push(`tel:${phoneKey(p)}`);
  return keys;
}

/** Junta validação + análise do servidor + escolhas do usuário → situação e ação de cada linha. */
export function reviewRows(
  rows: ImportRow[],
  matches: Map<number, RowMatch>,
  choices: Map<number, RowChoice>,
  admins: OwnerOption[],
  defaultOwnerUid: string,
): ReviewedRow[] {
  const ownerUids = admins.map((a) => a.uid);
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const ownerUid = resolveOwner(row.values.owner, admins, defaultOwnerUid);
    const result = validateImportRow(row.values, ownerUid, ownerUids);
    const errors = result.ok ? {} : result.errors;
    const match = matches.get(row.line) ?? null;

    // Repetição dentro do arquivo (a primeira linha "ganha").
    let repeatOf: number | null = null;
    for (const key of identityKeys(row)) {
      const first = seen.get(key);
      if (first !== undefined && repeatOf === null) repeatOf = first;
      if (first === undefined) seen.set(key, row.line);
    }

    let status: RowStatus;
    if (!result.ok) status = "erro";
    else if (hasNoReach(row.values)) status = "sem_contato";
    else if (match?.openLeads.length) status = "duplicado";
    else if (repeatOf !== null) status = "repetido";
    else if (match?.company || match?.contact) status = "existente";
    else status = "novo";

    const choice = choices.get(row.line) ?? {};
    const allowed = allowedActions(status);
    const action = choice.action && allowed.includes(choice.action) ? choice.action : defaultAction(status);

    const warnings: string[] = [];
    if (match?.closedLeads.length && !match.openLeads.length) warnings.push(`Já foi lead antes (${match.closedLeads.length} perdido/arquivado).`);
    if (match?.companyMaybe) warnings.push(`Telefone igual ao da empresa "${match.companyMaybe.name}" — confira se é a mesma.`);
    if (match?.contact?.by === "telefone") warnings.push(`Contato ligado pelo telefone a "${match.contact.name}".`);
    if (match?.companyDiff.some((d) => d.kind === "diferente") || match?.contactDiff.some((d) => d.kind === "diferente"))
      warnings.push("Há dados diferentes do que está no CRM (não serão sobrescritos).");

    const open = match?.openLeads ?? [];
    const targetLeadId = open.find((l) => l.id === choice.leadId)?.id ?? open[0]?.id ?? null;

    return { ...row, ownerUid, errors, status, action, fill: choice.fill ?? true, match, repeatOf, targetLeadId, warnings };
  });
}

/** Linha vai completar dados de contato/empresa existentes? */
export const willFill = (r: ReviewedRow): boolean =>
  r.action !== "skip" && r.fill && Boolean(r.match?.companyDiff.some((d) => d.kind === "novo") || r.match?.contactDiff.some((d) => d.kind === "novo"));
