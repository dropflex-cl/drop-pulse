import "server-only";

// Cliente de la API de Higgsfield (docs/spec-creativos.md §2). Cada llamada usa la clave del
// comerciante (KEY_ID:KEY_SECRET, en Vault). Todo es asíncrono: se envía, se consulta el estado y el
// resultado se copia a nuestro bucket (las URLs de salida duran ~7 días). Fetch directo: el SDK TS v2
// solo expone `subscribe`, que espera bloqueando. Nunca se loguea la clave.

const BASE = "https://api.higgsfield.ai";
const TIMEOUT_MS = 30_000;

/** Qué pasó, con un código para el registro y un mensaje en español para la pantalla. */
export class HiggsfieldError extends Error {
  constructor(
    public code: "invalid_key" | "no_credits" | "no_access" | "busy" | "bad_request" | "unavailable" | "network",
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function toError(status: number, body: string): HiggsfieldError {
  const detail = body.slice(0, 300);
  if (status === 401) return new HiggsfieldError("invalid_key", "Higgsfield no reconoce tu clave. Revísala en Ajustes.", status);
  if (status === 403 && /credit/i.test(detail)) return new HiggsfieldError("no_credits", "Tu cuenta de Higgsfield no tiene créditos. Recarga en higgsfield.ai y vuelve a intentar.", status);
  if ([403, 404, 423].includes(status)) return new HiggsfieldError("no_access", "Tu cuenta de Higgsfield no tiene acceso a este modelo.", status);
  // El límite es de solicitudes simultáneas por cuenta: se reintenta cuando se libera una.
  if (status === 400 && /concurrent/i.test(detail)) return new HiggsfieldError("busy", "Higgsfield está procesando otras imágenes tuyas. La tuya sigue en cola.", status);
  if (status === 429) return new HiggsfieldError("busy", "Higgsfield está con mucha demanda. La imagen sigue en cola.", status);
  if (status >= 500) return new HiggsfieldError("unavailable", "Higgsfield no respondió. Intenta de nuevo en un momento.", status);
  console.error(`[higgsfield] ${status}`, detail);
  return new HiggsfieldError("bad_request", "Higgsfield no aceptó la solicitud. Intenta de nuevo; si vuelve a pasar, avísanos.", status);
}

async function call<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  // `status_url` llega absoluta y en otro dominio (platform.higgsfield.ai): se usa tal cual.
  const url = /^https:\/\//.test(path) ? path : `${BASE}/${path.replace(/^\//, "")}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", Accept: "application/json", ...init.headers },
      cache: "no-store",
    });
  } catch {
    throw new HiggsfieldError("network", "No pudimos conectarnos con Higgsfield. Intenta de nuevo en un momento.");
  }
  const text = await res.text();
  if (!res.ok) throw toError(res.status, text);
  return (text ? JSON.parse(text) : null) as T;
}

/** Sube una imagen propia (p. ej., la foto base) y devuelve su URL pública para usarla como referencia. */
export async function uploadImage(key: string, bytes: Buffer, contentType: "image/jpeg" | "image/png" | "image/webp"): Promise<string> {
  const u = await call<{ upload_url: string; public_url: string; upload_headers: Record<string, string> }>(key, "files/generate-upload-url", {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
  });
  let put: Response;
  try {
    put = await fetch(u.upload_url, { method: "PUT", headers: u.upload_headers, body: new Uint8Array(bytes), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new HiggsfieldError("network", "No pudimos subir la foto del producto a Higgsfield. Intenta de nuevo.");
  }
  if (!put.ok) throw new HiggsfieldError("unavailable", "Higgsfield no aceptó la foto del producto. Intenta de nuevo.", put.status);
  return u.public_url;
}

export async function submit(key: string, endpoint: string, input: Record<string, unknown>): Promise<{ requestId: string }> {
  const r = await call<{ request_id: string }>(key, endpoint, { method: "POST", body: JSON.stringify(input) });
  return { requestId: r.request_id };
}

export type RequestStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export interface RequestState {
  status: RequestStatus;
  images: string[];
  video: string | null;
}

export async function requestStatus(key: string, requestId: string): Promise<RequestState> {
  const r = await call<{ status: RequestStatus; images?: { url: string }[]; video?: { url: string } | null }>(key, `requests/${encodeURIComponent(requestId)}/status`);
  return { status: r.status, images: (r.images ?? []).map((i) => i.url), video: r.video?.url ?? null };
}

export interface Preset {
  id: string;
  name: string;
  group: string;
  ratio: string | null;
  cover: string | null;
}

/** El catálogo de presets de Marketing Studio visibles para la cuenta (spec §2.4). Cambia: nunca se hardcodea. */
export async function listPresets(key: string): Promise<Preset[]> {
  const out: Preset[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const q: string = `marketing-studio/image/presets?size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await call<{
      items: { id: string; name: string; cover_image?: { url: string } | null; metadata?: { aspect_ratio?: string; group_name?: string } | null }[];
      cursor: string | null;
    }>(key, q);
    for (const i of r.items) {
      out.push({ id: i.id, name: i.name, group: i.metadata?.group_name ?? "", ratio: i.metadata?.aspect_ratio ?? null, cover: i.cover_image?.url ?? null });
    }
    cursor = r.cursor;
    if (!cursor) break;
  }
  return out;
}
