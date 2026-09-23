import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL, AiStepError, generateStructured, type AiUsage } from "@/lib/ai/claude";
import { customerAvatarSystem, customerAvatarUser, productBriefSystem, productBriefUser } from "@/lib/ai/prompts";
import {
  CUSTOMER_AVATAR_PROMPT_VERSION,
  PRODUCT_BRIEF_PROMPT_VERSION,
  customerAvatarSchema,
  productBriefSchema,
  type ProductBrief,
} from "@/lib/ai/schemas";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { Market } from "@/lib/market";
import { getMarket } from "@/lib/settings/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { getPricingPlan } from "@/lib/pricing/store";
import { imageBlock } from "./images";
import { getProductRow, imagesForGeneration, listImageRows, withDisplayUrls, type RunRow } from "@/lib/products/store";

// "Optimizar con IA", primera parte del pipeline de agentes creativos (agentes-creativos/README.md):
//   1. product_brief   → la ficha de producto (con visión sobre las imágenes de referencia)
//   2. customer_avatar → el cliente ideal, a partir de la ficha
// Cada paso se guarda apenas termina. El cliente ideal entra como `generated`: el comerciante decide.
// Siguiente iteración: angle-router y los agentes de ángulo, que leen esta ficha y este avatar.

/** Imágenes que lee el modelo: las primeras en uso, en su orden. */
const MAX_IMAGES = 8;
/** Tope de optimizaciones por comerciante en 24 h (cada una son dos llamadas a Claude Opus). */
const DAILY_RUN_LIMIT = 30;

