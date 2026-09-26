import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { AI_MODEL, type AiUsage } from "./claude";
import type { AiStep } from "./costs";

// Registro único de cada llamada a un modelo (Claude, Higgsfield o Gemini), con su costo. De aquí salen el
// costo de IA por producto (AiCostCard, AiRunList) y los topes diarios. Un paso nuevo que llame a la
// IA registra cada intento aquí, también los fallidos: el historial explica el total.

export interface AiGeneration {
  userId: string;
  productId: string;
  runId?: string | null;
  step: AiStep;
  /** Qué se generó dentro del paso (“Transformación”, “Concepto 2 · 9:16”). */
  detail?: string | null;
  provider?: "anthropic" | "higgsfield" | "google";
  /** Por defecto, el de `usage` o AI_MODEL. */
  model?: string;
  usage?: AiUsage;
  /** Código de error: el intento queda como fallido (con su costo, si se cobró). */
  error?: string | null;
  /** Costo cuando el proveedor no lo informa (se marca como estimado). */
  estimatedCostUsd?: number | null;
  /** El costo de `usage` es una aproximación (p. ej., un modelo de Gemini fuera de la tabla de precios). */
  costEstimated?: boolean;
  latencyMs?: number | null;
}

/** Fallas antes de llamar al modelo (faltan datos): no son generaciones ni cuestan. */
const BEFORE_CALL = new Set(["not_found", "no_key", "no_image", "no_pricing", "image_unreadable"]);

export async function recordAiGeneration(g: AiGeneration): Promise<void> {
  if (g.error && !g.usage && BEFORE_CALL.has(g.error)) return;
  const u = g.usage;
  const estimated = (u?.costUsd == null && g.estimatedCostUsd != null) || Boolean(u && g.costEstimated);
  const { error } = await adminClient()
    .from("ai_generations")
    .insert({
      user_id: g.userId,
      product_id: g.productId,
      run_id: g.runId ?? null,
      step: g.step,
      detail: g.detail ?? null,
      provider: g.provider ?? "anthropic",
      model: g.model ?? u?.model ?? AI_MODEL,
      status: g.error ? "failed" : "succeeded",
      error_code: g.error ?? null,
      input_tokens: u?.inputTokens ?? null,
      output_tokens: u?.outputTokens ?? null,
      cache_read_tokens: u?.cacheReadTokens ?? null,
      cache_write_tokens: u?.cacheWriteTokens ?? null,
      cost_usd: u?.costUsd ?? (estimated ? g.estimatedCostUsd : null),
      cost_estimated: estimated,
      latency_ms: u?.latencyMs ?? g.latencyMs ?? null,
    });
  // Registrar nunca rompe la generación: el error queda en los logs.
  if (error) console.error(`[ai] registrar la generación (${g.step})`, error.message);
}
