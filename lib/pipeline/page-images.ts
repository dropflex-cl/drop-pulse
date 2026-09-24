import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { recordAiGeneration } from "@/lib/ai/track";
import type { CustomerAvatar } from "@/lib/ai/schemas";
import { ANGLES, type AngleRole } from "@/lib/angles/catalog";
import { fail } from "@/lib/angles/store";
import { IMAGE_COST_USD } from "@/lib/creatives/catalog";
import { languageName } from "@/lib/creatives/render";
import { adminClient } from "@/lib/integrations/admin";
import { HiggsfieldError, requestStatus, submit, uploadImage, type RequestState } from "@/lib/integrations/higgsfield/client";
import { higgsfieldKey } from "@/lib/integrations/higgsfield/connection";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { Market } from "@/lib/market";
import { COVER, DAILY_IMAGES, DAILY_RUNS, GALLERY, GALLERY_MAX, MAX_OPTIONS_PER_SLOT, benefitSlot, slotKind } from "@/lib/page-images/catalog";
import { PAGE_QA_SYSTEM, pageImagesSystem, pageImagesUser, pageQaUser, type PageImagesContext } from "@/lib/page-images/prompts";
import { pageRenderRequest } from "@/lib/page-images/render";
import { PAGE_IMAGES_PROMPT_VERSION, pagePlanSchema, pageQaSchema, pageQaVerdict, planProblems, type PageQaResult, type StoredShot } from "@/lib/page-images/schemas";
import {
  PAGE_MEDIA_BUCKET,
  activeShots,
  getPageImageRow,
  getShotRow,
  isRecoverable,
  purgeDiscardedPageImages,
  type PageImageRow,
  type PageImageRunRow,
  type ShotRow,
} from "@/lib/page-images/store";
import { ProductApiError } from "@/lib/products/http";
import { latestAvatars, latestBrief, listImageRows } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import { approvedBriefs } from "./copy";
import { onHiggsfieldError, productImageUrls, requireKey } from "./creatives";
import { download, imageBlock, imageBlockFromBytes, toJpeg } from "./images";
import { optimizeImage } from "@/lib/media/optimize";
import { OptimizeError } from "./optimize";

// Etapa Imágenes (docs/spec-imagenes.md): las imágenes de la página del producto, por espacio.
// 1. El director de galería (Claude) propone una toma por espacio con dirección de arte: portada, 5 de
//    galería y una por cada beneficio aprobado en Textos.
// 2. Cada toma se renderiza en Higgsfield (Marketing Studio Flare, directo) desde la foto base.
// 3. Un QA con Claude revisa producto, textos y props; si falla, un reintento automático.
// El comerciante elige por espacio entre lo generado, sus fotos de Información base y lo que suba.

/** Cuánto espera el proceso en segundo plano antes de dejarle la imagen al sondeo de la pantalla. */
const POLL_BUDGET_MS = 200_000;
/** Intentos del director; cada uno recibe lo que falló en el anterior. */
const PLAN_ATTEMPTS = 3;
/** Otro proceso no toma una imagen que se tocó hace menos de esto (lease sobre updated_at). */
const LEASE_MS = 20_000;
/** Imágenes que se generan a la vez (la cuenta de Higgsfield tiene un cupo de concurrencia). */
const PARALLEL = 4;
const NO_KEY = "Conecta tu cuenta de Higgsfield en Ajustes para generar imágenes.";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const UPLOAD_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const stamp = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Corre `fn` sobre `items` con a lo más `n` a la vez. */
async function inBatches<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// ---------------------------------------------------------------- 1. El director

type RunInput = {
  market: Market;
  avatar_id: string;
  briefs: Record<AngleRole, string>;
};

/** Lo que el director necesita: sin esto la etapa no genera (sí deja elegir y subir). */
export async function generationBlocker(userId: string, productId: string): Promise<string | null> {
  const [brief, avatars, briefs] = await Promise.all([latestBrief(userId, productId), latestAvatars(userId, [productId]), approvedBriefs(userId, productId)]);
  if (!brief || avatars.get(productId)?.status !== "approved") return "Aprueba tu cliente ideal en Información base para generar imágenes.";
  if (!briefs) return "Aprueba los 2 desarrollos de Ángulos para generar imágenes.";
  return null;
}

async function loadContext(userId: string, productId: string) {
  const [brief, avatars, briefs] = await Promise.all([latestBrief(userId, productId), latestAvatars(userId, [productId]), approvedBriefs(userId, productId)]);
  const avatar = avatars.get(productId);
  if (!avatar || avatar.status !== "approved" || !brief) throw new OptimizeError("Aprueba tu cliente ideal en Información base para generar imágenes.", 409);
  if (!briefs) throw new OptimizeError("Aprueba los 2 desarrollos de Ángulos para generar imágenes.", 409);
  return { brief, avatar, briefs };
}

