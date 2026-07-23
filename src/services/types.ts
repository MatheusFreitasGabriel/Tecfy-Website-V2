export interface LeadRequest {
  lead_name: string;
  lead_email: string;
  lead_phone: string;
  interest_plan: string;
  turnstile_token: string;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  status: number;
}

export type LeadInsertResponseData = Record<string, unknown>;