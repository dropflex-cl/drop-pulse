import "server-only";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { retryableContent } from "@/lib/ai/content";
import { recordAiGeneration } from "@/lib/ai/track";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { getPricingPlan } from "@/lib/pricing/store";
import { getProductRow, latestBrief } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import { saveUsageTip } from "@/lib/whatsapp/store";
import { tipFactText, tipOutputSchema, tipProblems, USAGE_TIP_PROMPT_VERSION, usageTipContext, usageTipSystem, usageTipTail, type UsageTip } from "@/lib/whatsapp/tip";
import { OptimizeError } from "./optimize";

// El consejo de uso del mensaje «Entregado» (etapa WhatsApp): una llamada chica a Claude desde la ficha
// y la información del producto. Si no cumple las reglas (lib/whatsapp/tip.ts › tipProblems), un
// reintento con los problemas. Reemplaza el anterior («Otro consejo»).

/** Tope de consejos por comerciante en 24 h. */
const DAILY_LIMIT = 30;
/** Intentos por pedido: el primero y una corrección. */
const ATTEMPTS = 2;

export async function writeUsageTip(userId: string, productId: string): Promise<UsageTip> {
  const [row, brief, pricing, shop] = await Promise.all([getProductRow(userId, productId), latestBrief(userId, productId), getPricingPlan(userId, productId), getShopifyConnection(userId)]);
  if (!row) throw new OptimizeError("No encontramos ese producto.", 404);
  if (!brief) throw new OptimizeError("Optimiza con IA primero: el consejo sale de la ficha del producto.", 409);
  if (!pricing) throw new OptimizeError("Guarda el precio y los packs primero.", 409);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await adminClient().from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("step", "usage_tip").gte("created_at", since);
  if ((recent.count ?? 0) >= DAILY_LIMIT) throw new OptimizeError(`Llegaste al máximo de ${DAILY_LIMIT} consejos en 24 horas. Vuelve mañana.`, 429);

  const { market } = await getMarket(userId, shop);
  const previous = row.usage_tip?.text ?? null;
  const context = usageTipContext(brief, row.base_info);
  const factText = tipFactText(brief, row.base_info);
  let problems: string[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let result;
    try {
      result = await generateStructured({
        system: usageTipSystem(market),
        content: retryableContent([], context, usageTipTail(previous, problems)),
        schema: tipOutputSchema,
        effort: "low",
        maxTokens: 4000,
      });
    } catch (e) {
      if (e instanceof AiStepError) {
        await recordAiGeneration({ userId, productId, step: "usage_tip", usage: e.usage, error: e.code });
        throw new OptimizeError(e.message, 502);
      }
      throw e;
    }
    const tip = result.data.tip?.trim() || null;
    if (!tip) {
      // La ficha no dice cómo se usa: se pagó la llamada, pero no hay nada que guardar.
      await recordAiGeneration({ userId, productId, step: "usage_tip", usage: result.usage });
      throw new OptimizeError("La información del producto no dice cómo se usa ni cómo se cuida. Agrégalo en Información base y vuelve a intentarlo.", 422);
    }
    problems = tipProblems(tip, { pricing, factText });
    if (problems.length) {
      await recordAiGeneration({ userId, productId, step: "usage_tip", usage: result.usage, error: "invalid_tip", problems });
      continue;
    }
    await recordAiGeneration({ userId, productId, step: "usage_tip", usage: result.usage });
    const saved: UsageTip = { text: tip, basis: result.data.basis.trim(), created_at: new Date().toISOString(), prompt_version: USAGE_TIP_PROMPT_VERSION, model: result.usage.model };
    await saveUsageTip(userId, productId, saved);
    return saved;
  }
  throw new OptimizeError("La IA no logró un consejo que cumpla las reglas. Intenta de nuevo en un momento.", 502);
}