/** Los desarrollos aprobados hoy («primary,secondary»): si cambian, la galería quedó desactualizada. */
export async function approvedBriefStamp(userId: string, productId: string): Promise<string | null> {
  const briefs = await approvedBriefs(userId, productId);
  return briefs ? `${briefs.primary.id},${briefs.secondary.id}` : null;
}

/** Crea la corrida del director (queued). Tocar dos veces no cobra dos veces. */
export async function startPageImages(userId: string, productId: string): Promise<{ run: PageImageRunRow; created: boolean }> {
  await requireKey(userId, NO_KEY);
  const ctx = await loadContext(userId, productId);
  const db = adminClient();
  const active = await db.from("page_image_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).maybeSingle();
  fail("Leer la corrida", active.error);
  if (active.data) return { run: active.data as PageImageRunRow, created: false };

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await db.from("page_image_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  fail("Contar las corridas", countError);
  if ((count ?? 0) >= DAILY_RUNS) throw new OptimizeError(`Llegaste al máximo de ${DAILY_RUNS} galerías en 24 horas. Vuelve mañana.`, 429);

  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const input: RunInput = {
    market,
    avatar_id: ctx.avatar.id,
    briefs: { primary: ctx.briefs.primary.id, secondary: ctx.briefs.secondary.id },
  };
  const { data, error } = await db.from("page_image_runs").insert({ product_id: productId, user_id: userId, status: "queued", input }).select("*").single();
  if (error?.code === "23505") {
    const again = await db.from("page_image_runs").select("*").eq("product_id", productId).in("status", ["queued", "running"]).single();
    fail("Leer la corrida", again.error);
    return { run: again.data as PageImageRunRow, created: false };
  }
  fail("Crear la corrida", error);
  return { run: data as PageImageRunRow, created: true };
}

/**
 * Ejecuta el director y genera todas sus tomas. Pensada para `after()`: nunca lanza; deja el
 * resultado en las filas. Lo que no alcance a terminar lo termina el sondeo de la pantalla.
 */
export async function runPageImages(runId: string): Promise<void> {
  const db = adminClient();
  const claimed = await db.from("page_image_runs").update({ status: "running", started_at: stamp(), updated_at: stamp() }).eq("id", runId).eq("status", "queued").select("*").maybeSingle();
  if (claimed.error || !claimed.data) return;
  const r = claimed.data as PageImageRunRow & { input: RunInput };
  let created: PageImageRow[] = [];
  try {
    const key = await higgsfieldKey(r.user_id);
    if (!key) throw new AiStepError("no_key", "Conecta tu cuenta de Higgsfield en Ajustes y reintenta.");
    const input = r.input;
    const [brief, avatarRow, briefRows, images] = await Promise.all([
      latestBrief(r.user_id, r.product_id),
      db.from("customer_avatars").select("payload").eq("user_id", r.user_id).eq("id", input.avatar_id).single(),
      db.from("angle_briefs").select("id, angle, role, payload").eq("user_id", r.user_id).in("id", [input.briefs.primary, input.briefs.secondary]),
      productImageUrls(r.user_id, r.product_id, 3),
    ]);
    fail("Leer el cliente ideal", avatarRow.error);
    fail("Leer los desarrollos", briefRows.error);
    const byRole = Object.fromEntries((briefRows.data ?? []).map((b) => [b.role, b])) as Record<AngleRole, { angle: keyof typeof ANGLES; payload: PageImagesContext["primary"]["payload"] }>;
    if (!brief || !avatarRow.data || !byRole.primary?.payload || !byRole.secondary?.payload) throw new AiStepError("not_found", "Cambió algo en Ángulos. Vuelve a aprobar los 2 desarrollos y reintenta.");
    if (!images.length) throw new AiStepError("no_image", "El producto no tiene una imagen base. Elige una en Información base.");

    const ctx: PageImagesContext = {
      brief,
      avatar: avatarRow.data.payload as CustomerAvatar,
      primary: { name: ANGLES[byRole.primary.angle].name, payload: byRole.primary.payload },
      secondary: { name: ANGLES[byRole.secondary.angle].name, payload: byRole.secondary.payload },
    };
    const blocks = await Promise.all(images.map((u) => imageBlock(u).catch(() => null)));
    const imageContent = blocks.filter((b): b is NonNullable<typeof b> => b !== null);
    if (!imageContent.length) throw new AiStepError("no_image", "No pudimos leer la imagen base del producto. Revísala en Información base.");

    let problems: string[] = [];
    let result: Awaited<ReturnType<typeof generateStructured<typeof pagePlanSchema>>> | null = null;
    for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt++) {
      result = await generateStructured({
        system: pageImagesSystem(input.market),
        content: [...imageContent, { type: "text", text: pageImagesUser(ctx, problems) }],
        schema: pagePlanSchema,
        effort: "medium",
        maxTokens: 20000,
      });
      problems = planProblems(result.data);
      await recordAiGeneration({ userId: r.user_id, productId: r.product_id, step: "page_plan", usage: result.usage, error: problems.length ? "invalid_plan" : null });
      if (!problems.length) break;
      console.warn("[page-images] plan inválido", problems);
    }
    if (problems.length || !result) throw new AiStepError("invalid_output", "La IA propuso imágenes que no cumplen las reglas. Toca Reintentar.", undefined, true);

    const plan = result.data;
    const rows = plan.shots.map((s, i) => {
      const benefit = s.slot === "benefit" && s.benefit ? plan.benefits[s.benefit - 1] : undefined;
      const payload: StoredShot = { ...s, product_look: plan.product_look, kit: plan.kit, props_forbidden: plan.props_forbidden, pairs: benefit?.text };
      return { product_id: r.product_id, user_id: r.user_id, run_id: r.id, slot: s.slot === "benefit" ? benefitSlot(s.benefit!) : s.slot === "cover" ? COVER : GALLERY, position: i, payload };
    });
    const now = stamp();
    const inserted = await db.from("page_image_shots").insert(rows).select("id, product_id, user_id, run_id, slot, position, payload, created_at");
    fail("Guardar las tomas", inserted.error);
    // Las tomas anteriores quedan fuera; sus imágenes generadas se borran (también las elegidas).
    fail("Reemplazar las tomas anteriores", (await db.from("page_image_shots").update({ superseded_at: now, updated_at: now }).eq("product_id", r.product_id).is("superseded_at", null).neq("run_id", r.id)).error);
    await purgeDiscardedPageImages(r.user_id).catch((e) => console.error("[page-images] borrar lo reemplazado", e));
    fail("Guardar la corrida", (await db.from("page_image_runs").update({ status: "succeeded", payload: { ...plan, shots: undefined }, prompt_version: PAGE_IMAGES_PROMPT_VERSION, model: result.usage.model, finished_at: now, updated_at: now }).eq("id", r.id)).error);

    // Toda la galería de una vez: el comerciante ya vio el costo al tocar Generar.
    created = await Promise.all(((inserted.data ?? []) as ShotRow[]).map((s) => insertImage(s, 1, input.market)));
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[page-images] director", e);
    if (known && !e.logged) await recordAiGeneration({ userId: r.user_id, productId: r.product_id, step: "page_plan", usage: e.usage, error: e.code });
    await onHiggsfieldError(r.user_id, e);
    const message = known ? e.message : e instanceof HiggsfieldError ? e.message : "No pudimos proponer las imágenes. Toca Reintentar.";
    const now = stamp();
    const { error } = await db
      .from("page_image_runs")
      .update({ status: "failed", error_code: known ? e.code : e instanceof HiggsfieldError ? e.code : "unexpected", error_message: message, finished_at: now, updated_at: now })
      .eq("id", r.id);
    if (error) console.error("[page-images] guardar la falla", error.message);
    return;
  }
  await inBatches(created, PARALLEL, (img) => processImage(img.id, true));
}

// ---------------------------------------------------------------- 2. Render

async function runMarket(runId: string): Promise<Market | undefined> {
  const { data, error } = await adminClient().from("page_image_runs").select("input").eq("id", runId).single();
  fail("Leer la corrida", error);
  return (data?.input as RunInput | undefined)?.market;
}

async function insertImage(shot: ShotRow, attempt: number, market?: Market, retryOf?: string): Promise<PageImageRow> {
  const m = market ?? (await runMarket(shot.run_id));
  const req = pageRenderRequest(shot.slot, shot.payload, languageName(m?.language ?? "es"));
  const { data, error } = await adminClient()
    .from("page_images")
    .insert({
      product_id: shot.product_id,
      user_id: shot.user_id,
      slot: shot.slot,
      source: "ai",
      shot_id: shot.id,
      attempt,
      retry_of: retryOf ?? null,
      endpoint: req.endpoint,
      input: req.input,
      baked_texts: shot.payload.texts,
      render_status: "queued",
    })
    .select("*")
    .single();
  fail("Crear la imagen", error);
  return data as PageImageRow;
}

async function checkDailyImages(userId: string, adding: number) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await adminClient().from("page_images").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "ai").is("input->>copied_from", null).gte("created_at", since);
  fail("Contar las imágenes", error);
  if ((count ?? 0) + adding > DAILY_IMAGES) throw new OptimizeError(`Llegaste al máximo de ${DAILY_IMAGES} imágenes en 24 horas. Vuelve mañana.`, 429);
}