export class OptimizeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function logGeneration(run: RunRow, step: string, usage: AiUsage | undefined, error?: string) {
  const { error: dbError } = await adminClient()
    .from("ai_generations")
    .insert({
      user_id: run.user_id,
      product_id: run.product_id,
      run_id: run.id,
      step,
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
  if (dbError) console.error("[pipeline] registrar la generación", dbError.message);
}

async function setRun(id: string, patch: Record<string, unknown>) {
  fail("Guardar la corrida", (await adminClient().from("pipeline_runs").update(patch).eq("id", id)).error);
}

/**
 * Crea la corrida (queued). Devuelve la activa si ya había una: tocar dos veces no cobra dos veces.
 * Pide al menos una imagen en uso (design-system/arquitectura.md › 8).
 */
export async function startOptimization(userId: string, productId: string): Promise<{ run: RunRow; created: boolean }> {
  const db = adminClient();
  const product = await getProductRow(userId, productId);
  if (!product) throw new OptimizeError("No encontramos ese producto.", 404);

  const active = await db.from("pipeline_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).maybeSingle();
  fail("Leer la optimización", active.error);
  if (active.data) return { run: active.data as RunRow, created: false };

  // La imagen base va primero: el modelo la trata como la foto principal del producto.
  const images = imagesForGeneration(await listImageRows(userId, [productId]));
  if (!images.length) throw new OptimizeError("Agrega al menos una imagen de referencia para optimizar.", 409);
  // Requisito: la IA escribe para un precio y unos packs concretos (CLAUDE.md › Precio y packs).
  const pricing = await getPricingPlan(userId, productId);
  if (!pricing) throw new OptimizeError("Guarda el precio y los packs antes de optimizar.", 409);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db.from("pipeline_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  fail("Contar optimizaciones", recent.error);
  if ((recent.count ?? 0) >= DAILY_RUN_LIMIT) {
    throw new OptimizeError(`Llegaste al máximo de ${DAILY_RUN_LIMIT} optimizaciones en 24 horas. Vuelve a intentarlo mañana.`, 429);
  }

  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const { data, error } = await db
    .from("pipeline_runs")
    .insert({
      user_id: userId,
      product_id: productId,
      status: "queued",
      // Copia del precio: los dos pasos leen los mismos números aunque el comerciante lo cambie a mitad.
      input: { market, image_ids: images.slice(0, MAX_IMAGES).map((i) => i.id), pricing },
    })
    .select("*")
    .single();
  // Otra pestaña la creó entre la lectura y el insert (índice de una activa por producto).
  if (error?.code === "23505") {
    const again = await db.from("pipeline_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).single();
    fail("Leer la optimización", again.error);
    return { run: again.data as RunRow, created: false };
  }
  fail("Crear la optimización", error);
  return { run: data as RunRow, created: true };
}

async function briefStep(run: RunRow, market: Market): Promise<{ brief: ProductBrief; briefId: string; baseInfo: string }> {
  const product = await getProductRow(run.user_id, run.product_id);
  if (!product) throw new AiStepError("not_found", "El producto ya no existe.");
  // Una corrida creada antes de exigir el precio no lo trae: se pide guardarlo y reintentar.
  const pricing = run.input.pricing as PricingPlan | undefined;
  if (!pricing) throw new AiStepError("no_pricing", "Guarda el precio y los packs y vuelve a optimizar.");
  const wanted = (run.input.image_ids as string[] | undefined) ?? [];
  const rows = (await listImageRows(run.user_id, [run.product_id])).filter((r) => wanted.includes(r.id));
  rows.sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id));
  const urls = await withDisplayUrls(rows);
  // Se descargan aquí (lib/pipeline/images.ts). Una imagen que no abre se salta; si es la base,
  // se avisa: la ficha no puede partir de otra sin que el comerciante lo decida.
  const loaded = await Promise.all(
    rows.map(async (r) => {
      const url = urls.get(r.id);
      if (!url) return null;
      try {
        return { row: r, block: await imageBlock(url) };
      } catch (e) {
        console.warn(`[pipeline] imagen ${r.id} (${r.source}) no se pudo leer:`, (e as Error).message);
        return null;
      }
    }),
  );
  if (wanted.length && loaded[0]?.row.id !== wanted[0]) {
    throw new AiStepError("image_unreadable", "No pudimos abrir la imagen base. Elige otra como base o vuelve a subirla y reintenta.");
  }
  const ok = loaded.filter((l): l is NonNullable<typeof l> => !!l);
  const images = ok.map((l) => l.row);

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...ok.map((l) => l.block),
    {
      type: "text",
      text: productBriefUser(
        {
          title: product.title,
          vendor: product.vendor,
          productType: product.product_type,
          category: product.category,
          tags: product.tags,
          options: product.options,
          price: Number(product.price) || null,
          compareAtPrice: product.compare_at_price == null ? null : Number(product.compare_at_price),
          cost: product.cost == null ? null : Number(product.cost),
          pricing,
          baseInfo: product.base_info,
          images: images.map((r) => ({ id: r.id, source: r.source, alt: r.alt, base: r.id === wanted[0] })),
        },
        market,
      ),
    },
  ];

  const { data, usage } = await generateStructured({ system: productBriefSystem(market), content, schema: productBriefSchema, effort: "medium" });
  await logGeneration(run, "product_brief", usage);
  const { data: saved, error } = await adminClient()
    .from("product_briefs")
    .insert({
      product_id: run.product_id,
      user_id: run.user_id,
      run_id: run.id,
      payload: data,
      prompt_version: PRODUCT_BRIEF_PROMPT_VERSION,
      model: usage.model,
    })
    .select("id")
    .single();
  fail("Guardar la ficha", error);
  return { brief: data, briefId: saved!.id as string, baseInfo: product.base_info };
}

async function avatarStep(run: RunRow, market: Market, brief: ProductBrief, briefId: string, baseInfo: string) {
  const { data, usage } = await generateStructured({
    system: customerAvatarSystem(market),
    content: [{ type: "text", text: customerAvatarUser(JSON.stringify(brief, null, 2), baseInfo, run.input.pricing as PricingPlan) }],
    schema: customerAvatarSchema,
    effort: "high",
  });
  await logGeneration(run, "customer_avatar", usage);
  const db = adminClient();
  // La propuesta nueva reemplaza a la anterior que nadie aprobó (queda como rechazada, recuperable).
  fail(
    "Archivar la propuesta anterior",
    (await db.from("customer_avatars").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("product_id", run.product_id).in("status", ["generated", "in_review"])).error,
  );
  fail(
    "Guardar el cliente ideal",
    (
      await db.from("customer_avatars").insert({
        product_id: run.product_id,
        user_id: run.user_id,
        run_id: run.id,
        brief_id: briefId,
        payload: data,
        status: "generated",
        prompt_version: CUSTOMER_AVATAR_PROMPT_VERSION,
        model: usage.model,
      })
    ).error,
  );
}

/** Ejecuta la corrida. Pensada para `after()`: nunca lanza; deja el resultado en pipeline_runs. */
export async function runOptimization(runId: string): Promise<void> {
  const db = adminClient();
  // Tomar la corrida: solo una invocación la pasa de queued a running.
  const claimed = await db
    .from("pipeline_runs")
    .update({ status: "running", current_step: "product_brief", started_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimed.error || !claimed.data) return;
  const run = claimed.data as RunRow;
  const market = run.input.market as Market;

  let step: "product_brief" | "customer_avatar" = "product_brief";
  try {
    const { brief, briefId, baseInfo } = await briefStep(run, market);
    step = "customer_avatar";
    await setRun(run.id, { current_step: step });
    await avatarStep(run, market, brief, briefId, baseInfo);
    await setRun(run.id, { status: "succeeded", finished_at: new Date().toISOString() });
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[pipeline] optimizar", e);
    if (known) await logGeneration(run, step, e.usage, e.code);
    await setRun(run.id, {
      status: "failed",
      error_code: known ? e.code : "unexpected",
      error_message: known ? e.message : "No pudimos terminar la optimización. Toca Reintentar.",
      finished_at: new Date().toISOString(),
    }).catch((err) => console.error("[pipeline] guardar la falla", err));
  }
}
