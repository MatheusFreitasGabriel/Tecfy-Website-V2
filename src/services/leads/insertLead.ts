import { ApiResponse, LeadInsertResponseData, LeadRequest } from "@/services/types";
import { getApiUrl } from "@/services/api/apiConfig";

const LEADS_INSERT_ENDPOINT = "/leads/insert";

export class LeadInsertError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "LeadInsertError";
  }
}

export async function insertLead(lead: LeadRequest): Promise<LeadInsertResponseData> {
  const response = await fetch(getApiUrl(LEADS_INSERT_ENDPOINT), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(lead)
  });

  let parsedBody: unknown = null;

  try {
    parsedBody = await response.json();
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    throw new LeadInsertError(
      "Nao foi possivel enviar seus dados. Tente novamente.",
      response.status,
      parsedBody
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    return {};
  }

  if ("data" in parsedBody) {
    return (parsedBody as ApiResponse<LeadInsertResponseData>).data ?? {};
  }

  return parsedBody as LeadInsertResponseData;
}
