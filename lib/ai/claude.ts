import { accountError, anthropicClient } from "@/lib/integrations/anthropic/client";
import { anthropicKey, markAnthropicInvalid, NO_ANTHROPIC_KEY } from "@/lib/integrations/anthropic/connection";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import "server-only";
import type * as z from "zod/v4";
import { toJSONSchema } from "zod/v4";
import { AI_MODEL } from "./model";
import { firstText, readStructured, sumUsage } from "./structured";

// Una llamada estructurada a Claude: system estable (se cachea), contenido del producto en el
// mensaje del usuario, salida validada con zod por nosotros (lib/ai/structured.ts), no por el SDK. Modelo: Claude Opus 5 con pensamiento adaptativo y
// `fallbacks: "default"` (si el modelo declina por política, la API reintenta con el recomendado
// dentro de la misma llamada).
//
// Cada llamada usa la clave de Anthropic del comerciante (Ajustes › Inteligencia artificial, en Vault),
// como Higgsfield y Gemini. No hay clave del servidor de respaldo: sin clave conectada, la IA no corre.

export { AI_MODEL };

/** USD por millón de tokens. Escritura de caché a 1,25×; lectura a 0,1× (Opus 5.5: 0,05×). */
const PRICING: Record<string, { input: number; output: number; cacheRead?: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.05 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  latencyMs: number;
}

/** Falla de un paso, con un código para el registro y un mensaje en español para la pantalla. */
export class AiStepError extends Error {
  constructor(
    public code: string,
    message: string,
    public usage?: AiUsage,
    /** El intento ya quedó en ai_generations (lib/ai/track.ts): no se registra dos veces. */
    public logged = false,
    /** Por qué no se pudo leer la respuesta (`invalid_output`): va a ai_generations.problems. */
    public problems?: string[],
  ) {
    super(message);
  }
}

