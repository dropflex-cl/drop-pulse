import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type * as z from "zod/v4";
import { AiStepError, generateStructured, generateText, type AiUsage } from "@/lib/ai/claude";
import { failure, recordAiGeneration } from "@/lib/ai/track";
import { ANGLES, type AngleSlot } from "@/lib/angles/catalog";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { saveGeneratedPackLabels } from "@/lib/pricing/labels-store";
import { getPricingPlan } from "@/lib/pricing/store";
import { hasProductData } from "@/lib/products/product-data";
import { getProductRow, imagesForGeneration, listImageRows, withDisplayUrls } from "@/lib/products/store";
import { tagValues } from "@/lib/prompts/render";
import { activeTemplate } from "@/lib/prompts/store";
import { STRATEGY_TAGS, type StrategyTagContext } from "@/lib/prompts/tags";
import { reviewsForPrompt } from "@/lib/reviews/rows";
import { getMarket } from "@/lib/settings/market";
import { STRATEGY_EXTRACT_PROMPT_VERSION, STRATEGY_EXTRACT_SYSTEM, strategyExtractContext, strategyExtractTail, type ExtractPart } from "@/lib/strategy/prompts";
import {
  chosenIndexes,
  strategyAnglesSchema,
  strategyExtractProblems,
  strategyProfileSchema,
  toBriefPayload,
  toProductBrief,
  toTestAngle,
  type StrategyExtraction,
} from "@/lib/strategy/schemas";
import type { RunStatus, StrategyView } from "@/lib/types";
import { OptimizeError, requireAiKey } from "./errors";
import { imageBlock } from "./images";

// Etapa Estrategia (docs/spec-estrategia.md): el mega prompt guardado en la base (prompt_templates,
// `strategy`) va tal cual, con sus tags llenos con los Datos del producto y la imagen base delante. Su
// informe se guarda mientras se escribe (la pantalla lo muestra en vivo); después una llamada barata lo
// pasa a datos (strategy_extract). El comerciante elige 2 o 3 de los TOP 5 ángulos y, al confirmar, se
// escriben las filas de siempre (ficha, cliente ideal, ángulos con sus ganchos): Imágenes, Página,
// Creativos y Video las leen igual que antes.

/** Tope de corridas por comerciante en 24 h (cada una es un informe largo con Opus). */
const DAILY_LIMIT = 10;
/** Una corrida que no avanza en este tiempo se da por interrumpida (cada avance toca updated_at). */
const RUNNING_STALE_MS = 15 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;
/** Cada cuánto se guarda el informe mientras se escribe. */
const SAVE_EVERY_MS = 4000;

