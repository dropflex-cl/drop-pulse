import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { Readable } from "node:stream";
import zlib from "node:zlib";
import type { CompetitorErrorCode } from "./schemas";
import { extractTitle, htmlToText, ipLiteral, isPrivateAddress, MAX_TEXT_CHARS, normalizeCompetitorUrl, pageMeta } from "./text";

// Lee el texto de la página de una tienda de la competencia, sin ejecutar JS. El link lo pega el
// comerciante, así que se cuida del SSRF: solo http/https, sin credenciales, y cada host (también
// los de las redirecciones) tiene que resolver a IPs públicas. La conexión usa un `lookup` que
// vuelve a revisar la IP con la que de verdad conecta (contra el DNS rebinding).

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export class FetchPageError extends Error {
  constructor(public code: CompetitorErrorCode) {
    super(code);
  }
}

/** El host resuelve solo a IPs públicas; si no, `blocked_address` (o `dns_failed`). */
async function assertPublicHost(hostname: string): Promise<void> {
  const literal = ipLiteral(hostname);
  if (literal) {
    if (isPrivateAddress(literal)) throw new FetchPageError("blocked_address");
    return;
  }
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new FetchPageError("dns_failed");
  }
  if (!addresses.length) throw new FetchPageError("dns_failed");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new FetchPageError("blocked_address");
}

/** `lookup` de la conexión: resuelve como siempre y rechaza si alguna IP es privada. */
const safeLookup = ((hostname: string, options: object, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
  dnsLookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const list: LookupAddress[] = Array.isArray(address) ? address : [{ address, family: family ?? 4 }];
    if (list.some((a) => isPrivateAddress(a.address))) {
      const blocked: NodeJS.ErrnoException = new Error("blocked_address");
      blocked.code = "EBLOCKED";
      return callback(blocked, address, family);
    }
    callback(null, address, family);
  });
}) as unknown as http.RequestOptions["lookup"];

interface Hop {
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer;
}

function decoder(res: http.IncomingMessage): Readable {
  const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(zlib.createGunzip());
  if (enc === "deflate") return res.pipe(zlib.createInflate());
  if (enc === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

/** Una petición, sin seguir redirecciones. Lee hasta MAX_BYTES (ya descomprimido) y corta. */
function requestOnce(url: URL, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: safeLookup,
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "Accept-Language": "es-419,es;q=0.9,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, contentType, body: Buffer.alloc(0) });
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          resolve({ status, location: null, contentType, body: Buffer.alloc(0) });
          return;
        }
        const stream = decoder(res);
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve({ status, location: null, contentType, body: Buffer.concat(chunks) });
        };
        stream.on("data", (chunk: Buffer) => {
          if (done) return;
          const room = MAX_BYTES - size;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          size += Math.min(chunk.length, room);
          if (size >= MAX_BYTES) {
            // Se corta: con 2 MB de HTML alcanza para el texto de la página.
            finish();
            res.destroy();
          }
        });
        stream.on("end", finish);
        stream.on("error", (e) => (done ? undefined : reject(e)));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function charsetOf(contentType: string): string {
  const m = /charset\s*=\s*"?([\w-]+)/i.exec(contentType);
  return m ? m[1].toLowerCase() : "utf-8";
}

function decodeBody(body: Buffer, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function toFetchError(e: unknown): FetchPageError {
  if (e instanceof FetchPageError) return e;
  const err = e as NodeJS.ErrnoException & { name?: string };
  if (err?.name === "AbortError" || err?.name === "TimeoutError" || err?.code === "ABORT_ERR" || err?.code === "ETIMEDOUT") return new FetchPageError("timeout");
  if (err?.code === "EBLOCKED") return new FetchPageError("blocked_address");
  if (err?.code === "ENOTFOUND" || err?.code === "EAI_AGAIN") return new FetchPageError("dns_failed");
  return new FetchPageError("network");
}

/**
 * El texto visible de la página (con su descripción y precio de Open Graph al comienzo, si los
 * tiene), hasta 20.000 caracteres, y su título. Lanza `FetchPageError` con el código de la falla.
 */
export async function fetchPageText(rawUrl: string): Promise<{ text: string; title: string | null }> {
  const first = normalizeCompetitorUrl(rawUrl);
  if (!first) throw new FetchPageError("invalid_url");
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = new URL(first);
  try {
    for (let hop = 0; ; hop++) {
      await assertPublicHost(url.hostname);
      const res = await requestOnce(url, signal);
      if (res.status >= 300 && res.status < 400) {
        if (!res.location) throw new FetchPageError("http_error");
        if (hop >= MAX_REDIRECTS) throw new FetchPageError("too_many_redirects");
        let next: string | null = null;
        try {
          next = normalizeCompetitorUrl(new URL(res.location, url).toString());
        } catch {
          next = null;
        }
        if (!next) throw new FetchPageError("blocked_address");
        url = new URL(next);
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new FetchPageError("http_error");
      const type = res.contentType;
      const isHtml = !type || type.includes("html") || type.includes("xml");
      if (!isHtml && !type.startsWith("text/plain")) throw new FetchPageError("not_html");
      const raw = decodeBody(res.body, type);
      if (!isHtml) {
        const plain = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
        if (!plain) throw new FetchPageError("empty_page");
        return { text: plain, title: null };
      }
      const meta = pageMeta(raw);
      const body = htmlToText(raw);
      if (body.length < 40 && !meta) throw new FetchPageError("empty_page");
      const text = (meta ? `${meta}\n\n${body}` : body).slice(0, MAX_TEXT_CHARS);
      return { text, title: extractTitle(raw) };
    }
  } catch (e) {
    throw toFetchError(e);
  }
}
