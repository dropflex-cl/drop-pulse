import "server-only";
import { ApiError, GoogleGenAI, Modality, type ContentListUnion } from "@google/genai";
import sharp from "sharp";
import type { AiUsage } from "@/lib/ai/claude";
import type { AiGeneration } from "@/lib/ai/track";
import { imageCostUsd, type GeminiImageSize } from "./pricing";
import { classifyGemini429 } from "./quota";
import { parseImageResponse, type GeminiTokens } from "./response";

// Cliente de imágenes de Gemini (portado de dropflex v1, lib/ai/gemini/image-generator.ts): el mismo
// modelo con que v1 hacía los creativos (Gemini 3 Pro Image, «Nano Banana Pro»), el mismo reintento y el
// mismo respaldo a Flash cuando Pro está saturado. A diferencia de Higgsfield es síncrono: la imagen
// vuelve en la respuesta (sin cola, sin sondeo, sin URL que caduque), así que no hay request_id que
// recuperar. Cada llamada usa la clave del comerciante, en Vault (connection.ts), como Higgsfield.
// Nunca se loguea.
//
// El prompt lo arma quien llama: este módulo no sabe de creativos ni de páginas.

export const GEMINI_PROVIDER = "google" as const;

/** El modelo de los creativos de v1. Se puede cambiar por entorno si la cuenta usa otro id. */
export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3-pro-image";
/** Otro cupo de capacidad, render más débil. Vacío lo desactiva. */
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_IMAGE_FALLBACK_MODEL?.trim() ?? "gemini-3.1-flash-image";
/** 2K como v1 (el punto dulce del feed de Meta); 1K es igual de caro en Pro y más barato en Flash. */
export const GEMINI_IMAGE_SIZE = (process.env.GEMINI_IMAGE_SIZE?.trim() || "2K") as GeminiImageSize;

// Reintentos solo para lo pasajero (503 «high demand», otros 5xx, 429 por minuto): fallan antes de
// producir la imagen, así que no cuestan, solo tiempo. El reintento propio del SDK queda apagado para
// que el conteo viva aquí y nunca se multiplique. 4 intentos con base de 4 s esperan ~28 s (4+8+16 más
// jitter): los picos de Pro duran minutos, y un reintento de 2 s era decorativo (v1, agosto 2026).
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 4000;
// El respaldo existe para esquivar un pico, no para esperar otro: comparte el tope de la función.
const FALLBACK_ATTEMPTS = 2;
// Una imagen a 2K tarda ~25 s y a veces 90 s (costo-actual de v1): el tope es por intento.
const TIMEOUT_MS = 120_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type GeminiAspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";

export interface GeminiImageInput {
  /** La clave del comerciante (connection.ts › geminiKey). */
  apiKey: string;
  prompt: string;
  /** Referencias en orden: la imagen base primero (imagesForGeneration). */
  images: { bytes: Buffer | Uint8Array; mime: string }[];
  aspectRatio?: GeminiAspectRatio;
  size?: GeminiImageSize;
  /** Por defecto GEMINI_IMAGE_MODEL. */
  model?: string;
  /** Por defecto GEMINI_FALLBACK_MODEL; null lo desactiva para esta llamada. */
  fallbackModel?: string | null;
}

export interface GeminiImageResult {
  bytes: Buffer;
  mime: string;
  width: number | null;
  height: number | null;
  /** El que la generó (puede ser el respaldo): es lo que va a ai_generations.model. */
  model: string;
  fallback: boolean;
  size: GeminiImageSize;
  /** Listo para recordAiGeneration({ provider: "google", usage }). */
  usage: AiUsage;
  /** El modelo o la resolución no están en la tabla de precios: costo con el precio de Pro. */
  costEstimated: boolean;
}

export type GeminiErrorCode = "invalid_key" | "no_access" | "no_credits" | "busy" | "unavailable" | "bad_request" | "blocked" | "no_image" | "too_large" | "network" | "timeout";

/** Qué pasó, con un código para el registro y un mensaje en español para la pantalla (como HiggsfieldError). */
export class GeminiError extends Error {
  constructor(
    public code: GeminiErrorCode,
    message: string,
    public status?: number,
    /** Hubo respuesta y se cobró (bloqueada o sin imagen): el intento se registra con este costo. */
    public usage?: AiUsage,
    public model?: string,
  ) {
    super(message);
  }

  /** Vale reintentar: pasajero y sin cobro. Un timeout no: el pedido pudo llegar y cobrarse. */
  get retryable(): boolean {
    return this.code === "busy" || this.code === "unavailable" || this.code === "network";
  }
}

