import "server-only";
import { createHmac } from "node:crypto";
import { metaEnv } from "../env";

// Cliente de la Graph API. Portado de dropflex (lib/ads/meta/client.ts) con las correcciones del spec
// (fallas 12, 15 y 18): versión desde META_GRAPH_VERSION, appsecret_proof en cada llamada, timeout,
// solo se reintentan GET, el código 100 es un error de parámetros (no “no existe”) y un 403 sin código
// de autenticación es falta de permiso, no un token vencido.

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 500;
const TIMEOUT_MS = 15_000;
const MAX_PAGES = 20;
/** Subir un video por URL o crear un creativo puede tardar más que una lectura. */
const POST_TIMEOUT_MS = 60_000;
/** Espera extra ante throttling en escrituras: Meta pide bajar el ritmo, no reintentar al tiro. */
const THROTTLE_PAUSE_MS = 2_000;

const AUTH_CODES = new Set([190, 102, 463, 467]);
const PERMISSION_CODES = new Set([10, 200, 272, 294, 299]);
const THROTTLE_CODES = new Set([4, 17, 32, 341, 613, 80004]);

/** Token inválido, vencido o revocado: hay que volver a conectar. */
export class MetaAuthError extends Error {}
/** Falta un permiso para esa llamada. */
export class MetaPermissionError extends Error {}
export class MetaApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: number,
    /** Lo que Meta quiere mostrarle a la persona (error_user_msg), si lo manda. */
    public userMessage?: string,
  ) {
    super(message);
  }
}

interface MetaError {
  error?: { message?: string; code?: number; error_subcode?: number; error_user_title?: string; error_user_msg?: string; is_transient?: boolean; fbtrace_id?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (attempt: number) => Math.random() * BASE_DELAY_MS * 2 ** attempt;

export function graphUrl(path: string): URL {
  return new URL(`https://graph.facebook.com/${metaEnv().graphVersion}${path}`);
}

export function appSecretProof(token: string): string {
  return createHmac("sha256", metaEnv().appSecret).update(token).digest("hex");
}

function mapError(status: number, body: MetaError): Error {
  const code = body.error?.code;
  const msg = body.error?.message ?? `Meta respondió ${status}`;
  if (code != null && AUTH_CODES.has(code)) return new MetaAuthError(msg);
  if (code != null && PERMISSION_CODES.has(code)) return new MetaPermissionError(msg);
  if (status === 401) return new MetaAuthError(msg);
  if (status === 403) return new MetaPermissionError(msg);
  return new MetaApiError(msg, status, code, body.error?.error_user_msg ?? body.error?.error_user_title);
}

export async function graphGet<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = path.startsWith("https://") ? new URL(path) : graphUrl(path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", appSecretProof(token));

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw new MetaApiError(`Meta no respondió: ${(e as Error).message}`);
      await sleep(jitter(attempt));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as T & MetaError;
    const failed = !res.ok || body.error != null;
    if (!failed) return body;
    const code = body.error?.code;
    const retryable = res.status === 429 || res.status >= 500 || (code != null && THROTTLE_CODES.has(code)) || Boolean(body.error?.is_transient);
    if (retryable && attempt < MAX_RETRIES) {
      await sleep(jitter(attempt));
      continue;
    }
    throw mapError(res.status, body);
  }
}

/** Sigue `paging.next` hasta MAX_PAGES (dropflex solo leía la primera página: falla 13). */
export async function graphList<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  let page = await graphGet<{ data?: T[]; paging?: { next?: string } }>(token, path, { limit: "100", ...params });
  for (let i = 0; ; i++) {
    out.push(...(page.data ?? []));
    const next = page.paging?.next;
    if (!next || i + 1 >= MAX_PAGES) break;
    // `next` ya trae access_token; graphGet lo reemplaza y agrega appsecret_proof.
    page = await graphGet(token, next);
  }
  return out;
}

/**
 * Una escritura (crear, pausar, cambiar presupuesto). Solo se reintenta el throttling de Meta, que
 * garantiza que no se aplicó: un 5xx o un corte de red pudo haber creado el objeto, y reintentarlo
 * dejaría un duplicado (la reversión del lanzamiento se encarga de lo que quede a medias).
 */
export async function graphPost<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const url = graphUrl(path);
  const form = new URLSearchParams(params);
  form.set("access_token", token);
  form.set("appsecret_proof", appSecretProof(token));

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new MetaApiError(`Meta no respondió: ${(e as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as T & MetaError;
    if (res.ok && body.error == null) return body;
    const code = body.error?.code;
    if ((res.status === 429 || (code != null && THROTTLE_CODES.has(code))) && attempt < MAX_RETRIES) {
      await sleep(jitter(attempt) + THROTTLE_PAUSE_MS);
      continue;
    }
    const e = body.error ?? {};
    console.error(`[meta] POST ${path} → ${res.status} | code=${e.code ?? "?"} subcode=${e.error_subcode ?? "?"} trace=${e.fbtrace_id ?? "?"} | ${e.message ?? "(sin mensaje)"}`);
    throw mapError(res.status, body);
  }
}