/** «Generar otra»: una imagen más de la misma toma. Devuelve la fila creada (queued). */
export async function startShotRender(userId: string, productId: string, shotId: string): Promise<PageImageRow> {
  await requireKey(userId, NO_KEY);
  const shot = await getShotRow(userId, productId, shotId);
  if (!shot) throw new OptimizeError("Esa toma ya no está vigente. Actualiza la página.", 409);
  const { count, error } = await adminClient().from("page_images").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("slot", shot.slot).eq("source", "ai").neq("status", "rejected");
  fail("Contar las opciones", error);
  if ((count ?? 0) >= MAX_OPTIONS_PER_SLOT) throw new OptimizeError(`Este espacio ya tiene ${MAX_OPTIONS_PER_SLOT} opciones. Descarta alguna para generar otra.`, 409);
  await checkDailyImages(userId, 1);
  return insertImage(shot, 1);
}

/** «Generar los vacíos»: una imagen para cada toma que no tiene ninguna viva. */
export async function startFillEmpty(userId: string, productId: string): Promise<PageImageRow[]> {
  await requireKey(userId, NO_KEY);
  const db = adminClient();
  const [shots, images] = await Promise.all([
    db.from("page_image_shots").select("id, product_id, user_id, run_id, slot, position, payload, created_at").eq("user_id", userId).eq("product_id", productId).is("superseded_at", null).order("position"),
    db.from("page_images").select("shot_id, render_status, status").eq("user_id", userId).eq("product_id", productId).not("shot_id", "is", null),
  ]);
  fail("Leer las tomas", shots.error);
  fail("Leer las imágenes", images.error);
  const alive = new Set(((images.data ?? []) as { shot_id: string; render_status: string; status: string }[]).filter((i) => i.render_status !== "failed" && i.status !== "rejected").map((i) => i.shot_id));
  const empty = ((shots.data ?? []) as ShotRow[]).filter((s) => !alive.has(s.id));
  if (!empty.length) return [];
  await checkDailyImages(userId, empty.length);
  const market = await runMarket(empty[0].run_id);
  return Promise.all(empty.map((s) => insertImage(s, 1, market)));
}