// Un cliente por clave, reutilizado en la instancia (cada comerciante trae la suya).
const clients = new Map<string, GoogleGenAI>();

function genai(key: string): GoogleGenAI {
  let c = clients.get(key);
  if (!c) clients.set(key, (c = new GoogleGenAI({ apiKey: key })));
  return c;
}

/**
 * Valida la clave con la lectura más chica que hay (los datos del modelo de imágenes): no cuesta cuota
 * y además comprueba que la cuenta tenga acceso a ese modelo. Lanza GeminiError con el motivo.
 */
export async function checkKey(key: string): Promise<void> {
  try {
    await genai(key).models.get({ model: GEMINI_IMAGE_MODEL, config: { httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } } } });
  } catch (e) {
    const err = toGeminiError(e);
    if (err.code === "bad_request" && err.status === 404) throw new GeminiError("no_access", "Tu cuenta de Gemini no tiene acceso al modelo de imágenes (Gemini 3 Pro Image).", 404);
    throw err;
  }
}

// Fallas de conexión en que el pedido no salió (se reintentan) y cortes por tiempo (no: pudo cobrarse).
const NOT_SENT = /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR_SOCKET|other side closed|fetch failed/i;
const TIMED_OUT = /timeout|timed out|aborted|ETIMEDOUT/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Errores del SDK (y de red) a nuestra taxonomía. */
export function toGeminiError(e: unknown): GeminiError {
  if (e instanceof GeminiError) return e;
  const message = e instanceof Error ? e.message : String(e);
  const status = e instanceof ApiError ? e.status : ((e as { status?: number })?.status ?? 0);
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID/i.test(message))
    return new GeminiError("invalid_key", "Gemini no reconoce tu clave. Revísala en Ajustes.", status);
  if (status === 429) {
    if (classifyGemini429(message) === "rate") return new GeminiError("busy", "Gemini está con mucha demanda. Intenta de nuevo en un momento.", status);
    // El registro guarda solo el código; el cuerpo dice qué cuota exacta se agotó, y eso necesita leerlo
    // quien arregle la cuenta.
    console.warn(`[gemini] cuota agotada: ${message.slice(0, 500)}`);
    return new GeminiError("no_credits", "Tu cuenta de Gemini no tiene cuota disponible. Revisa tu plan y facturación en Google AI Studio y vuelve a intentar.", status);
  }
  if (status >= 500) return new GeminiError("unavailable", "Gemini no respondió. Intenta de nuevo en un momento.", status);
  if (status === 400 || status === 404) {
    console.error(`[gemini] ${status}`, message.slice(0, 300));
    return new GeminiError("bad_request", "Gemini no aceptó la solicitud. Intenta de nuevo; si vuelve a pasar, avísanos.", status);
  }
  if (TIMED_OUT.test(message)) {
    console.error("[gemini] sin respuesta a tiempo:", message.slice(0, 300));
    return new GeminiError("timeout", "Gemini tardó demasiado en generar la imagen. Toca Generar de nuevo.");
  }
  if (NOT_SENT.test(message) || e instanceof TypeError) {
    console.error("[gemini] sin conexión:", message.slice(0, 300));
    return new GeminiError("network", "No pudimos conectarnos con Gemini. Intenta de nuevo en un momento.");
  }
  console.error(`[gemini] ${status}`, message.slice(0, 300));
  return new GeminiError("bad_request", "Gemini no pudo generar la imagen. Intenta de nuevo; si vuelve a pasar, avísanos.", status);
}

async function callModel(key: string, model: string, contents: ContentListUnion, aspectRatio: GeminiAspectRatio, size: GeminiImageSize, attempts: number) {
  let last: GeminiError | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await genai(key).models.generateContent({
        model,
        contents,
        config: {
          responseModalities: [Modality.IMAGE],
          // El lienzo y la resolución van por imageConfig (Pro y Flash 3.x lo respetan).
          imageConfig: { aspectRatio, imageSize: size },
          httpOptions: { timeout: TIMEOUT_MS, retryOptions: { attempts: 1 } },
        },
      });
    } catch (e) {
      last = toGeminiError(e);
      if (!last.retryable || attempt >= attempts) throw last;
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * RETRY_BASE_MS));
    }
  }
  throw last ?? new GeminiError("unavailable", "Gemini no respondió. Intenta de nuevo en un momento.");
}

