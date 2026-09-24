import "server-only";
import sharp from "sharp";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { recordAiGeneration } from "@/lib/ai/track";
import type { CustomerAvatar, PackLabel } from "@/lib/ai/schemas";
import { ANGLES, type AngleRole } from "@/lib/angles/catalog";
import { fail } from "@/lib/angles/store";
import { CONCEPTS_PER_RUN, IMAGE_COST_USD, type Ratio } from "@/lib/creatives/catalog";
import { QA_SYSTEM, creativesSystem, creativesUser, qaUser, type CreativesContext } from "@/lib/creatives/prompts";
import { languageName, renderRequest } from "@/lib/creatives/render";
import {
  CREATIVES_PROMPT_VERSION,
  conceptEditSchema,
  conceptProblems,
  creativeConceptsSchema,
  qaSchema,
  qaVerdict,
  textProblems,
  TEXT_LIMIT,
  type QaResult,
} from "@/lib/creatives/schemas";
import { CREATIVES_BUCKET, getAssetRow, isRecoverable, getConceptRow, type AssetRow, type ConceptRow, type CreativeRunRow, type StoredConcept } from "@/lib/creatives/store";
import { adminClient } from "@/lib/integrations/admin";
import { HiggsfieldError, requestStatus, submit, uploadImage, type RequestState } from "@/lib/integrations/higgsfield/client";
import { higgsfieldKey, markHiggsfieldInvalid, presetsFor } from "@/lib/integrations/higgsfield/connection";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { Market } from "@/lib/market";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import type { PricingPlan } from "@/lib/pricing/plan";
import { getPricingPlan } from "@/lib/pricing/store";
import { imagesForGeneration, latestAvatars, latestBrief, listImageRows, withDisplayUrls } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import { approvedBriefs } from "./copy";
import { download, imageBlock, imageBlockFromBytes, toJpeg } from "./images";
import { OptimizeError } from "./optimize";

// Etapa Creativos (docs/spec-creativos.md). Tres pasos, cada uno en segundo plano (after):
// 1. El generador de estáticos (Claude) propone 6 conceptos desde los 2 desarrollos aprobados.
// 2. Cada concepto se renderiza en Higgsfield (Marketing Studio Flare) con la foto base como
//    referencia: la pieza sale terminada, con sus textos (decisión 3).
// 3. Un QA con Claude compara el producto y los textos; si falla, un segundo intento sin preset.
// La IA propone y el comerciante decide: al aprobar, la pieza pasa a los creativos de Anuncios.

/** Tope de corridas del generador por comerciante en 24 h (cada una es una llamada a Claude Opus). */
const DAILY_RUNS = 10;
/** Tope de imágenes por comerciante en 24 h: protege su cuenta de Higgsfield de un bucle. */
const DAILY_IMAGES = 120;
/** Cuánto espera el proceso en segundo plano antes de dejarle la pieza al sondeo de la pantalla. */
const POLL_BUDGET_MS = 200_000;
/** Otro proceso no toma una pieza que se tocó hace menos de esto (lease sobre updated_at). */
const LEASE_MS = 20_000;
const AD_MEDIA_BUCKET = "ad-media";


/** Qué pieza es, para el historial: “Antes y después · 9:16”. */
async function assetDetail(a: AssetRow): Promise<string> {
  const { data } = await adminClient().from("creative_concepts").select("payload").eq("id", a.concept_id).maybeSingle();
  const name = (data as { payload: StoredConcept } | null)?.payload?.name;
  return [name, a.ratio].filter(Boolean).join(" · ");
}

/**
 * Cada imagen de Higgsfield queda registrada. La API no informa el costo (Flare cobra por tokens):
 * una imagen lograda se anota con la cota de IMAGE_COST_USD, marcada como estimada.
 */
async function logRender(a: AssetRow, ok: boolean, error?: string, latencyMs?: number) {
  await recordAiGeneration({
    userId: a.user_id,
    productId: a.product_id,
    step: "creative_render",
    detail: await assetDetail(a),
    provider: "higgsfield",
    model: a.endpoint,
    error: ok ? null : (error ?? "failed"),
    estimatedCostUsd: ok ? IMAGE_COST_USD : null,
    latencyMs,
  });
}