/** Procesa varias imágenes recién creadas, de a PARALLEL. Para `after()`. */
export async function processImages(ids: string[]): Promise<void> {
  await inBatches(ids, PARALLEL, (id) => processImage(id, true));
}

/** Toma la imagen si nadie la tocó en LEASE_MS (evita que el sondeo y el proceso la dupliquen). */
async function lease(imageId: string, statuses: PageImageRow["render_status"][], force = false): Promise<PageImageRow | null> {
  let q = adminClient().from("page_images").update({ updated_at: stamp() }).eq("id", imageId).in("render_status", statuses);
  if (!force) q = q.lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString());
  const { data, error } = await q.select("*").maybeSingle();
  if (error) console.error("[page-images] tomar la imagen", error.message);
  return (data as PageImageRow | null) ?? null;
}

async function patchImage(id: string, patch: Record<string, unknown>) {
  fail("Guardar la imagen", (await adminClient().from("page_images").update({ ...patch, updated_at: stamp() }).eq("id", id)).error);
}

/** Qué imagen es, para el historial: «Infografía · Galería». */
async function imageDetail(a: PageImageRow): Promise<string> {
  const { data } = a.shot_id ? await adminClient().from("page_image_shots").select("payload").eq("id", a.shot_id).maybeSingle() : { data: null };
  const name = (data as { payload: StoredShot } | null)?.payload?.name;
  const kind = slotKind(a.slot);
  return [name, kind === "cover" ? "Portada" : kind === "gallery" ? "Galería" : "Beneficio"].filter(Boolean).join(" · ");
}

/** Cada imagen de Higgsfield queda registrada con la cota de IMAGE_COST_USD, marcada como estimada. */
async function logRender(a: PageImageRow, ok: boolean, error?: string, latencyMs?: number) {
  await recordAiGeneration({
    userId: a.user_id,
    productId: a.product_id,
    step: "page_render",
    detail: await imageDetail(a),
    provider: "higgsfield",
    model: a.endpoint ?? undefined,
    error: ok ? null : (error ?? "failed"),
    estimatedCostUsd: ok ? IMAGE_COST_USD : null,
    latencyMs,
  });
}

/**
 * Envía la imagen a Higgsfield y espera el resultado (con tope de tiempo: si no alcanza, el sondeo de
 * la pantalla la termina). Pensada para `after()`: nunca lanza.
 */
