import "server-only";
import { AI_MODEL, AiStepError, generateStructured, type AiUsage } from "@/lib/ai/claude";
import { packLabelsSystem, packLabelsUser } from "@/lib/ai/prompts";
import { PACK_LABELS_PROMPT_VERSION, packLabelsOnlySchema } from "@/lib/ai/schemas";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { latestPackLabels, saveGeneratedPackLabels } from "@/lib/pricing/labels-store";
import { getPricingPlan } from "@/lib/pricing/store";
import { latestAvatars, latestBrief } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import { OptimizeError } from "./optimize";

// “Otras etiquetas” en Precio y packs: una llamada chica, solo con las etiquetas, que parte de la
// ficha, el cliente ideal y el precio vigentes. Las primeras salen con el cliente ideal (optimize.ts).

/** Tope de “Otras etiquetas” por comerciante en 24 h. */
const DAILY_LIMIT = 40;

async function log(userId: string, productId: string, usage: AiUsage | undefined, error?: string) {
  const { error: dbError } = await adminClient()
    .from("ai_generations")
    .insert({
      user_id: userId,
      product_id: productId,
      step: "pack_labels",
      model: usage?.model ?? AI_MODEL,
      status: error ? "failed" : "succeeded",
      error_code: error ?? null,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      cache_read_tokens: usage?.cacheReadTokens ?? null,
      cache_write_tokens: usage?.cacheWriteTokens ?? null,
      cost_usd: usage?.costUsd ?? null,
      latency_ms: usage?.latencyMs ?? null,
    });
  if (dbError) console.error("[pack-labels] registrar la generación", dbError.message);
}

export async function regeneratePackLabels(userId: string, productId: string) {
  const [brief, pricing, avatars, previous] = await Promise.all([
    latestBrief(userId, productId),
    getPricingPlan(userId, productId),
    latestAvatars(userId, [productId]),
    latestPackLabels(userId, productId),
  ]);
  if (!pricing) throw new OptimizeError("Guarda el precio y los packs primero.", 409);
  if (!brief) throw new OptimizeError("Optimiza con IA primero: las etiquetas parten de la ficha del producto.", 409);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await adminClient()
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("step", "pack_labels")
    .gte("created_at", since);
  if ((recent.count ?? 0) >= DAILY_LIMIT) throw new OptimizeError(`Llegaste al máximo de ${DAILY_LIMIT} etiquetas nuevas en 24 horas. Vuelve mañana o edítalas a mano.`, 429);

  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const avatar = avatars.get(productId)?.payload;
  let result;
  try {
    result = await generateStructured({
      system: packLabelsSystem(market),
      content: [
        {
          type: "text",
          text: packLabelsUser(JSON.stringify(brief, null, 2), avatar ? JSON.stringify(avatar, null, 2) : null, pricing, (previous?.payload ?? []).map((l) => l.label)),
        },
      ],
      schema: packLabelsOnlySchema,
      effort: "medium",
      maxTokens: 8000,
    });
  } catch (e) {
    if (e instanceof AiStepError) {
      await log(userId, productId, e.usage, e.code);
      throw new OptimizeError(e.message, 502);
    }
    throw e;
  }
  await log(userId, productId, result.usage);
  await saveGeneratedPackLabels({ id: null, user_id: userId, product_id: productId }, result.data.pack_labels, pricing, {
    promptVersion: PACK_LABELS_PROMPT_VERSION,
    model: result.usage.model,
  });
}