async function requireKey(userId: string): Promise<string> {
  const key = await higgsfieldKey(userId);
  if (!key) throw new OptimizeError("Conecta tu cuenta de Higgsfield en Ajustes para generar anuncios.", 409);
  return key;
}

/** Higgsfield rechazó la clave: se marca para que la etapa pida reconectar. */
async function onHiggsfieldError(userId: string, e: unknown) {
  if (e instanceof HiggsfieldError && e.code === "invalid_key") await markHiggsfieldInvalid(userId, e.message);
}

// ---------------------------------------------------------------- 1. Conceptos

async function loadContext(userId: string, productId: string) {
  const [brief, avatars, pricing, labels, briefs] = await Promise.all([
    latestBrief(userId, productId),
    latestAvatars(userId, [productId]),
    getPricingPlan(userId, productId),
    latestPackLabels(userId, productId),
    approvedBriefs(userId, productId),
  ]);
  const avatar = avatars.get(productId);
  if (!avatar || avatar.status !== "approved" || !brief || !pricing) throw new OptimizeError("Aprueba tu cliente ideal y guarda el precio en Información base.", 409);
  if (!briefs) throw new OptimizeError("Aprueba los 2 desarrollos de Ángulos para crear anuncios.", 409);
  return { brief, avatar, pricing: pricing as PricingPlan, labels: labels?.status === "approved" ? labels.payload : undefined, briefs };
}