export async function processImage(imageId: string, force = false): Promise<void> {
  const a = await lease(imageId, ["queued"], force);
  if (!a || a.source !== "ai") return;
  const started = Date.now();
  let submitted = false;
  try {
    const key = await higgsfieldKey(a.user_id);
    if (!key) throw new HiggsfieldError("invalid_key", "Conecta tu cuenta de Higgsfield en Ajustes y genera de nuevo.");
    const [base] = await productImageUrls(a.user_id, a.product_id, 1);
    if (!base) throw new HiggsfieldError("bad_request", "El producto no tiene una imagen base. Elige una en Información base.");
    const reference = await uploadImage(key, await toJpeg(await download(base), 2048), "image/jpeg");
    const { requestId } = await submit(key, a.endpoint!, { ...a.input, image_urls: [reference] });
    await patchImage(a.id, { render_status: "running", hf_request_id: requestId, submitted_at: stamp(), error_code: null, error_message: null });
    submitted = true;
    await pollUntilDone({ ...a, hf_request_id: requestId, render_status: "running" }, key, started);
  } catch (e) {
    await onHiggsfieldError(a.user_id, e);
    if (e instanceof HiggsfieldError && e.code === "busy") {
      // Sin cupo en la cuenta: sigue en cola y el sondeo la vuelve a enviar.
      await patchImage(a.id, { render_status: "queued", error_code: "busy", error_message: e.message });
      return;
    }
    if (submitted && e instanceof HiggsfieldError && (e.code === "network" || e.code === "unavailable")) {
      console.error("[page-images] render: se sigue con el sondeo", e.message);
      return;
    }
    const message = e instanceof HiggsfieldError ? e.message : "No pudimos generar la imagen. Toca Generar otra.";
    if (!(e instanceof HiggsfieldError)) console.error("[page-images] render", e);
    await patchImage(a.id, { render_status: "failed", error_code: e instanceof HiggsfieldError ? e.code : "unexpected", error_message: message, finished_at: stamp() });
    await logRender(a, false, e instanceof HiggsfieldError ? e.code : "unexpected", Date.now() - started);
  }
}

async function pollUntilDone(a: PageImageRow, key: string, started: number): Promise<void> {
  let wait = 3000;
  while (Date.now() - started < POLL_BUDGET_MS) {
    await sleep(wait);
    wait = Math.min(wait * 1.4, 8000);
    const state = await requestStatus(key, a.hf_request_id!).catch((e) => {
      // Un corte al consultar no es una falla de la imagen: Higgsfield sigue (y la cobra).
      if (e instanceof HiggsfieldError && (e.code === "network" || e.code === "unavailable")) return null;
      throw e;
    });
    await patchImage(a.id, {});
    if (!state || state.status === "queued" || state.status === "in_progress") continue;
    await finishImage(a, state, started);
    return;
  }
}

/** «Recuperar imagen»: vuelve a preguntarle a Higgsfield por el mismo pedido, sin volver a cobrar. */
export async function recoverImage(a: PageImageRow): Promise<void> {
  if (!isRecoverable(a)) throw new OptimizeError("Esta imagen no llegó a generarse en Higgsfield. Toca Generar otra.", 409);
  await requireKey(a.user_id, NO_KEY);
  const now = Date.now();
  const patch = { render_status: "running", error_code: null, error_message: null, finished_at: null, submitted_at: new Date(now).toISOString(), updated_at: new Date(now - LEASE_MS - 1000).toISOString() };
  fail("Recuperar la imagen", (await adminClient().from("page_images").update(patch).eq("id", a.id).eq("render_status", "failed")).error);
}

/** El sondeo de la pantalla: termina las imágenes que el proceso en segundo plano dejó esperando. */
export async function syncPageImages(userId: string, productId: string): Promise<void> {
  const { data, error } = await adminClient()
    .from("page_images")
    .select("id, render_status, hf_request_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("source", "ai")
    .in("render_status", ["queued", "running"])
    .lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString());
  if (error) return console.error("[page-images] sincronizar", error.message);
  await inBatches((data ?? []) as Pick<PageImageRow, "id" | "render_status" | "hf_request_id">[], PARALLEL, async (row) => {
    try {
      if (row.render_status === "queued") return await processImage(row.id);
      const a = await lease(row.id, ["running"]);
      if (!a?.hf_request_id) return;
      const key = await higgsfieldKey(userId);
      if (!key) return;
      const state = await requestStatus(key, a.hf_request_id);
      if (state.status === "queued" || state.status === "in_progress") return;
      await finishImage(a, state, Date.parse(a.submitted_at ?? a.created_at));
    } catch (e) {
      await onHiggsfieldError(userId, e);
      console.error("[page-images] sincronizar la imagen", row.id, e);
    }
  });
}

