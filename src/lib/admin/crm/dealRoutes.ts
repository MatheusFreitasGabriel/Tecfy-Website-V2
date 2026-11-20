import "server-only";
import { getAdminSession, type AdminSession } from "@/lib/admin/session";
import { readGuardedJson } from "@/lib/admin/requestContext";
import { getCachedAdmins, getCachedOpenTaskDue, getCachedPipelineSetup } from "./cache";
import {
  DealNotFoundError,
  InvalidCustomValuesError,
  LeadAlreadyConvertedError,
  LeadNotFoundForDealError,
  MissingLinkError,
  PipelineNotFoundError,
  StaleDealError,
  getDealRows,
  placeDeals,
} from "./deals";
import { DEAL_MAX_BYTES } from "./dealValidation";
import { actorOf, crmResponses } from "./routeHelpers";
import type { Actor } from "./leads";
import type { DealRow } from "./types";
import {
  AlreadyLinkedDealError,
  DealClosedError,
  DealSoldError,
  TaskNotFoundError,
  DuplicateFileError,
  FileNotFoundError,
  InvalidFileError,
  NeedsCompanyError,
  ProductNotFoundError,
  StorageNotConfiguredError,
} from "./dealDetail";
import { EmailProviderError, RecipientNotAllowedError } from "./email";
import { TaskParentNotFoundError } from "./tasks";

/** POST/PATCH do CRM: gate/origem/JSON (tamanho máx.) → sessão. Devolve o corpo + quem age. */
export async function guardedWrite(request: Request, maxBytes = DEAL_MAX_BYTES): Promise<{ body: Record<string, unknown>; session: AdminSession; actor: Actor } | Response> {
  const body = await readGuardedJson(request, maxBytes);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return crmResponses.unauthorized();
  return { body, session, actor: await actorOf(session) };
}

/** Usuário do painel pelo uid (responsável). null = não é um admin válido. */
export async function adminByUid(uid: string): Promise<Actor | null> {
  const admin = (await getCachedAdmins()).find((a) => a.uid === uid);
  return admin ? { uid: admin.uid, name: admin.name } : null;
}

/** Funis ativos (validação da etapa escolhida). */
export async function activePipelines() {
  return (await getCachedPipelineSetup()).pipelines.filter((p) => !p.archived);
}

/** Linha atualizada (com funil/etapa resolvidos e tarefas) para a tela aplicar sem recarregar. */
export async function freshDealRow(id: string): Promise<DealRow | null> {
  const [rows, setup, tasks] = await Promise.all([getDealRows([id]), getCachedPipelineSetup(), getCachedOpenTaskDue()]);
  return rows.length ? placeDeals(rows, setup.pipelines, tasks)[0] : null;
}

/** Erros conhecidos das negociações → resposta HTTP. */
export function dealErrorResponse(error: unknown, label: string): Response {
  if (error instanceof DealNotFoundError || error instanceof LeadNotFoundForDealError) return crmResponses.notFound();
  if (error instanceof PipelineNotFoundError) return Response.json({ error: "pipeline_changed" }, { status: 409 });
  if (error instanceof MissingLinkError) return Response.json({ error: "missing_link" }, { status: 409 });
  if (error instanceof LeadAlreadyConvertedError) return Response.json({ error: "already_converted", deal_id: error.dealId }, { status: 409 });
  if (error instanceof InvalidCustomValuesError) return Response.json({ error: "invalid_custom", fields: error.errors }, { status: 400 });
  console.error(`crm ${label} error`, error instanceof Error ? error.message : "unknown");
  return crmResponses.internal();
}

// ── Página da negociação ──


/** Erros da página da negociação → HTTP (cai no mapeamento geral no fim). */
export function dealDetailErrorResponse(error: unknown, label: string): Response {
  if (error instanceof StaleDealError) return Response.json({ error: "stale" }, { status: 409 });
  if (error instanceof NeedsCompanyError) return Response.json({ error: "needs_company" }, { status: 409 });
  if (error instanceof DealClosedError) return Response.json({ error: "deal_closed" }, { status: 409 });
  if (error instanceof ProductNotFoundError) return Response.json({ error: "invalid_input", fields: { product_id: "Produto não encontrado." } }, { status: 400 });
  if (error instanceof StorageNotConfiguredError) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  if (error instanceof InvalidFileError) return Response.json({ error: "invalid_file", reason: error.reason }, { status: 400 });
  if (error instanceof DuplicateFileError) return Response.json({ error: "duplicate_file", existing: error.existing }, { status: 409 });
  if (error instanceof FileNotFoundError || error instanceof TaskNotFoundError) return crmResponses.notFound();
  if (error instanceof DealSoldError) return Response.json({ error: "deal_sold" }, { status: 409 });
  if (error instanceof TaskParentNotFoundError) return Response.json({ error: "parent_not_found" }, { status: 404 });
  if (error instanceof AlreadyLinkedDealError) return Response.json({ error: "already_linked" }, { status: 409 });
  if (error instanceof RecipientNotAllowedError) return crmResponses.invalid();
  if (error instanceof EmailProviderError) {
    console.error(`crm ${label} provider error`, error.message);
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
  return dealErrorResponse(error, label);
}

/** Id da URL válido? */
export const validId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);
