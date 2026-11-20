/** Chamada JSON às rotas do painel: devolve status + dados (nunca lança por HTTP; só sem conexão). */
export async function callApi<T = Record<string, unknown>>(url: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; fields?: Record<string, string>; reason?: string; existing?: string } }> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { ok: response.ok, status: response.status, data };
}

/** Mensagem amigável para os erros mais comuns da página da negociação. */
export function apiErrorMessage(status: number, error?: string): string {
  if (status === 401) return "Sua sessão expirou. Entre de novo no painel.";
  if (error === "stale") return "Outra pessoa alterou esta negociação agora há pouco. Os dados foram atualizados — confira e repita.";
  if (error === "needs_company") return "Vincule uma empresa à negociação antes de registrar a venda (o contrato é da empresa).";
  if (error === "deal_closed") return "Esta negociação já foi encerrada. Reabra para mudar.";
  if (error === "pipeline_changed") return "O funil mudou. Atualize a página e escolha a etapa de novo.";
  if (error === "deal_sold") return "Negociação vendida não pode ser excluída. Desfaça a venda antes.";
  if (error === "already_linked") return "A negociação já tem esse vínculo.";
  if (error === "missing_link") return "O cadastro escolhido não existe mais.";
  if (error === "storage_not_configured") return "O armazenamento de arquivos ainda não está configurado.";
  if (error === "duplicate_file") return "Este arquivo já está anexado nesta negociação.";
  if (error === "invalid_file") return "Arquivo recusado: envie PDF, Word (.docx), PowerPoint (.pptx) ou Excel (.xlsx) de até 25 MB.";
  if (status === 404) return "Esta negociação não existe mais.";
  if (status === 400) return "Confira os campos e tente de novo.";
  return "Não foi possível concluir. Tente de novo.";
}