function usageOf(model: string, size: GeminiImageSize, tokens: GeminiTokens, images: number, latencyMs: number): { usage: AiUsage; estimated: boolean } {
  const cost = imageCostUsd(model, size, { inputTokens: tokens.inputTokens, textOutputTokens: tokens.textOutputTokens, images });
  return {
    usage: { model, inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: cost.usd, latencyMs },
    estimated: cost.estimated,
  };
}

/**
 * Genera una imagen desde las referencias y el prompt. Lanza GeminiError; si hubo respuesta cobrada
 * (bloqueada o sin imagen), el error trae `usage` para registrarla con su costo.
 */
export async function generateImage(input: GeminiImageInput): Promise<GeminiImageResult> {
  const size = input.size ?? GEMINI_IMAGE_SIZE;
  const aspectRatio = input.aspectRatio ?? "1:1";
  const fallbackModel = input.fallbackModel === undefined ? GEMINI_FALLBACK_MODEL : input.fallbackModel;
  const contents: ContentListUnion = [
    ...input.images.map((i) => ({ inlineData: { data: Buffer.from(i.bytes).toString("base64"), mimeType: i.mime } })),
    { text: input.prompt },
  ];

  const started = Date.now();
  let model = input.model ?? GEMINI_IMAGE_MODEL;
  let response;
  try {
    response = await callModel(input.apiKey, model, contents, aspectRatio, size, MAX_ATTEMPTS);
  } catch (e) {
    const failure = toGeminiError(e);
    // Solo la falta de capacidad pasa al respaldo: la cuota de Gemini es por modelo, así que Flash puede
    // tener cupo, y un pedido rechazado no cuesta. Clave, 400 o filtro fallarían igual en el otro.
    const capacity = failure.retryable || failure.code === "no_credits";
    if (!capacity || !fallbackModel || fallbackModel === model) throw failure;
    console.warn(`[gemini] ${model} no disponible (${failure.code}); se usa ${fallbackModel}`);
    model = fallbackModel;
    response = await callModel(input.apiKey, model, contents, aspectRatio, size, FALLBACK_ATTEMPTS);
  }
  const latencyMs = Date.now() - started;

  const parsed = parseImageResponse(response);
  // El id que respondió de verdad (p. ej., con sufijo de versión) si lo informa.
  const ran = response.modelVersion?.replace(/^models\//, "") || model;
  if (!parsed.ok) {
    const { usage } = usageOf(ran, size, parsed.tokens, 0, latencyMs);
    console.warn(`[gemini] sin imagen (${parsed.reason})${parsed.text ? `: ${parsed.text.slice(0, 200)}` : ""}`);
    throw parsed.code === "blocked"
      ? new GeminiError("blocked", "Gemini rechazó la imagen por sus reglas de contenido. Cambia los textos o la escena y genera de nuevo.", undefined, usage, ran)
      : new GeminiError("no_image", "Gemini respondió sin imagen. Toca Generar de nuevo.", undefined, usage, ran);
  }
  const { usage, estimated } = usageOf(ran, size, parsed.tokens, 1, latencyMs);
  if (parsed.bytes.length > MAX_IMAGE_BYTES) throw new GeminiError("too_large", "La imagen de Gemini es demasiado pesada. Genera de nuevo con menor resolución.", undefined, usage, ran);

  const meta = await sharp(parsed.bytes).metadata().catch(() => null);
  return {
    bytes: parsed.bytes,
    mime: parsed.mime,
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    model: ran,
    fallback: model !== (input.model ?? GEMINI_IMAGE_MODEL),
    size,
    usage,
    costEstimated: estimated,
  };
}

/**
 * Los campos de recordAiGeneration para un intento, logrado o fallido: el modelo que corrió, los tokens y
 * el costo calculado (una falla antes de la respuesta no cuesta y queda sin usage).
 *
 * @example
 * await recordAiGeneration({ userId, productId, step: "creative_render", detail, ...geminiGeneration(result) });
 */
export function geminiGeneration(outcome: GeminiImageResult | unknown): Pick<AiGeneration, "provider" | "model" | "usage" | "error" | "costEstimated"> {
  if (outcome && typeof outcome === "object" && "bytes" in outcome && "usage" in outcome) {
    const r = outcome as GeminiImageResult;
    return { provider: GEMINI_PROVIDER, model: r.model, usage: r.usage, error: null, costEstimated: r.costEstimated };
  }
  const e = toGeminiError(outcome);
  return { provider: GEMINI_PROVIDER, model: e.model ?? e.usage?.model ?? GEMINI_IMAGE_MODEL, usage: e.usage, error: e.code };
}