async function finishImage(a: PageImageRow, state: RequestState, started: number): Promise<void> {
  if (state.status !== "completed" || !state.images[0]) {
    const message =
      state.status === "nsfw" ? "Higgsfield rechazó la imagen por sus reglas de contenido. Toca Generar otra." : "Higgsfield no pudo generar la imagen. Toca Generar otra.";
    await patchImage(a.id, { render_status: "failed", error_code: state.status, error_message: message, finished_at: stamp() });
    await logRender(a, false, state.status, Date.now() - started);
    return;
  }
  // Va a la landing: se guarda como WebP optimizado. El QA mira el original, sin re-comprimir.
  const bytes = await download(state.images[0]);
  const img = await optimizeImage(bytes);
  const path = `${a.user_id}/${a.product_id}/${a.id}.${img.ext}`;
  const up = await adminClient().storage.from(PAGE_MEDIA_BUCKET).upload(path, img.data, { contentType: img.mime, upsert: true });
  fail("Guardar la imagen", up.error);
  await logRender(a, true, undefined, Date.now() - started);

  const qa = await runQa(a, bytes).catch((e) => {
    console.error("[page-images] QA", e);
    return null;
  });
  await patchImage(a.id, { render_status: "succeeded", storage_path: path, width: img.width, height: img.height, size_bytes: img.data.byteLength, qa, finished_at: stamp() });
  // El reintento salió: el intento que el QA rechazó se descarta (se borra pasado el plazo), salvo que
  // el comerciante ya lo haya elegido.
  if (a.retry_of) {
    const now = stamp();
    fail("Descartar el primer intento", (await adminClient().from("page_images").update({ status: "rejected", decided_at: now, updated_at: now }).eq("id", a.retry_of).eq("status", "generated")).error);
  }

  // Si la toma se reemplazó mientras se generaba, la imagen ya no tiene espacio: se borra ahora.
  const shot = a.shot_id ? await getShotRow(a.user_id, a.product_id, a.shot_id) : null;
  if (!shot) {
    await purgeDiscardedPageImages(a.user_id).catch((e) => console.error("[page-images] borrar lo reemplazado", e));
    return;
  }
  // Un reintento automático: otra generación de la misma toma. Si sale bien, reemplaza a esta.
  if (qa && !qa.pass && a.attempt === 1) {
    const retry = await insertImage(shot, 2, undefined, a.id);
    await processImage(retry.id, true);
  }
}

// ---------------------------------------------------------------- 3. QA

async function runQa(a: PageImageRow, generated: Buffer): Promise<PageQaResult> {
  const [[base], brief] = await Promise.all([productImageUrls(a.user_id, a.product_id, 1), latestBrief(a.user_id, a.product_id)]);
  if (!base || !brief) throw new Error("sin imagen base o sin ficha");
  const detail = await imageDetail(a);
  let result;
  try {
    result = await generateStructured({
      system: PAGE_QA_SYSTEM,
      content: [
        { type: "text", text: "Foto real del producto:" },
        await imageBlock(base),
        { type: "text", text: "Imagen generada:" },
        await imageBlockFromBytes(generated),
        { type: "text", text: pageQaUser(brief, a.baked_texts) },
      ],
      schema: pageQaSchema,
      effort: "low",
      maxTokens: 4000,
    });
  } catch (e) {
    if (e instanceof AiStepError) await recordAiGeneration({ userId: a.user_id, productId: a.product_id, step: "page_qa", detail, usage: e.usage, error: e.code });
    throw e;
  }
  await recordAiGeneration({ userId: a.user_id, productId: a.product_id, step: "page_qa", detail, usage: result.usage });
  return pageQaVerdict(result.data);
}

// ---------------------------------------------------------------- Elegir

export type OptionAction = "choose" | "unchoose" | "discard" | "reopen" | "recover" | "cover";

/** El espacio existe hoy: Portada, Galería o un beneficio de la galería vigente del director. */
async function assertSlot(userId: string, productId: string, slot: string) {
  const kind = slotKind(slot);
  if (!kind) throw new ProductApiError("Ese espacio no existe.", 400, "slot");
  if (kind === "benefit") {
    const shots = await activeShots(userId, productId);
    if (!shots.some((s) => s.slot === slot)) throw new ProductApiError("Ese beneficio ya no está en la galería. Actualiza.", 409, "slot");
  }
}

/** Las elegidas de la galería quedan numeradas 1…n, sin huecos, en el orden que tenían. */
async function compactGallery(userId: string, productId: string) {
  const db = adminClient();
  const { data, error } = await db.from("page_images").select("id, position, created_at").eq("user_id", userId).eq("product_id", productId).eq("slot", GALLERY).eq("status", "approved");
  fail("Leer la galería", error);
  const sorted = ((data ?? []) as { id: string; position: number | null; created_at: string }[]).sort((x, y) => (x.position ?? 99) - (y.position ?? 99) || x.created_at.localeCompare(y.created_at));
  await Promise.all(sorted.map((r, i) => (r.position === i + 1 ? null : db.from("page_images").update({ position: i + 1, updated_at: stamp() }).eq("id", r.id))));
}