export interface StrategyRunRow {
  id: string;
  product_id: string;
  user_id: string;
  status: RunStatus;
  current_step: "report" | "extract" | null;
  template_id: string | null;
  template_version: number | null;
  input: { market: Market; pricing: PricingPlan; tags: Record<string, string>; name: string; description: string; image_id: string | null; model?: string };
  report: string | null;
  extraction: StrategyExtraction | null;
  error_code: string | null;
  error_message: string | null;
  chosen_slots: number[] | null;
  confirmed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function setRun(id: string, patch: Record<string, unknown>) {
  fail("Guardar la estrategia", (await adminClient().from("strategy_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)).error);
}

// ---------------------------------------------------------------- Lecturas

/** La corrida más reciente de cada producto. */
export async function latestStrategies(userId: string, productIds: string[]): Promise<Map<string, StrategyRunRow>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient().from("strategy_runs").select("*").eq("user_id", userId).in("product_id", productIds).order("created_at", { ascending: false });
  fail("Leer la estrategia", error);
  const map = new Map<string, StrategyRunRow>();
  for (const r of (data ?? []) as StrategyRunRow[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** Lo que mira la ruta de etapas (sin el informe). */
export type StrategyState = Pick<StrategyRunRow, "product_id" | "status" | "error_message" | "confirmed_at" | "created_at">;

export async function latestStrategyStates(userId: string, productIds: string[]): Promise<Map<string, StrategyState>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("strategy_runs")
    .select("product_id, status, error_message, confirmed_at, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer la estrategia", error);
  const map = new Map<string, StrategyState>();
  for (const r of (data ?? []) as StrategyState[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** Cierra las corridas colgadas (el proceso murió o pasó el tiempo máximo de la función). */
export async function expireStaleStrategies(userId: string): Promise<void> {
  const db = adminClient();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const patch = { status: "failed", error_code: "stale", error_message: "La estrategia se interrumpió. Toca Volver a generar.", finished_at: stamp, updated_at: stamp };
  const results = await Promise.all([
    db.from("strategy_runs").update(patch).eq("user_id", userId).eq("status", "running").lt("updated_at", new Date(now - RUNNING_STALE_MS).toISOString()),
    db.from("strategy_runs").update(patch).eq("user_id", userId).eq("status", "queued").lt("created_at", new Date(now - QUEUED_STALE_MS).toISOString()),
  ]);
  for (const r of results) fail("Cerrar estrategias colgadas", r.error);
}

/** La corrida para la pantalla. */
export function toStrategyView(r: StrategyRunRow): StrategyView {
  const x = r.extraction;
  return {
    id: r.id,
    status: r.status,
    step: r.current_step,
    report: r.report ?? "",
    error: r.error_message,
    templateVersion: r.template_version,
    angles: (x?.angles ?? []).map((a, index) => ({ index, title: a.title, hook: a.hook, promise: a.promise, why: a.why, segment: a.segment, frameName: ANGLES[a.frame]?.name ?? a.frame })),
    firstDollar: x?.first_dollar ?? [],
    chosen: r.confirmed_at ? (r.chosen_slots ?? []) : null,
    confirmedAt: r.confirmed_at,
    createdAt: r.created_at,
    startedAt: r.started_at,
  };
}

// ---------------------------------------------------------------- Generar

/** Lo que falta para generar la estrategia, o null si se puede. */
export async function strategyBlocker(userId: string, productId: string): Promise<string | null> {
  const product = await getProductRow(userId, productId);
  if (!product) return "No encontramos ese producto.";
  if (!hasProductData(product.product_data)) return "Identifica el producto en Información base (Datos del producto).";
  if (!(await getPricingPlan(userId, productId))) return "Guarda el precio y los packs en Información base.";
  return null;
}

/** Crea la corrida (queued). Si ya hay una en curso, la devuelve: tocar dos veces no cobra dos veces. */
export async function startStrategy(userId: string, productId: string): Promise<{ run: StrategyRunRow; created: boolean }> {
  await requireAiKey(userId);
  const db = adminClient();
  const product = await getProductRow(userId, productId);
  if (!product) throw new OptimizeError("No encontramos ese producto.", 404);
  const active = await db.from("strategy_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).maybeSingle();
  fail("Leer la estrategia", active.error);
  if (active.data) return { run: active.data as StrategyRunRow, created: false };

  const data = product.product_data;
  if (!hasProductData(data)) throw new OptimizeError("Identifica el producto en Información base antes de generar la estrategia.", 409);
  const pricing = await getPricingPlan(userId, productId);
  if (!pricing) throw new OptimizeError("Guarda el precio y los packs en Información base antes de generar la estrategia.", 409);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db.from("strategy_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  fail("Contar estrategias", recent.error);
  if ((recent.count ?? 0) >= DAILY_LIMIT) throw new OptimizeError(`Llegaste al máximo de ${DAILY_LIMIT} estrategias en 24 horas. Vuelve a intentarlo mañana.`, 429);

  const template = await activeTemplate("strategy");
  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const ctx: StrategyTagContext = { name: data.name, description: data.description, pricing, market };
  const base = imagesForGeneration(await listImageRows(userId, [productId]))[0];
  const { data: run, error } = await db
    .from("strategy_runs")
    .insert({
      user_id: userId,
      product_id: productId,
      status: "queued",
      template_id: template.id,
      template_version: template.version,
      // Copia de lo que recibe el modelo: el informe se explica con estos valores aunque cambien después.
      input: { market, pricing, tags: tagValues(STRATEGY_TAGS, ctx), name: data.name, description: data.description, image_id: base?.id ?? null, model: template.model },
    })
    .select("*")
    .single();
  // Otra pestaña la creó entre la lectura y el insert (índice de una activa por producto).
  if (error?.code === "23505") {
    const again = await db.from("strategy_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).single();
    fail("Leer la estrategia", again.error);
    return { run: again.data as StrategyRunRow, created: false };
  }
  fail("Crear la estrategia", error);
  return { run: run as StrategyRunRow, created: true };
}

async function baseImageBlock(r: StrategyRunRow): Promise<Anthropic.Beta.BetaImageBlockParam | null> {
  if (!r.input.image_id) return null;
  const rows = (await listImageRows(r.user_id, [r.product_id])).filter((i) => i.id === r.input.image_id);
  const url = (await withDisplayUrls(rows)).get(r.input.image_id);
  if (!url) return null;
  return imageBlock(url).catch((e: unknown) => {
    console.warn(`[strategy] la imagen base ${r.input.image_id} no se pudo leer:`, (e as Error).message);
    return null;
  });
}

/** El informe del mega prompt, guardado mientras se escribe. */
async function reportStep(r: StrategyRunRow): Promise<{ report: string; usage: AiUsage }> {
  const { data: t, error } = await adminClient().from("prompt_templates").select("body, effort, max_tokens, model").eq("id", r.template_id).maybeSingle();
  fail("Leer el prompt", error);
  if (!t) throw new AiStepError("no_template", "El prompt de la estrategia ya no existe. Toca Volver a generar.");
  // Los tags se llenan con la copia guardada en la corrida (lo que se mostró al comerciante).
  const prompt = Object.entries(r.input.tags).reduce((text, [tag, value]) => text.split(tag).join(value), t.body as string);
  const image = await baseImageBlock(r);
  let last = 0;
  const { text, usage } = await generateText({
    userId: r.user_id,
    content: [...(image ? [image] : []), { type: "text", text: prompt }],
    effort: t.effort as "low" | "medium" | "high",
    maxTokens: t.max_tokens as number,
    model: t.model as string,
    onText: async (snapshot) => {
      if (Date.now() - last < SAVE_EVERY_MS) return;
      last = Date.now();
      await setRun(r.id, { report: snapshot });
    },
  });
  await setRun(r.id, { report: text });
  return { report: text, usage };
}

/**
 * Una parte del informe a datos: una llamada barata y, si no cumple las reglas del código, otra con los
 * problemas. Las dos partes van en paralelo (cada una con su esquema: juntas pasaban el tamaño de
 * gramática que acepta la API) y cada intento queda en ai_generations con su parte en `detail`.
 */
async function extractPart<S extends z.ZodType>(r: StrategyRunRow, context: string, part: ExtractPart, schema: S, problemsOf: (d: z.infer<S>) => string[]): Promise<z.infer<S>> {
  const log = { userId: r.user_id, productId: r.product_id, step: "strategy_extract" as const, detail: EXTRACT_DETAIL[part], promptVersion: STRATEGY_EXTRACT_PROMPT_VERSION };
  let retry: string[] = [];
  for (let attempt = 1; ; attempt++) {
    let out: { data: z.infer<S>; usage: AiUsage };
    try {
      out = await generateStructured({
        userId: r.user_id,
        system: STRATEGY_EXTRACT_SYSTEM,
        content: [{ type: "text", text: context }, { type: "text", text: strategyExtractTail(part, retry) }],
        schema,
        effort: "low",
        maxTokens: 16000,
        // Cada parte tiene otro esquema: no comparten la caché del system.
        cacheSystem: false,
      });
    } catch (e) {
      if (e instanceof AiStepError) {
        await recordAiGeneration({ ...log, ...failure(e) });
        e.logged = true;
      }
      throw e;
    }
    const problems = problemsOf(out.data);
    if (!problems.length) {
      await recordAiGeneration({ ...log, usage: out.usage });
      return out.data;
    }
    await recordAiGeneration({ ...log, usage: out.usage, error: "invalid_extraction", problems });
    if (attempt === 2) throw new AiStepError("invalid_extraction", "No pudimos leer los ángulos del informe. Toca Volver a generar.", out.usage, true, problems);
    retry = problems;
  }
}

const EXTRACT_DETAIL: Record<ExtractPart, string> = { profile: "Producto y cliente", angles: "Ángulos" };

/** El informe a datos: el perfil y los ángulos, en paralelo. */
async function extractStep(r: StrategyRunRow, report: string): Promise<StrategyExtraction> {
  const context = strategyExtractContext({ name: r.input.name, description: r.input.description, pricing: r.input.pricing, report });
  const [profile, angles] = await Promise.all([
    extractPart(r, context, "profile", strategyProfileSchema, () => []),
    extractPart(r, context, "angles", strategyAnglesSchema, strategyExtractProblems),
  ]);
  return { ...profile, ...angles };
}

/** Ejecuta la corrida. Pensada para `after()`: nunca lanza; deja el resultado en strategy_runs. */
export async function runStrategy(runId: string): Promise<void> {
  const db = adminClient();
  const stamp = new Date().toISOString();
  const claimed = await db
    .from("strategy_runs")
    .update({ status: "running", current_step: "report", started_at: stamp, updated_at: stamp })
    .eq("id", runId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimed.error || !claimed.data) return;
  const r = claimed.data as StrategyRunRow;
  const log = { userId: r.user_id, productId: r.product_id };

  let step: "strategy" | "strategy_extract" = "strategy";
  try {
    const { report, usage } = await reportStep(r);
    await recordAiGeneration({ ...log, step, usage, promptVersion: r.template_version });
    step = "strategy_extract";
    await setRun(r.id, { current_step: "extract" });
    const data = await extractStep(r, report);
    // Las etiquetas de los packs se deciden aparte, en «Precio y packs».
    await saveGeneratedPackLabels({ id: null, user_id: r.user_id, product_id: r.product_id }, data.pack_labels, r.input.pricing, {
      promptVersion: STRATEGY_EXTRACT_PROMPT_VERSION,
      model: r.input.model ?? "claude-opus-5",
    }).catch((e: unknown) => console.error("[strategy] guardar las etiquetas de los packs", e));
    await setRun(r.id, { status: "succeeded", extraction: data, current_step: null, finished_at: new Date().toISOString() });
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[strategy] generar", e);
    if (known && !e.logged) {
      await recordAiGeneration({ ...log, step, ...failure(e), promptVersion: step === "strategy" ? r.template_version : STRATEGY_EXTRACT_PROMPT_VERSION });
    }
    await setRun(r.id, {
      status: "failed",
      error_code: known ? e.code : "unexpected",
      error_message: known ? e.message : "No pudimos terminar la estrategia. Toca Volver a generar.",
      finished_at: new Date().toISOString(),
    }).catch((err) => console.error("[strategy] guardar la falla", err));
  }
}

// ---------------------------------------------------------------- Confirmar

/**
 * El comerciante elige 2 o 3 de los TOP 5 ángulos. Se escriben las filas que leen los pasos siguientes:
 * la ficha (product_briefs), el cliente ideal aprobado (customer_avatars), la elección confirmada
 * (angle_rankings) y un desarrollo aprobado por ángulo con sus ganchos (angle_briefs).
 */
export async function confirmStrategy(userId: string, productId: string, raw: unknown): Promise<StrategyRunRow> {
  const r = (await latestStrategies(userId, [productId])).get(productId);
  if (!r || r.status !== "succeeded" || !r.extraction) throw new OptimizeError("La estrategia todavía no está lista.", 409);
  const idx = chosenIndexes(raw, r.extraction.angles.length);
  if (!idx) throw new OptimizeError("Elige 2 o 3 ángulos.", 400);
  const db = adminClient();
  const now = new Date().toISOString();
  const pricing = r.input.pricing;
  const model = r.input.model ?? "claude-opus-5";
  const version = r.template_version ?? 1;
  const x = r.extraction;

  const reviews = (await reviewsForPrompt(userId, productId)).filter((v) => v.approved).map((v) => v.text);
  const brief = await db
    .from("product_briefs")
    .insert({ product_id: productId, user_id: userId, payload: toProductBrief(x.brief, pricing, reviews), prompt_version: version, model })
    .select("id")
    .single();
  fail("Guardar la ficha", brief.error);
  fail(
    "Archivar el cliente ideal anterior",
    (await db.from("customer_avatars").update({ status: "rejected", updated_at: now }).eq("product_id", productId).in("status", ["generated", "in_review"])).error,
  );
  const avatar = await db
    .from("customer_avatars")
    .insert({ product_id: productId, user_id: userId, brief_id: brief.data!.id, payload: x.avatar, status: "approved", decided_at: now, prompt_version: version, model })
    .select("id")
    .single();
  fail("Guardar el cliente ideal", avatar.error);

  const chosen = idx.map((i, n) => ({ extracted: x.angles[i], angle: toTestAngle(x.angles[i], (n + 1) as AngleSlot) }));
  const ranking = await db
    .from("angle_rankings")
    .insert({
      product_id: productId,
      user_id: userId,
      status: "succeeded",
      input: { market: r.input.market, pricing, avatar_id: avatar.data!.id, source: "strategy", strategy_run_id: r.id },
      payload: { source: "strategy", run_id: r.id },
      chosen_angles: chosen.map((c) => c.angle),
      confirmed_at: now,
      prompt_version: version,
      model,
      started_at: now,
      finished_at: now,
    })
    .select("id")
    .single();
  fail("Guardar los ángulos", ranking.error);
  const missing = x.brief.missing_inputs;
  const briefs = await db.from("angle_briefs").insert(
    chosen.map((c) => ({
      product_id: productId,
      user_id: userId,
      ranking_id: ranking.data!.id,
      angle: c.angle.frame,
      slot: c.angle.slot,
      generation: "succeeded",
      payload: toBriefPayload(c.extracted, pricing, missing),
      status: "approved",
      prompt_version: version,
      model,
      decided_at: now,
      started_at: now,
      finished_at: now,
    })),
  );
  if (briefs.error) {
    // Sin desarrollos la elección no sirve: se deshace para no dejar una etapa a medias.
    await db.from("angle_rankings").delete().eq("id", ranking.data!.id);
    fail("Guardar los desarrollos", briefs.error);
  }
  await setRun(r.id, { chosen_slots: idx, confirmed_at: now });
  return { ...r, chosen_slots: idx, confirmed_at: now };
}