export function costOf(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  const p = PRICING[model] ?? PRICING[AI_MODEL];
  const usd = (u.input * p.input + u.cacheRead * p.input * (p.cacheRead ?? 0.1) + u.cacheWrite * p.input * 1.25 + u.output * p.output) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/**
 * Con qué clave se llama: la del comerciante (`userId`, leída de Vault) o, solo en scripts locales
 * (scripts/eval-models.ts), una explícita (`apiKey`). La app siempre pasa `userId`.
 */
export type AiAuth = { userId: string; apiKey?: never } | { apiKey: string; userId?: never };

async function client(auth: AiAuth): Promise<Anthropic> {
  const key = auth.userId ? await anthropicKey(auth.userId) : auth.apiKey;
  if (!key) throw new AiStepError("no_key", NO_ANTHROPIC_KEY);
  return anthropicClient(key);
}

/** La API no compila esquemas muy grandes a gramática: se reintenta sin ella (ver generateStructured). */
const GRAMMAR_TOO_LARGE = /grammar is too large|schema is too (large|complex)/i;
class GrammarTooLarge extends Error {}

type Message = Anthropic.Beta.Messages.BetaMessage;

function usageOf(res: Message, started: number): AiUsage {
  const u = res.usage;
  return {
    model: res.model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    costUsd: costOf(res.model, {
      input: u.input_tokens,
      output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    }),
    latencyMs: Date.now() - started,
  };
}

function checkStop(res: Message, usage: AiUsage) {
  if (res.stop_reason === "refusal") {
    throw new AiStepError("refusal", "La IA no quiso trabajar con este producto. Revisa que la información no prometa resultados de salud y reintenta.", usage);
  }
  if (res.stop_reason === "max_tokens") {
    throw new AiStepError("max_tokens", "La respuesta de la IA quedó incompleta. Reintenta.", usage);
  }
}

async function apiError(e: unknown, auth: AiAuth): Promise<AiStepError> {
  if (e instanceof AiStepError) return e;
  // La clave, el saldo o el acceso del comerciante: lo arregla él en Ajustes o en su consola.
  const account = accountError(e);
  if (account) {
    // Clave rechazada: queda inválida y la IA no se ofrece hasta que pegue otra (como Higgsfield y Gemini).
    if (account.code === "invalid_key" && auth.userId) {
      await markAnthropicInvalid(auth.userId, account.message).catch((err) => console.error("[ai] marcar la clave de Anthropic", err));
    }
    return new AiStepError(account.code, account.message);
  }
  if (e instanceof Anthropic.RateLimitError) return new AiStepError("rate_limited", "La IA está con mucha demanda. Intenta de nuevo en un minuto.");
  // El motivo real queda en los logs (Vercel): la pantalla solo muestra el mensaje en español.
  if (e instanceof Anthropic.APIError) console.error(`[ai] ${e.status ?? "?"} ${e.requestID ?? ""}`, e.message);
  if (e instanceof Anthropic.BadRequestError) return new AiStepError("bad_request", "La IA no pudo procesar este producto. Reintenta en un momento; si vuelve a pasar, avísanos.");
  // Sin respuesta de la API (incluye el tiempo agotado): ese sí es un problema de conexión.
  if (e instanceof Anthropic.APIConnectionError) return new AiStepError("network", "No pudimos conectarnos con la IA. Intenta de nuevo en un momento.");
  if (e instanceof Anthropic.APIError) return new AiStepError(`api_${e.status ?? "error"}`, "La IA no respondió. Intenta de nuevo en un momento.");
  console.error("[ai] error inesperado", e);
  return new AiStepError("unexpected", "La IA no respondió. Intenta de nuevo en un momento.");
}

/** El primer objeto JSON del texto (tolera ```json … ``` alrededor). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("sin objeto JSON");
  return JSON.parse(text.slice(start, end + 1));
}

export async function generateStructured<S extends z.ZodType>({
  system,
  content,
  schema,
  effort,
  maxTokens = 16000,
  model = AI_MODEL,
  cacheSystem = true,
  ...auth
}: AiAuth & {
  /** Vacío: sin system (el prompt guardado en la base va entero en el mensaje del usuario). */
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
  /** Por defecto AI_MODEL; un paso puede pedir otro (ver scripts/eval-models.ts). */
  model?: string;
  /**
   * false en una llamada que no se repite con el mismo prefijo (una corrección con otro esquema de
   * salida): escribir la caché cuesta 1,25× y nadie la leería.
   */
  cacheSystem?: boolean;
}): Promise<{ data: z.infer<S>; usage: AiUsage }> {
  const started = Date.now();
  const base = {
    model,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    thinking: { type: "adaptive" as const },
    messages: [{ role: "user" as const, content }],
  };
  const anthropic = await client(auth);
  // El formato va sin su `parse`: la respuesta la lee readStructured, que conserva el costo y el motivo.
  const format = { type: "json_schema" as const, schema: betaZodOutputFormat(schema).schema };
  const call = async (): Promise<{ data: z.infer<S>; usage: AiUsage } | { problems: string[]; usage: AiUsage }> => {
    const callStarted = Date.now();
    let res: Message;
    try {
      res = await anthropic.beta.messages.create({
        ...base,
        output_config: { effort, format },
        ...(system ? { system: [{ type: "text" as const, text: system, ...(cacheSystem ? { cache_control: { type: "ephemeral" as const } } : {}) }] } : {}),
      });
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError && GRAMMAR_TOO_LARGE.test(e.message)) throw new GrammarTooLarge(e.requestID ?? "");
      throw await apiError(e, auth);
    }
    const usage = usageOf(res, callStarted);
    checkStop(res, usage);
    const read = readStructured(schema, firstText(res.content));
    return "data" in read ? { data: read.data, usage } : { problems: read.problems, usage };
  };

  let first;
  try {
    first = await call();
  } catch (e) {
    if (e instanceof GrammarTooLarge) {
      // Red de seguridad: sin gramática, el modelo devuelve el JSON como texto y se valida aquí
      // con el mismo esquema. Un esquema que llega a esto se debe achicar (ver lib/angles/schemas.ts).
      console.warn(`[ai] esquema demasiado grande para la salida estructurada (${e.message}); se reintenta sin gramática`);
      return generateUnconstrained({ anthropic, auth, base, system, schema, effort, started });
    }
    throw e;
  }
  if ("data" in first) return first;
  // Una respuesta que no calza con el esquema es rara y casual: se pide otra vez, igual (el prefijo ya
  // está en caché). Los dos intentos se pagaron y quedan en la misma fila.
  console.warn("[ai] la respuesta no cumple el esquema; se pide otra vez", first.problems);
  const second = await call().catch((e: unknown) => {
    if (e instanceof AiStepError) e.usage = e.usage ? sumUsage(first.usage, e.usage) : first.usage;
    throw e;
  });
  const usage = sumUsage(first.usage, second.usage);
  if ("data" in second) return { data: second.data, usage };
  console.error("[ai] la respuesta tampoco cumple el esquema la segunda vez", second.problems);
  throw new AiStepError("invalid_output", "La IA respondió en un formato inesperado. Reintenta.", usage, false, second.problems);
}

async function generateUnconstrained<S extends z.ZodType>({
  anthropic,
  auth,
  base,
  system,
  schema,
  effort,
  started,
}: {
  anthropic: Anthropic;
  auth: AiAuth;
  base: Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, "system" | "output_config">;
  system: string;
  schema: S;
  effort: "low" | "medium" | "high";
  started: number;
}): Promise<{ data: z.infer<S>; usage: AiUsage }> {
  const format = [
    "FORMATO DE SALIDA",
    "Responde solo con un objeto JSON válido (sin texto antes ni después, sin ```) que cumpla este JSON Schema:",
    JSON.stringify(toJSONSchema(schema)),
  ].join("\n");
  let res: Message;
  try {
    res = await anthropic.beta.messages.create({
      ...base,
      output_config: { effort },
      system: [...(system ? [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }] : []), { type: "text", text: format }],
    });
  } catch (e) {
    throw await apiError(e, auth);
  }
  const usage = usageOf(res, started);
  checkStop(res, usage);
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed;
  try {
    parsed = schema.safeParse(extractJson(text));
  } catch {
    parsed = null;
  }
  if (!parsed?.success) {
    if (parsed) console.error("[ai] la salida sin gramática no cumple el esquema", parsed.error.issues.slice(0, 5));
    throw new AiStepError("invalid_output", "La IA respondió en un formato inesperado. Reintenta.", usage);
  }
  return { data: parsed.data as z.infer<S>, usage };
}