async function choose(a: PageImageRow) {
  if (a.render_status !== "succeeded") throw new OptimizeError("Esa imagen todavía no está lista.", 409);
  const db = adminClient();
  const now = stamp();
  if (a.slot === GALLERY) {
    if (a.status === "approved") return;
    const { count, error } = await db.from("page_images").select("id", { count: "exact", head: true }).eq("product_id", a.product_id).eq("slot", GALLERY).eq("status", "approved");
    fail("Contar la galería", error);
    if ((count ?? 0) >= GALLERY_MAX) throw new OptimizeError(`La galería ya tiene ${GALLERY_MAX} imágenes. Quita una para agregar otra.`, 409);
    fail("Elegir la imagen", (await db.from("page_images").update({ status: "approved", position: (count ?? 0) + 1, decided_at: now, updated_at: now }).eq("id", a.id)).error);
    return;
  }
  // Portada y beneficios llevan una sola: la anterior vuelve a ser opción.
  fail("Cambiar la elegida", (await db.from("page_images").update({ status: "generated", position: null, decided_at: null, updated_at: now }).eq("product_id", a.product_id).eq("slot", a.slot).eq("status", "approved").neq("id", a.id)).error);
  fail("Elegir la imagen", (await db.from("page_images").update({ status: "approved", position: 1, decided_at: now, updated_at: now }).eq("id", a.id)).error);
}

export async function decideOption(userId: string, productId: string, imageId: string, action: OptionAction): Promise<void> {
  const a = await getPageImageRow(userId, imageId);
  if (!a || a.product_id !== productId) throw new OptimizeError("Esa imagen ya no existe. Actualiza la página.", 404);
  const db = adminClient();
  const now = stamp();
  switch (action) {
    case "choose":
      return choose(a);
    case "unchoose":
      fail("Quitar la imagen", (await db.from("page_images").update({ status: "generated", position: null, decided_at: null, updated_at: now }).eq("id", a.id)).error);
      if (a.slot === GALLERY) await compactGallery(userId, productId);
      return;
    case "discard":
      // Una foto de Información base no tiene archivo propio: se quita al tiro.
      if (a.source === "reference") {
        fail("Quitar la imagen", (await db.from("page_images").delete().eq("id", a.id)).error);
      } else {
        if (a.render_status === "queued" || a.render_status === "running") throw new OptimizeError("Espera a que termine de generarse.", 409);
        fail("Descartar la imagen", (await db.from("page_images").update({ status: "rejected", position: null, decided_at: now, updated_at: now }).eq("id", a.id)).error);
      }
      if (a.slot === GALLERY && a.status === "approved") await compactGallery(userId, productId);
      return;
    case "reopen":
      fail("Deshacer", (await db.from("page_images").update({ status: "generated", decided_at: null, updated_at: now }).eq("id", a.id).eq("status", "rejected")).error);
      return;
    case "recover":
      return recoverImage(a);
    case "cover":
      return coverFrom(a);
  }
}

/**
 * «Usar de portada»: una imagen de la galería (las dos son 1:1) pasa a ser la portada. La portada
 * recibe su propia copia (fila y archivo, marcada con `input.copied_from`): así la galería conserva
 * su opción, «Proponer otra galería» no se lleva la portada y descartar una no borra la otra. Si la
 * imagen estaba elegida en la galería, sale de ella: la tienda no la mostraría dos veces.
 */
async function coverFrom(a: PageImageRow) {
  if (a.slot !== GALLERY) throw new OptimizeError("Solo una imagen de la galería puede pasar a ser la portada.", 400);
  if (a.render_status !== "succeeded" || a.status === "rejected") throw new OptimizeError("Esa imagen todavía no está lista.", 409);
  if (a.source === "reference") {
    await chooseReference(a.user_id, a.product_id, COVER, a.reference_image_id!);
  } else {
    if (!a.storage_path) throw new OptimizeError("Esa imagen ya no tiene archivo. Actualiza la página.", 409);
    const db = adminClient();
    const existing = await db.from("page_images").select("*").eq("product_id", a.product_id).eq("slot", COVER).eq("input->>copied_from", a.id).neq("status", "rejected").limit(1).maybeSingle();
    fail("Leer la portada", existing.error);
    let row = existing.data as PageImageRow | null;
    if (!row) {
      const path = `${a.user_id}/${a.product_id}/cover-${randomUUID()}.${a.storage_path.split(".").pop() ?? "jpg"}`;
      const copy = await db.storage.from(PAGE_MEDIA_BUCKET).copy(a.storage_path, path);
      if (copy.error) throw new Error(`Copiar la portada: ${copy.error.message}`);
      const { data, error } = await db
        .from("page_images")
        .insert({
          product_id: a.product_id,
          user_id: a.user_id,
          slot: COVER,
          source: a.source,
          input: { copied_from: a.id },
          baked_texts: a.baked_texts,
          qa: a.qa,
          render_status: "succeeded",
          storage_path: path,
          width: a.width,
          height: a.height,
          size_bytes: a.size_bytes,
          finished_at: stamp(),
        })
        .select("*")
        .single();
      if (error) await db.storage.from(PAGE_MEDIA_BUCKET).remove([path]);
      fail("Crear la portada", error);
      row = data as PageImageRow;
    }
    await choose(row);
  }
  if (a.status === "approved") {
    fail("Quitar de la galería", (await adminClient().from("page_images").update({ status: "generated", position: null, decided_at: null, updated_at: stamp() }).eq("id", a.id)).error);
    await compactGallery(a.user_id, a.product_id);
  }
}

