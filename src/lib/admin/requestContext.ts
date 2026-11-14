import "server-only";
import { createHash } from "node:crypto";
import { hasValidAdminGate } from "./gate";

export interface GeoInfo {
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface RequestContext {
  ip: string;
  userAgent: string;
  geo: GeoInfo;
}

/**
 * IP do cliente. Na Vercel, `x-real-ip` / `x-forwarded-for` são definidos pela própria
 * plataforma. NÃO usamos `cf-connecting-ip`: fora da Cloudflare ele pode ser forjado.
 */
export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "unknown").slice(0, 64);
}

function decodeHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).slice(0, 120);
  } catch {
    return value.slice(0, 120);
  }
}

function parseCoord(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Localização aproximada a partir dos headers de geolocalização da Vercel (null em localhost). */
export function getGeo(headers: Headers): GeoInfo {
  return {
    city: decodeHeader(headers.get("x-vercel-ip-city")),
    region: decodeHeader(headers.get("x-vercel-ip-country-region")),
    country: decodeHeader(headers.get("x-vercel-ip-country")),
    latitude: parseCoord(headers.get("x-vercel-ip-latitude")),
    longitude: parseCoord(headers.get("x-vercel-ip-longitude")),
  };
}

export function getContextFromHeaders(headers: Headers): RequestContext {
  return {
    ip: getClientIp(headers),
    userAgent: (headers.get("user-agent") ?? "").slice(0, 400),
    geo: getGeo(headers),
  };
}

export function getRequestContext(request: Request): RequestContext {
  return getContextFromHeaders(request.headers);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Impressão digital do dispositivo (hash do user-agent). */
export function userAgentHash(ctx: RequestContext): string {
  return sha256(`ua|${ctx.userAgent}`);
}

/** Impressão digital da tentativa de login (IP + user-agent), usada no cookie temporário. */
export function attemptContextHash(ctx: RequestContext): string {
  return sha256(`attempt|${ctx.ip}|${ctx.userAgent}`);
}

const PRODUCTION_ORIGINS = ["https://tecfy.dev", "https://www.tecfy.dev"];

/**
 * A requisição veio do próprio site? Compara o header Origin com uma lista FIXA
 * (não confia em Host/X-Forwarded-Host). Em dev, aceita localhost/127.0.0.1 em qualquer porta.
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

const notFound = () => new Response(null, { status: 404 });
const MAX_BODY_BYTES = 2048;

/** Checagens de toda rota do painel: passou pelo proxy (gate) e veio do próprio site. */
export async function guardAdminRequest(request: Request): Promise<Response | null> {
  if (!(await hasValidAdminGate(request.headers))) return notFound();
  if (!isAllowedOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  return null;
}

/**
 * Validações comuns dos POSTs do painel: gate, origem, JSON e corpo pequeno.
 * Tudo aqui é barato (sem rede/banco). Retorna o objeto JSON ou uma Response de erro.
 */
export async function readGuardedJson(request: Request): Promise<Record<string, unknown> | Response> {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "invalid_input" }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES) {
    return Response.json({ error: "invalid_input" }, { status: 413 });
  }
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return Response.json({ error: "invalid_input" }, { status: 413 });
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }
    return data as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
}

/** Atraso aleatório aplicado em falhas (dificulta força bruta e ataques de tempo). */
export function failureDelay(): Promise<void> {
  const ms = 400 + Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
