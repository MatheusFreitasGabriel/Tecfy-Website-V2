const DEFAULT_API_BASE_URL = "https://31rwlm1ske.execute-api.us-east-1.amazonaws.com/api/v1";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
export const SCHEDULE_MEETING_URL =
  process.env.NEXT_PUBLIC_SCHEDULE_MEETING_URL?.trim()

export function getApiUrl(endpoint: string): string {
  const normalizedBase = API_BASE_URL.replace(/\/+$/, "");
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
}
