import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
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
  let res;
  try {
    res = await client().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    if (e instanceof AiStepError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AiStepError("rate_limited", "La IA está con mucha demanda. Intenta de nuevo en un minuto.");
    if (e instanceof Anthropic.AuthenticationError) throw new AiStepError("config", "La IA no está bien configurada en el servidor. Avísanos para revisarla.");
    // El motivo real queda en los logs (Vercel): la pantalla solo muestra el mensaje en español.
    if (e instanceof Anthropic.APIError) console.error(`[ai] ${e.status ?? "?"} ${e.requestID ?? ""}`, e.message);
    if (e instanceof Anthropic.BadRequestError) throw new AiStepError("bad_request", "La IA no pudo procesar este producto. Reintenta en un momento; si vuelve a pasar, avísanos.");
    if (e instanceof Anthropic.APIError) throw new AiStepError(`api_${e.status ?? "error"}`, "La IA no respondió. Intenta de nuevo en un momento.");
    throw new AiStepError("network", "No pudimos conectarnos con la IA. Intenta de nuevo en un momento.");
  }

  const u = res.usage;
  const usage: AiUsage = {
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

  if (res.stop_reason === "refusal") {
    throw new AiStepError("refusal", "La IA no quiso trabajar con este producto. Revisa que la información no prometa resultados de salud y reintenta.", usage);
  }
  if (res.stop_reason === "max_tokens") {
    throw new AiStepError("max_tokens", "La respuesta de la IA quedó incompleta. Reintenta.", usage);
  }
  if (!res.parsed_output) {
    throw new AiStepError("invalid_output", "La IA respondió en un formato inesperado. Reintenta.", usage);
  }
  return { data: res.parsed_output, usage };
}