/** Elegir una foto de Información base para un espacio: se crea su opción (una por espacio) y se elige. */
export async function chooseReference(userId: string, productId: string, slot: string, referenceId: string): Promise<void> {
  await assertSlot(userId, productId, slot);
  const refs = await listImageRows(userId, [productId]);
  const ref = refs.find((r) => r.id === referenceId && !r.excluded);
  if (!ref) throw new ProductApiError("Esa foto ya no está en Información base.", 404, "referenceId");
  const db = adminClient();
  const existing = await db.from("page_images").select("*").eq("product_id", productId).eq("slot", slot).eq("reference_image_id", referenceId).maybeSingle();
  fail("Leer la foto", existing.error);
  let row = existing.data as PageImageRow | null;
  if (!row) {
    const { data, error } = await db
      .from("page_images")
      .insert({ product_id: productId, user_id: userId, slot, source: "reference", reference_image_id: referenceId, render_status: "succeeded", finished_at: stamp() })
      .select("*")
      .single();
    fail("Agregar la foto", error);
    row = data as PageImageRow;
  }
  await choose(row);
}

/** El orden de la galería: `ids` son las elegidas, de la primera a la última. */
export async function reorderGallery(userId: string, productId: string, ids: string[]): Promise<void> {
  const db = adminClient();
  const { data, error } = await db.from("page_images").select("id").eq("user_id", userId).eq("product_id", productId).eq("slot", GALLERY).eq("status", "approved");
  fail("Leer la galería", error);
  const current = new Set((data ?? []).map((r) => r.id as string));
  if (ids.length !== current.size || ids.some((id) => !current.has(id))) throw new ProductApiError("La galería cambió. Actualiza la página.", 409);
  await Promise.all(ids.map((id, i) => db.from("page_images").update({ position: i + 1, updated_at: stamp() }).eq("id", id)));
}

// ---------------------------------------------------------------- Subir

export async function preparePageUpload(userId: string, productId: string, file: { type?: string; size?: number }) {
  const ext = file.type ? UPLOAD_TYPES[file.type] : undefined;
  if (!ext) throw new ProductApiError("Sube una imagen JPG, PNG o WebP.", 415, "file");
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new ProductApiError("La imagen pesa más de 15 MB.", 413, "file");
  const path = `${userId}/${productId}/upload-${randomUUID()}.${ext}`;
  const { data, error } = await adminClient().storage.from(PAGE_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Preparar la subida: ${error?.message ?? "sin URL"}`);
  return { path, uploadUrl: data.signedUrl };
}

/** La imagen ya se subió con la URL firmada: se revisa que sea una imagen legible y se agrega al espacio. */
export async function confirmPageUpload(userId: string, productId: string, slot: string, path: string): Promise<void> {
  if (!path.startsWith(`${userId}/${productId}/upload-`) || path.includes("..")) throw new ProductApiError("Esa subida no es de este producto.", 400, "path");
  await assertSlot(userId, productId, slot);
  const db = adminClient();
  const drop = async (msg: string) => {
    await db.storage.from(PAGE_MEDIA_BUCKET).remove([path]);
    throw new ProductApiError(msg, 415, "file");
  };
  const file = await db.storage.from(PAGE_MEDIA_BUCKET).download(path);
  if (file.error || !file.data) throw new ProductApiError("No encontramos la imagen subida. Súbela de nuevo.", 404, "path");
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const meta = await sharp(bytes).metadata().catch(() => null);
  if (!meta?.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format ?? "")) return drop("Sube una imagen JPG, PNG o WebP.");
  if (Math.min(meta.width, meta.height) < 600) return drop("La imagen es muy chica: usa una de al menos 600 px por lado.");
  // Se reemplaza por su versión WebP optimizada (va a la landing) y el original se borra.
  const img = await optimizeImage(bytes).catch(() => null);
  if (!img) return drop("No pudimos leer esa imagen. Prueba con otro archivo JPG, PNG o WebP.");
  const stored = `${userId}/${productId}/upload-${randomUUID()}.${img.ext}`;
  const up = await db.storage.from(PAGE_MEDIA_BUCKET).upload(stored, img.data, { contentType: img.mime, upsert: false });
  await db.storage.from(PAGE_MEDIA_BUCKET).remove([path]);
  if (up.error) throw new ProductApiError("No pudimos guardar la imagen. Súbela de nuevo.", 500, "file");
  const { error } = await db.from("page_images").insert({
    product_id: productId,
    user_id: userId,
    slot,
    source: "upload",
    input: { original_bytes: bytes.byteLength },
    render_status: "succeeded",
    storage_path: stored,
    width: img.width,
    height: img.height,
    size_bytes: img.data.byteLength,
    finished_at: stamp(),
  });
  if (error) await db.storage.from(PAGE_MEDIA_BUCKET).remove([stored]);
  fail("Agregar la imagen", error);
}
