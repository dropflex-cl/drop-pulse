// Costo de IA de un producto (design-system/arquitectura.md › 11): ai_generations sumado por etapa,
// en la moneda de la tienda, con el historial y el tope de Ajustes.
import "server-only";
import { cache } from "react";
import { AI_STAGES, summarizeAiCost, type GenerationRow } from "@/lib/ai/costs";
import { usdRate } from "@/lib/ai/fx";
import { adminClient } from "@/lib/integrations/admin";
import { sessionUser } from "@/lib/integrations/session";
import { getPricingPlan } from "@/lib/pricing/store";
import type { ProductAiCost } from "@/lib/types";
import { getProduct } from "./products";

const RUN_TABLES = ["pipeline_runs", "angle_rankings", "copy_runs", "creative_runs"] as const;

/** Alguna corrida de IA del producto sigue en cola o generando. */
async function running(userId: string, productId: string): Promise<boolean> {
  const db = adminClient();
  const counts = await Promise.all([
    ...RUN_TABLES.map((t) => db.from(t).select("id", { count: "exact", head: true }).eq("user_id", userId).eq("product_id", productId).in("status", ["queued", "running"])),
    db.from("angle_briefs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("product_id", productId).in("generation", ["queued", "running"]),
  ]);
  return counts.some((c) => (c.count ?? 0) > 0);
}

export const getProductAiCost = cache(async (productId: string): Promise<ProductAiCost | null> => {
  const user = await sessionUser();
  if (!user) return null;
  const product = await getProduct(productId);
  if (!product) return null;
  const db = adminClient();
  const [{ data: rows, error }, { data: settings }, pricing, isRunning] = await Promise.all([
    db
      .from("ai_generations")
      .select("step, detail, model, status, error_code, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, created_at")
      .eq("user_id", user.id)
      .eq("product_id", productId)
      .order("created_at", { ascending: true }),
    db.from("merchant_settings").select("currency, timezone, ai_cost_cap").eq("user_id", user.id).maybeSingle(),
    getPricingPlan(user.id, productId).catch(() => null),
    running(user.id, productId),
  ]);
  if (error) throw new Error(`Leer el costo de IA: ${error.message}`);
  const s = settings as { currency: string; timezone: string | null; ai_cost_cap: number | string | null } | null;
  const currency = product.currency || s?.currency || "CLP";

  return summarizeAiCost((rows ?? []) as GenerationRow[], {
    currency,
    usdRate: await usdRate(currency),
    stages: AI_STAGES.map((key) => {
      const stage = product.stages.find((st) => st.key === key);
      return { key, title: stage?.title ?? key, note: stage?.state === "locked" ? stage.desc : undefined };
    }),
    cap: s?.ai_cost_cap == null ? null : Number(s.ai_cost_cap),
    profit: pricing?.profit ?? null,
    running: isRunning,
    admin: user.admin,
    timeZone: s?.timezone ?? undefined,
  });
});
