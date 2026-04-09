const DEFAULT_API_BASE_URL = "http://localhost:4200";
const DEFAULT_SCHEDULE_MEETING_URL = "https://calendly.com";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
export const SCHEDULE_MEETING_URL =
  process.env.NEXT_PUBLIC_SCHEDULE_MEETING_URL?.trim() || DEFAULT_SCHEDULE_MEETING_URL;

export function getApiUrl(endpoint: string): string {
  const normalizedBase = API_BASE_URL.replace(/\/+$/, "");
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
}
