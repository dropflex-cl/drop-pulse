// Leer la salida estructurada de Claude con nuestro esquema, en vez de dejársela al SDK. Con
// `messages.parse`, una respuesta que no calzaba (o venía cortada) se volvía un error genérico del SDK,
// sin costo ni motivo: el paso lo mostraba como «No pudimos conectarnos con la IA», no lo reintentaba
// y la llamada cobrada no quedaba en ai_generations (ganchos del audífono, 2026-10-04). Puro, con tests.

import type * as z from "zod/v4";
import type { AiUsage } from "./claude";

/** Cuántos problemas de una respuesta ilegible se guardan (ai_generations.problems guarda hasta 20). */
const MAX_PROBLEMS = 10;

/** El primer bloque de texto de la respuesta (los de razonamiento van antes y no cuentan). */
export function firstText(content: { type: string; text?: string }[]): string {
  return content.find((b) => b.type === "text")?.text ?? "";
}

/** El JSON de la respuesta validado con el esquema, o qué tiene de malo (en español, para el registro). */
export function readStructured<S extends z.ZodType>(schema: S, text: string): { data: z.infer<S> } | { problems: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { problems: [`La respuesta no es un JSON válido (${text.length} caracteres): ${e instanceof Error ? e.message : String(e)}`] };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { data: parsed.data };
  return { problems: parsed.error.issues.slice(0, MAX_PROBLEMS).map((i) => `${i.path.join(".") || "(la respuesta)"}: ${i.message}`) };
}

/** Dos intentos de la misma llamada como uno: se pagaron los dos. */
export function sumUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    model: b.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costUsd: Math.round((a.costUsd + b.costUsd) * 1_000_000) / 1_000_000,
    latencyMs: a.latencyMs + b.latencyMs,
  };
}