/** Crea la corrida del generador (queued). Tocar dos veces no cobra dos veces. */
export async function startCreatives(userId: string, productId: string): Promise<{ run: CreativeRunRow; created: boolean }> {
  await requireKey(userId);
  const ctx = await loadContext(userId, productId);
  const db = adminClient();
  const active = await db.from("creative_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).maybeSingle();
  fail("Leer la corrida", active.error);
  if (active.data) return { run: active.data as CreativeRunRow, created: false };

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await db.from("creative_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  fail("Contar las corridas", countError);
  if ((count ?? 0) >= DAILY_RUNS) throw new OptimizeError(`Llegaste al máximo de ${DAILY_RUNS} propuestas de anuncios en 24 horas. Vuelve mañana.`, 429);

  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const { data, error } = await db
    .from("creative_runs")
    .insert({
      product_id: productId,
      user_id: userId,
      status: "queued",
      input: { market, pricing: ctx.pricing, labels: ctx.labels ?? null, avatar_id: ctx.avatar.id, briefs: { primary: ctx.briefs.primary.id, secondary: ctx.briefs.secondary.id } },
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const again = await db.from("creative_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).single();
    fail("Leer la corrida", again.error);
    return { run: again.data as CreativeRunRow, created: false };
  }
  fail("Crear la corrida", error);
  return { run: data as CreativeRunRow, created: true };
}

/** Las imágenes en uso del producto, la base primero, como URLs que se pueden descargar. */
async function productImageUrls(userId: string, productId: string, max: number): Promise<string[]> {
  const rows = imagesForGeneration(await listImageRows(userId, [productId])).slice(0, max);
  const urls = await withDisplayUrls(rows);
  return rows.map((r) => urls.get(r.id)).filter((u): u is string => Boolean(u));
}

type RunInput = { market: Market; pricing: PricingPlan; labels: PackLabel[] | null; avatar_id: string; briefs: Record<AngleRole, string> };

/** Ejecuta el generador. Pensada para `after()`: nunca lanza; deja el resultado en la fila. */
export async function runCreatives(runId: string): Promise<void> {
  const db = adminClient();
  const stamp = () => new Date().toISOString();
  const claimed = await db.from("creative_runs").update({ status: "running", started_at: stamp(), updated_at: stamp() }).eq("id", runId).eq("status", "queued").select("*").maybeSingle();
  if (claimed.error || !claimed.data) return;
  const r = claimed.data as CreativeRunRow & { input: RunInput };
  try {
    const key = await higgsfieldKey(r.user_id);
    if (!key) throw new AiStepError("no_key", "Conecta tu cuenta de Higgsfield en Ajustes y reintenta.");
    const input = r.input;
    const [brief, avatarRow, briefRows, presets, images] = await Promise.all([
      latestBrief(r.user_id, r.product_id),
      db.from("customer_avatars").select("payload").eq("user_id", r.user_id).eq("id", input.avatar_id).single(),
      db.from("angle_briefs").select("id, angle, role, payload").eq("user_id", r.user_id).in("id", [input.briefs.primary, input.briefs.secondary]),
      presetsFor(key),
      productImageUrls(r.user_id, r.product_id, 3),
    ]);
    fail("Leer el cliente ideal", avatarRow.error);
    fail("Leer los desarrollos", briefRows.error);
    const byRole = Object.fromEntries((briefRows.data ?? []).map((b) => [b.role, b])) as Record<AngleRole, { angle: keyof typeof ANGLES; payload: CreativesContext["primary"]["payload"] }>;
    if (!brief || !avatarRow.data || !byRole.primary?.payload || !byRole.secondary?.payload) throw new AiStepError("not_found", "Cambió algo en Ángulos. Vuelve a aprobar los 2 desarrollos y reintenta.");
    if (!images.length) throw new AiStepError("no_image", "El producto no tiene una imagen base. Elige una en Información base.");

    const ctx: CreativesContext = {
      brief,
      avatar: avatarRow.data.payload as CustomerAvatar,
      pricing: input.pricing,
      labels: input.labels ?? undefined,
      primary: { name: ANGLES[byRole.primary.angle].name, payload: byRole.primary.payload },
      secondary: { name: ANGLES[byRole.secondary.angle].name, payload: byRole.secondary.payload },
      presets,
      hasRealReviews: (brief.proof.real_reviews?.length ?? 0) > 0,
    };
    const blocks = await Promise.all(images.map((u) => imageBlock(u).catch(() => null)));
    const imageContent = blocks.filter((b): b is NonNullable<typeof b> => b !== null);
    if (!imageContent.length) throw new AiStepError("no_image", "No pudimos leer la imagen base del producto. Revísala en Información base.");

    const facts = { presetIds: new Set(presets.map((p) => p.id)), pricing: input.pricing };
    let problems: string[] = [];
    let result: Awaited<ReturnType<typeof generateStructured<typeof creativeConceptsSchema>>> | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      result = await generateStructured({
        system: creativesSystem(input.market),
        content: [...imageContent, { type: "text", text: creativesUser(ctx, problems) }],
        schema: creativeConceptsSchema,
        effort: "medium",
        maxTokens: 16000,
      });
      problems = conceptProblems(result.data, facts);
      await recordAiGeneration({ userId: r.user_id, productId: r.product_id, step: "creative_concepts", usage: result.usage, error: problems.length ? "invalid_concepts" : null });
      if (!problems.length) break;
      console.warn("[creatives] conceptos inválidos", problems);
    }
    if (problems.length || !result) throw new AiStepError("invalid_output", "La IA propuso anuncios que no cumplen las reglas. Toca Reintentar.", undefined, true);

    const presetById = new Map(presets.map((p) => [p.id, p]));
    const rows = result.data.concepts.slice(0, CONCEPTS_PER_RUN).map((c, i) => {
      const p = c.preset_id ? presetById.get(c.preset_id) : undefined;
      const payload: StoredConcept = {
        ...c,
        product_look: result.data.product_look,
        kit: result.data.kit,
        preset: p ? { id: p.id, name: p.name, group: p.group, cover: p.cover } : null,
        sales_angle: byRole[c.angle].angle,
      };
      return { product_id: r.product_id, user_id: r.user_id, run_id: r.id, position: i, angle_role: c.angle, family: c.family, payload };
    });
    const now = stamp();
    fail("Guardar los conceptos", (await db.from("creative_concepts").insert(rows)).error);
    // Los conceptos anteriores quedan fuera de la pantalla; sus piezas aprobadas siguen en Anuncios.
    fail("Reemplazar los conceptos anteriores", (await db.from("creative_concepts").update({ superseded_at: now, updated_at: now }).eq("product_id", r.product_id).is("superseded_at", null).neq("run_id", r.id)).error);
    fail(
      "Guardar la corrida",
      (await db.from("creative_runs").update({ status: "succeeded", payload: result.data, prompt_version: CREATIVES_PROMPT_VERSION, model: result.usage.model, finished_at: now, updated_at: now }).eq("id", r.id)).error,
    );
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[creatives] conceptos", e);
    if (known && !e.logged) await recordAiGeneration({ userId: r.user_id, productId: r.product_id, step: "creative_concepts", usage: e.usage, error: e.code });
    await onHiggsfieldError(r.user_id, e);
    const message = known ? e.message : e instanceof HiggsfieldError ? e.message : "No pudimos proponer los anuncios. Toca Reintentar.";
    const now = stamp();
    const { error } = await db
      .from("creative_runs")
      .update({ status: "failed", error_code: known ? e.code : e instanceof HiggsfieldError ? e.code : "unexpected", error_message: message, finished_at: now, updated_at: now })
      .eq("id", r.id);
    if (error) console.error("[creatives] guardar la falla", error.message);
  }
}

/** Cambia los textos (o el preset) de un concepto antes de generarlo. */
export async function editConcept(userId: string, productId: string, conceptId: string, body: unknown): Promise<void> {
  const parsed = conceptEditSchema.safeParse(body);
  if (!parsed.success) throw new OptimizeError(`Revisa los textos: cada uno entre 1 y ${TEXT_LIMIT} caracteres, y un solo titular.`, 400);
  const concept = await getConceptRow(userId, productId, conceptId);
  if (!concept) throw new OptimizeError("Ese concepto ya no está vigente. Actualiza la página.", 409);
  const pricing = await getPricingPlan(userId, productId);
  if (!pricing) throw new OptimizeError("Guarda el precio en Información base.", 409);
  // Se cambian las palabras; la ubicación de cada texto (dirección de arte) se conserva por posición.
  const before = concept.payload.texts;
  const texts = parsed.data.texts.map((t, i) => (before[i]?.role === t.role ? { ...before[i], text: t.text } : t));
  const problems = textProblems(texts, pricing as PricingPlan, "", concept.family);
  if (problems.length) throw new OptimizeError(problems[0].replace(/^./, (c) => c.toUpperCase()), 400);
  const payload: StoredConcept = { ...concept.payload, texts };
  const now = new Date().toISOString();
  fail("Guardar el concepto", (await adminClient().from("creative_concepts").update({ payload, edited_at: now, updated_at: now }).eq("id", conceptId)).error);
}

// ---------------------------------------------------------------- 2. Render

/** Crea la pieza (queued) de un concepto en una proporción. Si ya hay una generándose, la devuelve. */
export async function startRender(userId: string, productId: string, conceptId: string, ratio: Ratio): Promise<{ asset: AssetRow; created: boolean }> {
  await requireKey(userId);
  const concept = await getConceptRow(userId, productId, conceptId);
  if (!concept) throw new OptimizeError("Ese concepto ya no está vigente. Actualiza la página.", 409);
  const db = adminClient();
  const busy = await db.from("creative_assets").select("*").eq("concept_id", conceptId).eq("ratio", ratio).in("render_status", ["queued", "running"]).limit(1).maybeSingle();
  fail("Leer la pieza", busy.error);
  if (busy.data) return { asset: busy.data as AssetRow, created: false };

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await db.from("creative_assets").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  fail("Contar las piezas", countError);
  if ((count ?? 0) >= DAILY_IMAGES) throw new OptimizeError(`Llegaste al máximo de ${DAILY_IMAGES} imágenes en 24 horas. Vuelve mañana.`, 429);

  return { asset: await insertAsset(concept, ratio, 1), created: true };
}

async function insertAsset(concept: ConceptRow, ratio: Ratio, attempt: number): Promise<AssetRow> {
  const run = await adminClient().from("creative_runs").select("input").eq("id", concept.run_id).single();
  fail("Leer la corrida", run.error);
  const market = (run.data?.input as RunInput | undefined)?.market;
  const req = renderRequest(concept.payload, ratio, languageName(market?.language ?? "es"), attempt);
  const { data, error } = await adminClient()
    .from("creative_assets")
    .insert({
      product_id: concept.product_id,
      user_id: concept.user_id,
      concept_id: concept.id,
      ratio,
      attempt,
      endpoint: req.endpoint,
      preset_id: req.presetId,
      input: req.input,
      baked_texts: concept.payload.texts,
      render_status: "queued",
    })
    .select("*")
    .single();
  fail("Crear la pieza", error);
  return data as AssetRow;
}

/** Toma la pieza si nadie la tocó en LEASE_MS (evita que el sondeo y el proceso la dupliquen). */
async function lease(assetId: string, statuses: AssetRow["render_status"][], force = false): Promise<AssetRow | null> {
  let q = adminClient().from("creative_assets").update({ updated_at: new Date().toISOString() }).eq("id", assetId).in("render_status", statuses);
  if (!force) q = q.lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString());
  const { data, error } = await q.select("*").maybeSingle();
  if (error) console.error("[creatives] tomar la pieza", error.message);
  return (data as AssetRow | null) ?? null;
}

async function patchAsset(id: string, patch: Record<string, unknown>) {
  fail("Guardar la pieza", (await adminClient().from("creative_assets").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)).error);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envía la pieza a Higgsfield y espera el resultado (con tope de tiempo: si no alcanza, el sondeo de
 * la pantalla la termina). Pensada para `after()`: nunca lanza. `force` la toma aunque se haya
 * tocado recién (la acaba de crear quien la llama).
 */
export async function processAsset(assetId: string, force = false): Promise<void> {
  const a = await lease(assetId, ["queued"], force);
  if (!a) return;
  const started = Date.now();
  let submitted = false;
  try {
    const key = await higgsfieldKey(a.user_id);
    if (!key) throw new HiggsfieldError("invalid_key", "Conecta tu cuenta de Higgsfield en Ajustes y genera de nuevo.");
    const [base] = await productImageUrls(a.user_id, a.product_id, 1);
    if (!base) throw new HiggsfieldError("bad_request", "El producto no tiene una imagen base. Elige una en Información base.");
    // La foto base, en JPEG de hasta 2048 px, subida a Higgsfield como referencia (la URL firmada de
    // Supabase no siempre es alcanzable desde afuera, p. ej., en local).
    const reference = await uploadImage(key, await toJpeg(await download(base), 2048), "image/jpeg");
    const { requestId } = await submit(key, a.endpoint, { ...a.input, image_urls: [reference] });
    await patchAsset(a.id, { render_status: "running", hf_request_id: requestId, submitted_at: new Date().toISOString(), error_code: null, error_message: null });
    submitted = true;
    await pollUntilDone({ ...a, hf_request_id: requestId, render_status: "running" }, key, started);
  } catch (e) {
    await onHiggsfieldError(a.user_id, e);
    if (e instanceof HiggsfieldError && e.code === "busy") {
      // Sin cupo en la cuenta: sigue en cola y el sondeo la vuelve a enviar.
      await patchAsset(a.id, { render_status: "queued", error_code: "busy", error_message: e.message });
      return;
    }
    if (submitted && e instanceof HiggsfieldError && (e.code === "network" || e.code === "unavailable")) {
      // Ya está en Higgsfield: queda en curso y el sondeo de la pantalla la termina.
      console.error("[creatives] render: se sigue con el sondeo", e.message);
      return;
    }
    const message = e instanceof HiggsfieldError ? e.message : "No pudimos generar la imagen. Toca Generar de nuevo.";
    if (!(e instanceof HiggsfieldError)) console.error("[creatives] render", e);
    await patchAsset(a.id, { render_status: "failed", error_code: e instanceof HiggsfieldError ? e.code : "unexpected", error_message: message, finished_at: new Date().toISOString() });
    await logRender(a, false, e instanceof HiggsfieldError ? e.code : "unexpected", Date.now() - started);
  }
}

async function pollUntilDone(a: AssetRow, key: string, started: number): Promise<void> {
  let wait = 3000;
  while (Date.now() - started < POLL_BUDGET_MS) {
    await sleep(wait);
    wait = Math.min(wait * 1.4, 8000);
    const state = await requestStatus(key, a.hf_request_id!).catch((e) => {
      // Un corte al consultar no es una falla de la imagen: Higgsfield sigue (y la cobra). Se vuelve a preguntar.
      if (e instanceof HiggsfieldError && (e.code === "network" || e.code === "unavailable")) return null;
      throw e;
    });
    // Mantener el lease: el sondeo no la toma mientras este proceso la espera.
    await patchAsset(a.id, {});
    if (!state || state.status === "queued" || state.status === "in_progress") continue;
    await finishAsset(a, state, key, started);
    return;
  }
}

/**
 * «Recuperar imagen»: una pieza que falló después de llegar a Higgsfield (un corte, un timeout) vuelve
 * a «en curso» con el lease vencido, y el sondeo le pregunta a Higgsfield por el mismo pedido. No se
 * genera ni se cobra de nuevo.
 */
export async function recoverAsset(userId: string, productId: string, assetId: string): Promise<void> {
  const a = await getAssetRow(userId, assetId);
  if (!a || a.product_id !== productId) throw new OptimizeError("No encontramos esa imagen.", 404);
  if (!isRecoverable(a)) throw new OptimizeError("Esta imagen no llegó a generarse en Higgsfield. Toca Generar de nuevo.", 409);
  await requireKey(userId);
  const now = Date.now();
  // Plazo nuevo para expireStaleCreatives y el lease ya vencido, para que el sondeo la tome.
  const patch = { render_status: "running", error_code: null, error_message: null, finished_at: null, submitted_at: new Date(now).toISOString(), updated_at: new Date(now - LEASE_MS - 1000).toISOString() };
  fail("Recuperar la pieza", (await adminClient().from("creative_assets").update(patch).eq("id", a.id).eq("render_status", "failed")).error);
}

/** El sondeo de la pantalla: termina las piezas que el proceso en segundo plano dejó esperando. */
export async function syncCreatives(userId: string, productId: string): Promise<void> {
  const { data, error } = await adminClient()
    .from("creative_assets")
    .select("id, render_status, hf_request_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .in("render_status", ["queued", "running"])
    .lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString());
  if (error) return console.error("[creatives] sincronizar", error.message);
  for (const row of (data ?? []) as Pick<AssetRow, "id" | "render_status" | "hf_request_id">[]) {
    try {
      if (row.render_status === "queued") {
        await processAsset(row.id);
        continue;
      }
      const a = await lease(row.id, ["running"]);
      if (!a?.hf_request_id) continue;
      const key = await higgsfieldKey(userId);
      if (!key) continue;
      const state = await requestStatus(key, a.hf_request_id);
      if (state.status === "queued" || state.status === "in_progress") continue;
      await finishAsset(a, state, key, Date.parse(a.submitted_at ?? a.created_at));
    } catch (e) {
      await onHiggsfieldError(userId, e);
      console.error("[creatives] sincronizar la pieza", row.id, e);
    }
  }
}

async function finishAsset(a: AssetRow, state: RequestState, key: string, started: number): Promise<void> {
  void key;
  const now = new Date().toISOString();
  if (state.status !== "completed" || !state.images[0]) {
    const message =
      state.status === "nsfw" ? "Higgsfield rechazó la imagen por sus reglas de contenido. Cambia los textos o la escena y genera de nuevo." : "Higgsfield no pudo generar la imagen. Toca Generar de nuevo.";
    await patchAsset(a.id, { render_status: "failed", error_code: state.status, error_message: message, finished_at: now });
    await logRender(a, false, state.status, Date.now() - started);
    return;
  }
  const bytes = await download(state.images[0]);
  const meta = await sharp(bytes).metadata();
  const ext = meta.format === "jpeg" ? "jpg" : meta.format === "webp" ? "webp" : "png";
  const path = `${a.user_id}/${a.product_id}/${a.id}.${ext}`;
  const up = await adminClient().storage.from(CREATIVES_BUCKET).upload(path, bytes, { contentType: `image/${meta.format === "jpeg" ? "jpeg" : ext}`, upsert: true });
  fail("Guardar la imagen", up.error);
  await logRender(a, true, undefined, Date.now() - started);

  const qa = await runQa(a, bytes).catch((e) => {
    console.error("[creatives] QA", e);
    return null;
  });
  await patchAsset(a.id, { render_status: "succeeded", storage_path: path, width: meta.width ?? null, height: meta.height ?? null, size_bytes: bytes.byteLength, qa, finished_at: new Date().toISOString() });

  // Un solo reintento automático: sin preset, que respeta mejor el texto (spec §7.2).
  if (qa && !qa.pass && a.attempt === 1) {
    const concept = await getConceptRow(a.user_id, a.product_id, a.concept_id);
    if (concept) {
      const retry = await insertAsset(concept, a.ratio, 2);
      await processAsset(retry.id, true);
    }
  }
}

// ---------------------------------------------------------------- 3. QA

async function runQa(a: AssetRow, generated: Buffer): Promise<QaResult> {
  const [base] = await productImageUrls(a.user_id, a.product_id, 1);
  if (!base) throw new Error("sin imagen base");
  const texts = a.baked_texts;
  const detail = await assetDetail(a);
  let result;
  try {
    result = await generateStructured({
      system: QA_SYSTEM,
      content: [
        { type: "text", text: "Foto real del producto:" },
        await imageBlock(base),
        { type: "text", text: "Anuncio generado:" },
        await imageBlockFromBytes(generated),
        { type: "text", text: qaUser(texts) },
      ],
      schema: qaSchema,
      effort: "low",
      maxTokens: 4000,
    });
  } catch (e) {
    if (e instanceof AiStepError) await recordAiGeneration({ userId: a.user_id, productId: a.product_id, step: "creative_qa", detail, usage: e.usage, error: e.code });
    throw e;
  }
  const { data, usage } = result;
  await recordAiGeneration({ userId: a.user_id, productId: a.product_id, step: "creative_qa", detail, usage });
  return qaVerdict(data);
}

// ---------------------------------------------------------------- Decidir

export type AssetDecision = "approve" | "reject" | "reopen";

/**
 * Aprobar copia la pieza a los creativos del producto en Anuncios (ad_media); descartarla o volver a
 * revisarla la saca de ahí, salvo que ya se haya subido a Meta (entonces queda: la usa una campaña).
 */
export async function decideAsset(userId: string, productId: string, assetId: string, action: AssetDecision): Promise<void> {
  const a = await getAssetRow(userId, assetId);
  if (!a || a.product_id !== productId) throw new OptimizeError("Esa imagen ya no existe. Actualiza la página.", 404);
  if (a.render_status !== "succeeded" || !a.storage_path) throw new OptimizeError("Esa imagen todavía no está lista.", 409);
  const db = adminClient();
  const now = new Date().toISOString();
  if (action === "approve") {
    const adMediaId = a.ad_media_id ?? (await copyToAds(a));
    fail("Guardar tu decisión", (await db.from("creative_assets").update({ status: "approved", decided_at: now, ad_media_id: adMediaId, updated_at: now }).eq("id", a.id)).error);
    return;
  }
  let adMediaId = a.ad_media_id;
  if (adMediaId) {
    const media = await db.from("ad_media").select("id, storage_path, meta_image_hash").eq("id", adMediaId).maybeSingle();
    fail("Leer el creativo", media.error);
    if (media.data && !media.data.meta_image_hash) {
      const rm = await db.storage.from(AD_MEDIA_BUCKET).remove([media.data.storage_path as string]);
      fail("Borrar el creativo", rm.error);
      fail("Borrar el creativo", (await db.from("ad_media").delete().eq("id", adMediaId)).error);
      adMediaId = null;
    }
  }
  const status = action === "reject" ? "rejected" : "in_review";
  fail("Guardar tu decisión", (await db.from("creative_assets").update({ status, decided_at: action === "reject" ? now : null, ad_media_id: adMediaId, updated_at: now }).eq("id", a.id)).error);
}

/** La pieza aprobada entra a los creativos del producto (bucket ad-media), lista para lanzar. */
async function copyToAds(a: AssetRow): Promise<string> {
  const db = adminClient();
  const file = await db.storage.from(CREATIVES_BUCKET).download(a.storage_path!);
  fail("Leer la imagen", file.error);
  const bytes = Buffer.from(await file.data!.arrayBuffer());
  const ext = a.storage_path!.split(".").pop() ?? "png";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const path = `${a.user_id}/${a.product_id}/creative-${a.id}.${ext}`;
  fail("Copiar a Anuncios", (await db.storage.from(AD_MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: true })).error);
  const concept = await db.from("creative_concepts").select("payload").eq("id", a.concept_id).single();
  fail("Leer el concepto", concept.error);
  const name = `${(concept.data?.payload as StoredConcept | undefined)?.name ?? "Creativo"} · ${a.ratio}`.slice(0, 120);
  const { data, error } = await db
    .from("ad_media")
    .insert({ user_id: a.user_id, product_id: a.product_id, kind: "image", name, storage_path: path, mime_type: mime, width: a.width, height: a.height, ratio: a.ratio, size_bytes: bytes.byteLength, status: "ready" })
    .select("id")
    .single();
  fail("Agregar a Anuncios", error);
  return (data as { id: string }).id;
}
