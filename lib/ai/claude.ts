import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { toJSONSchema } from "zod/v4";
import type * as z from "zod/v4";

// Una llamada estructurada a Claude: system estable (se cachea), contenido del producto en el
// mensaje del usuario, salida validada con zod. Modelo: Claude Opus 5 con pensamiento adaptativo y
// `fallbacks: "default"` (si el modelo declina por política, la API reintenta con el recomendado
// dentro de la misma llamada).

export const AI_MODEL = "claude-opus-5";

/** USD por millón de tokens. Lectura de caché a 0,1×; escritura a 1,25×. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
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
  ) {
    super(message);
  }
}

export function costOf(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  const p = PRICING[model] ?? PRICING[AI_MODEL];
  const usd = (u.input * p.input + u.cacheRead * p.input * 0.1 + u.cacheWrite * p.input * 1.25 + u.output * p.output) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new AiStepError("config", "Falta configurar la IA en el servidor (ANTHROPIC_API_KEY). Avísanos para activarla.");
  }
  // Una key de organización (no creada dentro de un workspace) exige decir el workspace en cada
  // llamada; sin él, la API responde 400. Con una key de workspace, esta variable queda vacía.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({ maxRetries: 2, defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined });
}

/** La API no compila esquemas muy grandes a gramática: se reintenta sin ella (ver generateStructured). */
const GRAMMAR_TOO_LARGE = /grammar is too large|schema is too (large|complex)/i;

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

function apiError(e: unknown): AiStepError {
  if (e instanceof AiStepError) return e;
  if (e instanceof Anthropic.RateLimitError) return new AiStepError("rate_limited", "La IA está con mucha demanda. Intenta de nuevo en un minuto.");
  if (e instanceof Anthropic.AuthenticationError) return new AiStepError("config", "La IA no está bien configurada en el servidor. Avísanos para revisarla.");
  // El motivo real queda en los logs (Vercel): la pantalla solo muestra el mensaje en español.
  if (e instanceof Anthropic.APIError) console.error(`[ai] ${e.status ?? "?"} ${e.requestID ?? ""}`, e.message);
  if (e instanceof Anthropic.BadRequestError) return new AiStepError("bad_request", "La IA no pudo procesar este producto. Reintenta en un momento; si vuelve a pasar, avísanos.");
  if (e instanceof Anthropic.APIError) return new AiStepError(`api_${e.status ?? "error"}`, "La IA no respondió. Intenta de nuevo en un momento.");
  return new AiStepError("network", "No pudimos conectarnos con la IA. Intenta de nuevo en un momento.");
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
}: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: AiUsage }> {
  const started = Date.now();
  const base = {
    model: AI_MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    thinking: { type: "adaptive" as const },
    messages: [{ role: "user" as const, content }],
  };
  let res;
  try {
    res = await client().beta.messages.parse({
      ...base,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && GRAMMAR_TOO_LARGE.test(e.message)) {
      // Red de seguridad: sin gramática, el modelo devuelve el JSON como texto y se valida aquí
      // con el mismo esquema. Un esquema que llega a esto se debe achicar (ver lib/angles/schemas.ts).
      console.warn(`[ai] esquema demasiado grande para la salida estructurada (${e.requestID ?? ""}); se reintenta sin gramática`);
      return generateUnconstrained({ base, system, schema, effort, started });
    }
    throw apiError(e);
  }

  const usage = usageOf(res, started);
  checkStop(res, usage);
  if (!res.parsed_output) {
    throw new AiStepError("invalid_output", "La IA respondió en un formato inesperado. Reintenta.", usage);
  }
  return { data: res.parsed_output, usage };
}

async function generateUnconstrained<S extends z.ZodType>({
  base,
  system,
  schema,
  effort,
  started,
}: {
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
    res = await client().beta.messages.create({
      ...base,
      output_config: { effort },
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: format },
      ],
    });
  } catch (e) {
    throw apiError(e);
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
