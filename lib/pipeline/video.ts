import "server-only";
import { randomUUID } from "node:crypto";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { afterCacheWarm } from "@/lib/ai/cache-gate";
import { retryableContent } from "@/lib/ai/content";
import { recordAiGeneration } from "@/lib/ai/track";
import type { CustomerAvatar, PackLabel } from "@/lib/ai/schemas";
import { testAngleName, type AngleSlot } from "@/lib/angles/catalog";
import { anglesForPrompt, fail } from "@/lib/angles/store";
import { getDifferentiator } from "@/lib/competitors/store";
import { AD_MEDIA_BUCKET, CREATIVES_BUCKET, removeAdCopies } from "@/lib/creatives/store";
import { ratioOf, sniffMedia } from "@/lib/ads/media";
import { adminClient } from "@/lib/integrations/admin";
import { HiggsfieldError, requestStatus, submit, uploadImage, type RequestState } from "@/lib/integrations/higgsfield/client";
import { higgsfieldKey, markHiggsfieldInvalid } from "@/lib/integrations/higgsfield/connection";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { Market } from "@/lib/market";
import { optimizeForAds } from "@/lib/media/optimize";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import type { PricingPlan } from "@/lib/pricing/plan";
import { getPricingPlan } from "@/lib/pricing/store";
import { imagesForGeneration, latestAvatars, latestBrief, listImageRows } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import {
  CHARACTER_KEY,
  DAILY_CLIPS,
  DAILY_KEYFRAMES,
  DAILY_SCRIPTS,
  FINAL_MAX_BYTES,
  FINAL_SECONDS_MAX,
  FINAL_SECONDS_MIN,
  KEYFRAME_COST_USD,
  KLING_TURBO_5S_USD,
  formatOf,
  type ShotKind,
  type VideoFormat,
} from "@/lib/video/catalog";
import { seedanceCostUsd } from "@/lib/video/cost";
import { PackageNotReady, buildPackage, type MontagePackage } from "@/lib/video/package";
import { KEYFRAME_QA_SYSTEM, keyframeQaUser, scriptSystem, ugcContextText, ugcTail, type UgcContext } from "@/lib/video/prompts";
import { aRollRequest, bRollRequest, keyframeRefs, keyframeRequest, type ShotRequest } from "@/lib/video/render";
import {
  MASCOT_PROMPT_VERSION,
  UGC_PROMPT_VERSION,
  applyScriptEdit,
  changedLines,
  keyframeQaSchema,
  keyframeQaVerdict,
  scriptEditSchema,
  scriptProblems,
  ugcScriptSchema,
  type KeyframeQa,
  type UgcScript,
} from "@/lib/video/schemas";
import { activeScripts, getScriptRow, getShotRow, isShotRecoverable, latestByKey, purgeSupersededVideos, shotsFor, videoStep, type ScriptRow, type ShotRow } from "@/lib/video/store";
import { approvedAngles } from "./angles";
import { download, imageBlock, imageBlockFromBytes, toJpeg } from "./images";
import { OptimizeError } from "./optimize";

// Video UGC en Creativos (docs/spec-video-ugc.md). Cada paso en segundo plano (after), como Creativos:
// 1. El guionista (Claude) escribe el guion de un ángulo; el comerciante lo edita y lo aprueba.
// 2. Las imágenes clave (Flare): K1 define la cara y las demás la usan de referencia; un QA con Claude
//    revisa manos, producto, cara y textos. El comerciante aprueba cada una.
// 3. Los clips: tomas habladas en Seedance 2.0 (voz y labios desde el prompt) y B-roll en Kling.
// 4. El paquete de montaje va al script local (scripts/ugc-montage.py); el video final vuelve por
//    «Subir video montado» y, al aprobarlo, pasa a Anuncios.

const POLL_BUDGET_MS = 200_000;
const SCRIPT_ATTEMPTS = 3;
const LEASE_MS = 20_000;
const PACKAGE_TTL_S = 24 * 60 * 60;
const REFERENCES_BUCKET = "product-references";
const VIDEO_FETCH_TIMEOUT_MS = 120_000;

const stamp = () => new Date().toISOString();
const since24h = () => new Date(Date.now() - 86_400_000).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function onHiggsfieldError(userId: string, e: unknown) {
  if (e instanceof HiggsfieldError && e.code === "invalid_key") await markHiggsfieldInvalid(userId, e.message);
}

async function requireHiggsfield(userId: string): Promise<string> {
  const key = await higgsfieldKey(userId);
  if (!key) throw new OptimizeError("Conecta tu cuenta de Higgsfield en Ajustes para hacer videos.", 409);
  return key;
}

/** La foto base: la URL para descargarla ahora y, si vive en Storage, su ruta (para firmarla más largo). */
async function baseImage(userId: string, productId: string): Promise<{ url: string; storagePath: string | null } | null> {
  const [row] = imagesForGeneration(await listImageRows(userId, [productId]));
  if (!row) return null;
  if (!row.storage_path) return row.url ? { url: row.url, storagePath: null } : null;
  const { data, error } = await adminClient().storage.from(REFERENCES_BUCKET).createSignedUrl(row.storage_path, 60 * 60);
  if (error || !data) return null;
  return { url: data.signedUrl, storagePath: row.storage_path };
}

// ---------------------------------------------------------------- 1. Guion

type ScriptInput = {
  market: Market;
  pricing: PricingPlan;
  labels: PackLabel[] | null;
  avatar_id: string;
  brief_id: string;
  brief_edited_at: string | null;
  angle_name: string;
  /** Sin él (guiones anteriores al formato mascota), UGC. */
  format?: VideoFormat;
};

const scriptFormat = (s: Pick<ScriptRow, "input">) => formatOf((s.input as ScriptInput | null)?.format);

async function angleFor(userId: string, productId: string, slot: number) {
  const approved = await approvedAngles(userId, productId);
  if (!approved) throw new OptimizeError("Aprueba los desarrollos de tus ángulos para hacer videos.", 409);
  const found = approved.find((a) => a.angle.slot === slot);
  if (!found) throw new OptimizeError("Ese ángulo ya no está aprobado. Actualiza la página.", 409);
  return found;
}

/** «Escribir guion» de un ángulo, en el formato elegido. Reemplaza el guion anterior del ángulo (sus tomas se borran). */
export async function startScript(userId: string, productId: string, slot: number, format: VideoFormat = "ugc"): Promise<{ script: ScriptRow; created: boolean }> {
  await requireHiggsfield(userId);
  const angle = await angleFor(userId, productId, slot);
  const [brief, avatars, pricing, labels] = await Promise.all([latestBrief(userId, productId), latestAvatars(userId, [productId]), getPricingPlan(userId, productId), latestPackLabels(userId, productId)]);
  const avatar = avatars.get(productId);
  if (!avatar || avatar.status !== "approved" || !brief || !pricing) throw new OptimizeError("Aprueba tu cliente ideal y guarda el precio en Información base.", 409);

  const db = adminClient();
  const current = (await activeScripts(userId, productId)).find((s) => s.angle_slot === slot);
  if (current && (current.status === "queued" || current.status === "running")) return { script: current, created: false };

  const { count, error: countError } = await db.from("video_scripts").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since24h());
  fail("Contar los guiones", countError);
  if ((count ?? 0) >= DAILY_SCRIPTS) throw new OptimizeError(`Llegaste al máximo de ${DAILY_SCRIPTS} guiones en 24 horas. Vuelve mañana.`, 429);

  if (current) {
    const now = stamp();
    fail("Reemplazar el guion anterior", (await db.from("video_scripts").update({ superseded_at: now, updated_at: now }).eq("id", current.id)).error);
    fail("Reemplazar las tomas anteriores", (await db.from("video_shots").update({ superseded_at: now, updated_at: now }).eq("script_id", current.id).is("superseded_at", null)).error);
  }
  const { market } = await getMarket(userId, await getShopifyConnection(userId));
  const input: ScriptInput = {
    market,
    pricing: pricing as PricingPlan,
    labels: labels?.status === "approved" ? labels.payload : null,
    avatar_id: avatar.id,
    brief_id: angle.brief.id,
    brief_edited_at: angle.brief.edited_at,
    angle_name: testAngleName(angle.angle),
    format,
  };
  const { data, error } = await db.from("video_scripts").insert({ product_id: productId, user_id: userId, angle_slot: slot, status: "queued", input }).select("*").single();
  if (error?.code === "23505") {
    const again = (await activeScripts(userId, productId)).find((s) => s.angle_slot === slot);
    if (again) return { script: again, created: false };
  }
  fail("Crear el guion", error);
  await purgeSupersededVideos(userId).catch((e) => console.error("[video] borrar lo reemplazado", e));
  return { script: data as ScriptRow, created: true };
}

/** Escribe el guion. Pensada para `after()`: nunca lanza; deja el resultado en la fila. */
export async function runScript(scriptId: string): Promise<void> {
  const db = adminClient();
  const claimed = await db.from("video_scripts").update({ status: "running", started_at: stamp(), updated_at: stamp() }).eq("id", scriptId).eq("status", "queued").select("*").maybeSingle();
  if (claimed.error || !claimed.data) return;
  const s = claimed.data as ScriptRow & { input: ScriptInput };
  const format = scriptFormat(s);
  const detail = `${s.input.angle_name || `Ángulo ${s.angle_slot}`}${format === "mascot" ? " · mascota" : ""}`;
  try {
    const input = s.input;
    const [brief, avatarRow, angles, differentiator, base] = await Promise.all([
      latestBrief(s.user_id, s.product_id),
      db.from("customer_avatars").select("payload").eq("user_id", s.user_id).eq("id", input.avatar_id).single(),
      anglesForPrompt(s.user_id, [input.brief_id]),
      getDifferentiator(s.user_id, s.product_id),
      baseImage(s.user_id, s.product_id),
    ]);
    fail("Leer el cliente ideal", avatarRow.error);
    if (!brief || !avatarRow.data || !angles?.[0]) throw new AiStepError("not_found", "Cambió algo en Ángulos. Vuelve a aprobar los desarrollos y reintenta.");
    if (!base) throw new AiStepError("no_image", "El producto no tiene una imagen base. Elige una en Información base.");
    const image = await imageBlock(base.url).catch(() => null);
    if (!image) throw new AiStepError("no_image", "No pudimos leer la imagen base del producto. Revísala en Información base.");

    const ctx: UgcContext = {
      brief,
      avatar: avatarRow.data.payload as CustomerAvatar,
      differentiator: differentiator.value,
      pricing: input.pricing,
      labels: input.labels ?? undefined,
      angle: angles[0],
    };
    let problems: string[] = [];
    let result: Awaited<ReturnType<typeof generateStructured<typeof ugcScriptSchema>>> | null = null;
    for (let attempt = 0; attempt < SCRIPT_ATTEMPTS; attempt++) {
      result = await generateStructured({
        system: scriptSystem(format, input.market),
        // La foto y el contexto con punto de caché: un reintento (hasta 3) los lee a 0,1×.
        content: retryableContent([image], ugcContextText(ctx), ugcTail(problems, format)),
        schema: ugcScriptSchema,
        effort: "medium",
        maxTokens: 16000,
      });
      problems = scriptProblems(result.data, input.pricing, format);
      await recordAiGeneration({ userId: s.user_id, productId: s.product_id, step: "ugc_script", detail, usage: result.usage, error: problems.length ? "invalid_script" : null, problems });
      if (!problems.length) break;
      console.warn("[video] guion inválido", problems);
    }
    if (problems.length || !result) throw new AiStepError("invalid_output", "La IA escribió un guion que no cumple las reglas. Toca Reintentar.", undefined, true);
    const now = stamp();
    fail(
      "Guardar el guion",
      (
        await db
          .from("video_scripts")
          .update({ status: "succeeded", payload: result.data, prompt_version: format === "mascot" ? MASCOT_PROMPT_VERSION : UGC_PROMPT_VERSION, model: result.usage.model, finished_at: now, updated_at: now })
          .eq("id", s.id)
      ).error,
    );
  } catch (e) {
    const known = e instanceof AiStepError;
    if (!known) console.error("[video] guion", e);
    if (known && !e.logged) await recordAiGeneration({ userId: s.user_id, productId: s.product_id, step: "ugc_script", detail, usage: e.usage, error: e.code });
    const now = stamp();
    const { error } = await db
      .from("video_scripts")
      .update({ status: "failed", error_code: known ? e.code : "unexpected", error_message: known ? e.message : "No pudimos escribir el guion. Toca Reintentar.", finished_at: now, updated_at: now })
      .eq("id", s.id);
    if (error) console.error("[video] guardar la falla", error.message);
  }
}

async function readyScript(userId: string, productId: string, scriptId: string): Promise<ScriptRow & { payload: UgcScript }> {
  const s = await getScriptRow(userId, productId, scriptId);
  if (!s) throw new OptimizeError("Ese guion ya no está vigente. Actualiza la página.", 409);
  if (s.status !== "succeeded" || !s.payload) throw new OptimizeError("El guion todavía no está listo.", 409);
  return s as ScriptRow & { payload: UgcScript };
}

/** Cambia líneas, entregas y textos. Las tomas habladas que cambian se vuelven a generar. */
export async function editScript(userId: string, productId: string, scriptId: string, body: unknown): Promise<void> {
  const parsed = scriptEditSchema.safeParse(body);
  if (!parsed.success) throw new OptimizeError("Revisa el guion: cada línea y cada texto con contenido y dentro de su largo.", 400);
  const s = await readyScript(userId, productId, scriptId);
  const pricing = await getPricingPlan(userId, productId);
  if (!pricing) throw new OptimizeError("Guarda el precio en Información base.", 409);
  const next = applyScriptEdit(s.payload, parsed.data);
  const problems = scriptProblems(next, pricing as PricingPlan, scriptFormat(s));
  if (problems.length) throw new OptimizeError(problems[0], 400);
  const db = adminClient();
  const now = stamp();
  const changed = changedLines(s.payload, next);
  if (changed.length) fail("Reemplazar las tomas cambiadas", (await db.from("video_shots").update({ superseded_at: now, updated_at: now }).eq("script_id", s.id).in("key", changed).is("superseded_at", null)).error);
  fail("Guardar el guion", (await db.from("video_scripts").update({ payload: next, edited_at: now, updated_at: now }).eq("id", s.id)).error);
}

export async function approveScript(userId: string, productId: string, scriptId: string, approve: boolean): Promise<void> {
  const s = await readyScript(userId, productId, scriptId);
  const now = stamp();
  fail("Guardar tu decisión", (await adminClient().from("video_scripts").update({ approved_at: approve ? now : null, updated_at: now }).eq("id", s.id)).error);
}

// ---------------------------------------------------------------- 2 y 3. Tomas

function requestFor(script: UgcScript, key: string, language: string, format: VideoFormat): { kind: ShotKind; req: ShotRequest } {
  const kf = script.keyframes.find((k) => k.key === key);
  if (kf) return { kind: "keyframe", req: keyframeRequest(kf, script, CHARACTER_KEY, format) };
  const a = script.a_roll.find((x) => x.key === key);
  if (a) return { kind: "a_roll", req: aRollRequest(a, language, Boolean(script.keyframes.find((k) => k.key === a.keyframe)?.uses_product), format) };
  const b = script.b_roll.find((x) => x.key === key);
  if (b) return { kind: "b_roll", req: bRollRequest(b, Boolean(script.keyframes.find((k) => k.key === b.keyframe)?.uses_product), format) };
  throw new OptimizeError(`La toma ${key} no está en el guion.`, 409);
}

async function insertShot(s: ScriptRow & { payload: UgcScript }, key: string, attempt: number): Promise<ShotRow> {
  const language = ((s.input as ScriptInput).market?.language ?? "es") as string;
  const { kind, req } = requestFor(s.payload, key, language, scriptFormat(s));
  const { data, error } = await adminClient()
    .from("video_shots")
    .insert({ script_id: s.id, product_id: s.product_id, user_id: s.user_id, key, kind, attempt, endpoint: req.endpoint, input: req.input, render_status: "queued" })
    .select("*")
    .single();
  fail("Crear la toma", error);
  return data as ShotRow;
}

async function dailyShots(userId: string, kinds: ShotKind[]): Promise<number> {
  const { count, error } = await adminClient().from("video_shots").select("id", { count: "exact", head: true }).eq("user_id", userId).in("kind", kinds).gte("created_at", since24h());
  fail("Contar las tomas", error);
  return count ?? 0;
}

/** Las claves que faltan: sin toma vigente, o con la última fallida o descartada. */
function missingKeys(keys: string[], shots: ShotRow[]): string[] {
  const latest = latestByKey(shots);
  return keys.filter((k) => {
    const s = latest.get(k);
    return !s || s.render_status === "failed" || s.status === "rejected";
  });
}

/** «Generar imágenes clave»: crea las que faltan (K1 primero; las demás esperan su cara). */
export async function startKeyframes(userId: string, productId: string, scriptId: string): Promise<string[]> {
  await requireHiggsfield(userId);
  const s = await readyScript(userId, productId, scriptId);
  if (!s.approved_at) throw new OptimizeError("Aprueba el guion antes de generar las imágenes.", 409);
  const keys = missingKeys(s.payload.keyframes.map((k) => k.key), await shotsFor(userId, [s.id]));
  if (!keys.length) return [];
  if ((await dailyShots(userId, ["keyframe"])) + keys.length > DAILY_KEYFRAMES) throw new OptimizeError(`Llegaste al máximo de ${DAILY_KEYFRAMES} imágenes clave en 24 horas. Vuelve mañana.`, 429);
  return supersedeAndInsert(s, keys);
}

/** «Generar clips»: con todas las imágenes clave aprobadas, crea las tomas habladas y los B-roll que faltan. */
export async function startClips(userId: string, productId: string, scriptId: string): Promise<string[]> {
  await requireHiggsfield(userId);
  const s = await readyScript(userId, productId, scriptId);
  const shots = await shotsFor(userId, [s.id]);
  const latest = [...latestByKey(shots).values()];
  const step = videoStep(s, latest.filter((x) => x.kind === "keyframe"), latest.filter((x) => x.kind !== "keyframe"));
  if (step === "script" || step === "keyframes") throw new OptimizeError("Aprueba todas las imágenes clave antes de generar los clips.", 409);
  const keys = missingKeys([...s.payload.a_roll.map((a) => a.key), ...s.payload.b_roll.map((b) => b.key)], shots);
  if (!keys.length) return [];
  if ((await dailyShots(userId, ["a_roll", "b_roll"])) + keys.length > DAILY_CLIPS) throw new OptimizeError(`Llegaste al máximo de ${DAILY_CLIPS} clips en 24 horas. Vuelve mañana.`, 429);
  return supersedeAndInsert(s, keys);
}

async function supersedeAndInsert(s: ScriptRow & { payload: UgcScript }, keys: string[]): Promise<string[]> {
  const now = stamp();
  // Los intentos fallidos o descartados de esas claves se reemplazan (se borran en la próxima pasada).
  fail("Reemplazar los intentos anteriores", (await adminClient().from("video_shots").update({ superseded_at: now, updated_at: now }).eq("script_id", s.id).in("key", keys).is("superseded_at", null)).error);
  const shots = await Promise.all(keys.map((k) => insertShot(s, k, 1)));
  return shots.map((x) => x.id);
}

/** «Generar de nuevo» u «Otra» de una toma suelta: un intento nuevo que reemplaza al anterior. */
export async function regenerateShot(userId: string, productId: string, shotId: string): Promise<string> {
  await requireHiggsfield(userId);
  const old = await getShotRow(userId, shotId);
  if (!old || old.product_id !== productId || old.superseded_at) throw new OptimizeError("Esa toma ya no está vigente. Actualiza la página.", 409);
  if (old.render_status === "queued" || old.render_status === "running") throw new OptimizeError("Esa toma todavía se está generando.", 409);
  const kinds: ShotKind[] = old.kind === "keyframe" ? ["keyframe"] : ["a_roll", "b_roll"];
  const cap = old.kind === "keyframe" ? DAILY_KEYFRAMES : DAILY_CLIPS;
  if ((await dailyShots(userId, kinds)) >= cap) throw new OptimizeError(`Llegaste al máximo de ${cap} ${old.kind === "keyframe" ? "imágenes clave" : "clips"} en 24 horas. Vuelve mañana.`, 429);
  const s = await readyScript(userId, productId, old.script_id);
  const now = stamp();
  fail("Reemplazar la toma", (await adminClient().from("video_shots").update({ superseded_at: now, updated_at: now }).eq("id", old.id)).error);
  return (await insertShot(s, old.key, old.attempt + 1)).id;
}

export type KeyframeDecision = "approve" | "reject" | "reopen";

export async function decideKeyframe(userId: string, productId: string, shotId: string, action: KeyframeDecision): Promise<void> {
  const s = await getShotRow(userId, shotId);
  if (!s || s.product_id !== productId || s.superseded_at) throw new OptimizeError("Esa imagen ya no está vigente. Actualiza la página.", 409);
  if (s.kind !== "keyframe" || s.render_status !== "succeeded") throw new OptimizeError("Esa imagen todavía no está lista.", 409);
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "in_review";
  fail("Guardar tu decisión", (await adminClient().from("video_shots").update({ status, updated_at: stamp() }).eq("id", s.id)).error);
}

/** «Aprobar todas»: las imágenes clave listas que no se descartaron. */
export async function approveAllKeyframes(userId: string, productId: string, scriptId: string): Promise<void> {
  const s = await readyScript(userId, productId, scriptId);
  const ids = [...latestByKey(await shotsFor(userId, [s.id])).values()].filter((x) => x.kind === "keyframe" && x.render_status === "succeeded" && x.status !== "rejected").map((x) => x.id);
  if (ids.length) fail("Guardar tu decisión", (await adminClient().from("video_shots").update({ status: "approved", updated_at: stamp() }).in("id", ids)).error);
}

/** Toma la toma si nadie la tocó en LEASE_MS (evita que el sondeo y el proceso la dupliquen). */
async function lease(shotId: string, statuses: ShotRow["render_status"][], force = false): Promise<ShotRow | null> {
  let q = adminClient().from("video_shots").update({ updated_at: stamp() }).eq("id", shotId).in("render_status", statuses).is("superseded_at", null);
  if (!force) q = q.lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString());
  const { data, error } = await q.select("*").maybeSingle();
  if (error) console.error("[video] tomar la toma", error.message);
  return (data as ShotRow | null) ?? null;
}

async function patchShot(id: string, patch: Record<string, unknown>) {
  fail("Guardar la toma", (await adminClient().from("video_shots").update({ ...patch, updated_at: stamp() }).eq("id", id)).error);
}

async function storedBytes(path: string): Promise<Buffer> {
  const file = await adminClient().storage.from(CREATIVES_BUCKET).download(path);
  fail("Leer la imagen clave", file.error);
  return Buffer.from(await file.data!.arrayBuffer());
}

/** La imagen clave lista (y, para los clips, aprobada) de una clave del guion. */
async function keyframeShot(scriptId: string, userId: string, key: string, approvedOnly: boolean): Promise<ShotRow | null> {
  const s = latestByKey(await shotsFor(userId, [scriptId])).get(key);
  if (!s || s.render_status !== "succeeded" || !s.storage_path) return null;
  if (approvedOnly && s.status !== "approved") return null;
  return s;
}

/** No se puede enviar todavía (falta la cara o la imagen clave): vuelve a la cola sin error. */
class NotReady extends Error {}

/** Arma las referencias y envía la toma a Higgsfield. */
async function submitShot(key: string, s: ShotRow, script: ScriptRow & { payload: UgcScript }): Promise<string> {
  const input = { ...s.input };
  if (s.kind === "keyframe") {
    const def = script.payload.keyframes.find((k) => k.key === s.key)!;
    const refs: string[] = [];
    for (const r of keyframeRefs(def, CHARACTER_KEY)) {
      if (r === "character") {
        const k1 = await keyframeShot(script.id, s.user_id, CHARACTER_KEY, false);
        if (!k1) throw new NotReady();
        refs.push(await uploadImage(key, await toJpeg(await storedBytes(k1.storage_path!), 2048), "image/jpeg"));
      } else {
        const base = await baseImage(s.user_id, s.product_id);
        if (!base) throw new HiggsfieldError("bad_request", "El producto no tiene una imagen base. Elige una en Información base.");
        refs.push(await uploadImage(key, await toJpeg(await download(base.url), 2048), "image/jpeg"));
      }
    }
    if (refs.length) input.image_urls = refs;
  } else {
    const def = s.kind === "a_roll" ? script.payload.a_roll.find((a) => a.key === s.key) : script.payload.b_roll.find((b) => b.key === s.key);
    const kf = def ? await keyframeShot(script.id, s.user_id, def.keyframe, true) : null;
    if (!kf) throw new NotReady();
    input.image_url = await uploadImage(key, await toJpeg(await storedBytes(kf.storage_path!), 2048), "image/jpeg");
  }
  return (await submit(key, s.endpoint, input)).requestId;
}

/**
 * Envía la toma a Higgsfield y espera el resultado (con tope: si no alcanza, el sondeo de la pantalla
 * la termina). Pensada para `after()`: nunca lanza.
 */
export async function processShot(shotId: string, force = false): Promise<void> {
  const s = await lease(shotId, ["queued"], force);
  if (!s) return;
  const started = Date.now();
  let submitted = false;
  try {
    const key = await higgsfieldKey(s.user_id);
    if (!key) throw new HiggsfieldError("invalid_key", "Conecta tu cuenta de Higgsfield en Ajustes y genera de nuevo.");
    const script = await readyScript(s.user_id, s.product_id, s.script_id);
    const requestId = await submitShot(key, s, script);
    await patchShot(s.id, { render_status: "running", hf_request_id: requestId, submitted_at: stamp(), error_code: null, error_message: null });
    submitted = true;
    await pollUntilDone({ ...s, hf_request_id: requestId, render_status: "running" }, key, started);
  } catch (e) {
    if (e instanceof NotReady) return; // el sondeo la vuelve a intentar cuando su referencia esté lista
    await onHiggsfieldError(s.user_id, e);
    if (e instanceof HiggsfieldError && e.code === "busy") {
      await patchShot(s.id, { render_status: "queued", error_code: "busy", error_message: e.message });
      return;
    }
    if (submitted && e instanceof HiggsfieldError && (e.code === "network" || e.code === "unavailable")) {
      console.error("[video] se sigue con el sondeo", e.message);
      return;
    }
    const known = e instanceof HiggsfieldError || e instanceof OptimizeError;
    if (!known) console.error("[video] toma", e);
    await patchShot(s.id, { render_status: "failed", error_code: e instanceof HiggsfieldError ? e.code : "unexpected", error_message: known ? (e as Error).message : "No pudimos generar la toma. Toca Generar de nuevo.", finished_at: stamp() });
    await logShot(s, false, e instanceof HiggsfieldError ? e.code : "unexpected", Date.now() - started);
  }
}

/** Procesa varias tomas a la vez; las que no tienen cupo quedan en cola para el sondeo. */
export async function processShots(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => processShot(id, true)));
}

async function pollUntilDone(s: ShotRow, key: string, started: number): Promise<void> {
  let wait = s.kind === "keyframe" ? 3000 : 8000;
  while (Date.now() - started < POLL_BUDGET_MS) {
    await sleep(wait);
    wait = Math.min(wait * 1.4, 12000);
    const state = await requestStatus(key, s.hf_request_id!).catch((e) => {
      if (e instanceof HiggsfieldError && (e.code === "network" || e.code === "unavailable")) return null;
      throw e;
    });
    await patchShot(s.id, {});
    if (!state || state.status === "queued" || state.status === "in_progress") continue;
    await finishShot(s, state, started);
    return;
  }
}

function shotCostUsd(s: ShotRow): number {
  if (s.kind === "keyframe") return KEYFRAME_COST_USD;
  if (s.kind === "b_roll") return KLING_TURBO_5S_USD;
  return seedanceCostUsd(Number(s.input.duration ?? 6), s.width ?? undefined, s.height ?? undefined);
}

/** Toda toma de Higgsfield queda registrada con su costo estimado (la API no lo informa). */
async function logShot(s: ShotRow, ok: boolean, error?: string, latencyMs?: number) {
  await recordAiGeneration({
    userId: s.user_id,
    productId: s.product_id,
    step: s.kind === "keyframe" ? "video_keyframe" : "video_clip",
    detail: s.key,
    provider: "higgsfield",
    model: s.endpoint,
    error: ok ? null : (error ?? "failed"),
    estimatedCostUsd: ok ? shotCostUsd(s) : null,
    latencyMs,
  });
}

async function downloadVideo(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(VIDEO_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`descargar el clip: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > FINAL_MAX_BYTES) throw new Error(`el clip pesa ${bytes.byteLength} bytes`);
  return bytes;
}

async function finishShot(s: ShotRow, state: RequestState, started: number): Promise<void> {
  const out = s.kind === "keyframe" ? state.images[0] : state.video;
  if (state.status !== "completed" || !out) {
    const message =
      state.status === "nsfw" ? "Higgsfield la rechazó por sus reglas de contenido. Cambia la escena o la línea y genera de nuevo." : "Higgsfield no pudo generarla. Toca Generar de nuevo.";
    await patchShot(s.id, { render_status: "failed", error_code: state.status, error_message: message, finished_at: stamp() });
    await logShot(s, false, state.status, Date.now() - started);
    return;
  }
  if (s.kind === "keyframe") return storeKeyframe(s, await download(out), () => logShot(s, true, undefined, Date.now() - started));
  const bytes = await downloadVideo(out);
  const path = `${s.user_id}/${s.product_id}/video-${s.id}.mp4`;
  fail("Guardar el clip", (await adminClient().storage.from(CREATIVES_BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true })).error);
  await logShot(s, true, undefined, Date.now() - started);
  await patchShot(s.id, { render_status: "succeeded", storage_path: path, size_bytes: bytes.byteLength, duration_s: Number(s.input.duration ?? 0) || null, finished_at: stamp() });
}

/** La imagen clave: se guarda, pasa el QA y, si falla, un segundo intento. Al terminar K1, siguen las demás. */
async function storeKeyframe(s: ShotRow, bytes: Buffer, log: () => Promise<void>): Promise<void> {
  const img = await optimizeForAds(bytes);
  const path = `${s.user_id}/${s.product_id}/video-${s.id}.${img.ext}`;
  fail("Guardar la imagen clave", (await adminClient().storage.from(CREATIVES_BUCKET).upload(path, img.data, { contentType: img.mime, upsert: true })).error);
  await log();
  const script = await readyScript(s.user_id, s.product_id, s.script_id).catch(() => null);
  const qa = script
    ? await runKeyframeQa(s, script, bytes).catch((e) => {
        console.error("[video] QA", e);
        return null;
      })
    : null;
  await patchShot(s.id, { render_status: "succeeded", storage_path: path, width: img.width, height: img.height, size_bytes: img.data.byteLength, qa, status: "in_review", finished_at: stamp() });
  if (!script) return;
  if (qa && !qa.pass && s.attempt === 1) {
    // Un solo reintento automático: la toma nueva reemplaza a la que falló el QA.
    const now = stamp();
    fail("Reemplazar la imagen", (await adminClient().from("video_shots").update({ superseded_at: now, updated_at: now }).eq("id", s.id)).error);
    const retry = await insertShot(script, s.key, 2);
    await processShot(retry.id, true);
    return;
  }
  if (s.key === CHARACTER_KEY) {
    // Las demás imágenes clave esperaban la cara.
    const waiting = (await shotsFor(s.user_id, [s.script_id])).filter((x) => x.kind === "keyframe" && x.render_status === "queued").map((x) => x.id);
    await processShots(waiting);
  }
}

async function runKeyframeQa(s: ShotRow, script: ScriptRow & { payload: UgcScript }, generated: Buffer): Promise<KeyframeQa> {
  const def = script.payload.keyframes.find((k) => k.key === s.key);
  if (!def) throw new Error("imagen clave fuera del guion");
  const content: Parameters<typeof generateStructured>[0]["content"] = [];
  if (def.uses_product) {
    const base = await baseImage(s.user_id, s.product_id);
    if (base) content.push({ type: "text", text: "Foto real del producto:" }, { ...(await imageBlock(base.url)), cache_control: { type: "ephemeral" } });
  }
  const refsCharacter = def.uses_character && def.key !== CHARACTER_KEY;
  if (refsCharacter) {
    const k1 = await keyframeShot(script.id, s.user_id, CHARACTER_KEY, false);
    if (k1) content.push({ type: "text", text: "Personaje (referencia de la cara):" }, await imageBlockFromBytes(await storedBytes(k1.storage_path!)));
  }
  content.push({ type: "text", text: "Imagen generada:" }, await imageBlockFromBytes(generated), { type: "text", text: keyframeQaUser(def, refsCharacter, scriptFormat(script)) });
  let result;
  try {
    const qa = () => generateStructured({ system: KEYFRAME_QA_SYSTEM, content, schema: keyframeQaSchema, effort: "low", maxTokens: 3000 });
    // Las imágenes clave se revisan juntas (processShots): la primera con el producto escribe su caché.
    result = def.uses_product ? await afterCacheWarm(`video_qa:${s.product_id}`, qa) : await qa();
  } catch (e) {
    if (e instanceof AiStepError) await recordAiGeneration({ userId: s.user_id, productId: s.product_id, step: "video_qa", detail: s.key, usage: e.usage, error: e.code });
    throw e;
  }
  await recordAiGeneration({ userId: s.user_id, productId: s.product_id, step: "video_qa", detail: s.key, usage: result.usage });
  return keyframeQaVerdict(result.data);
}

/** «Recuperar»: una toma que falló después de llegar a Higgsfield se vuelve a consultar sin cobrar. */
export async function recoverShot(userId: string, productId: string, shotId: string): Promise<void> {
  const s = await getShotRow(userId, shotId);
  if (!s || s.product_id !== productId) throw new OptimizeError("No encontramos esa toma.", 404);
  if (!isShotRecoverable(s)) throw new OptimizeError("Esta toma no llegó a generarse en Higgsfield. Toca Generar de nuevo.", 409);
  const now = Date.now();
  const patch = { render_status: "running", error_code: null, error_message: null, finished_at: null, submitted_at: new Date(now).toISOString(), updated_at: new Date(now - LEASE_MS - 1000).toISOString() };
  fail("Recuperar la toma", (await adminClient().from("video_shots").update(patch).eq("id", s.id).eq("render_status", "failed")).error);
}

/** El sondeo de la pantalla: termina las tomas que el proceso en segundo plano dejó esperando. */
export async function syncVideos(userId: string, productId: string): Promise<void> {
  const { data, error } = await adminClient()
    .from("video_shots")
    .select("id, render_status, hf_request_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .is("superseded_at", null)
    .in("render_status", ["queued", "running"])
    .lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString());
  if (error) return console.error("[video] sincronizar", error.message);
  const key = await higgsfieldKey(userId);
  if (!key) return;
  await Promise.all(
    ((data ?? []) as Pick<ShotRow, "id" | "render_status" | "hf_request_id">[]).map(async (row) => {
      try {
        if (row.render_status === "queued") return processShot(row.id);
        const s = await lease(row.id, ["running"]);
        if (!s?.hf_request_id) return;
        const state = await requestStatus(key, s.hf_request_id);
        if (state.status === "queued" || state.status === "in_progress") return;
        await finishShot(s, state, Date.parse(s.submitted_at ?? s.created_at));
      } catch (e) {
        await onHiggsfieldError(userId, e);
        console.error("[video] sincronizar la toma", row.id, e);
      }
    }),
  );
}

// ---------------------------------------------------------------- 4. Paquete de montaje

export async function montagePackage(userId: string, productId: string, scriptId: string): Promise<MontagePackage> {
  const s = await readyScript(userId, productId, scriptId);
  const shots = [...latestByKey(await shotsFor(userId, [s.id])).values()];
  const step = videoStep(s, shots.filter((x) => x.kind === "keyframe"), shots.filter((x) => x.kind !== "keyframe"));
  if (step !== "montage" && step !== "final") throw new OptimizeError("Faltan clips por generar.", 409);
  const clips = shots.filter((x) => x.kind !== "keyframe" && x.render_status === "succeeded" && x.storage_path);
  const db = adminClient();
  const signed = await db.storage.from(CREATIVES_BUCKET).createSignedUrls(clips.map((c) => c.storage_path!), PACKAGE_TTL_S);
  fail("Firmar los clips", signed.error);
  const clipUrls = new Map<string, string>();
  clips.forEach((c, i) => signed.data?.[i]?.signedUrl && clipUrls.set(c.key, signed.data[i].signedUrl));
  const [product, base] = await Promise.all([db.from("products").select("title, page_accent_color").eq("id", productId).eq("user_id", userId).single(), baseImage(userId, productId)]);
  fail("Leer el producto", product.error);
  let endCardImageUrl = base?.url ?? "";
  if (base?.storagePath) {
    const long = await db.storage.from(REFERENCES_BUCKET).createSignedUrl(base.storagePath, PACKAGE_TTL_S);
    if (long.data) endCardImageUrl = long.data.signedUrl;
  }
  const input = s.input as ScriptInput;
  try {
    return buildPackage({
      product: { id: productId, title: (product.data?.title as string) ?? "" },
      angle: { slot: s.angle_slot, title: input.angle_name ?? "" },
      language: input.market?.language ?? "es",
      accentColor: (product.data?.page_accent_color as string | null) ?? null,
      format: scriptFormat(s),
      script: s.payload,
      clipUrls,
      endCardImageUrl,
      expiresAt: new Date(Date.now() + PACKAGE_TTL_S * 1000).toISOString(),
    });
  } catch (e) {
    if (e instanceof PackageNotReady) throw new OptimizeError(e.message, 409);
    throw e;
  }
}

// ---------------------------------------------------------------- 5. Video final

export async function prepareFinalUpload(userId: string, productId: string, scriptId: string, file: { type?: string; size?: number }) {
  const s = await readyScript(userId, productId, scriptId);
  if (file.type !== "video/mp4") throw new OptimizeError("Sube el video en MP4.", 415);
  if (!file.size || file.size > FINAL_MAX_BYTES) throw new OptimizeError("El video pesa más de 100 MB. Usa la salida del script de montaje.", 413);
  const path = `${userId}/${productId}/video-final-${s.id}-${randomUUID().slice(0, 8)}.mp4`;
  const { data, error } = await adminClient().storage.from(CREATIVES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Preparar la subida: ${error?.message ?? "sin URL"}`);
  return { path, uploadUrl: data.signedUrl };
}

export async function confirmFinal(userId: string, productId: string, scriptId: string, body: { path?: string; width?: number; height?: number; durationS?: number | null }): Promise<void> {
  const s = await readyScript(userId, productId, scriptId);
  const path = String(body.path ?? "");
  if (!path.startsWith(`${userId}/${productId}/video-final-${s.id}-`) || path.includes("..")) throw new OptimizeError("Esa subida no es de este video.", 400);
  const db = adminClient();
  const drop = async (msg: string, status = 415): Promise<never> => {
    await db.storage.from(CREATIVES_BUCKET).remove([path]);
    throw new OptimizeError(msg, status);
  };
  const signed = await db.storage.from(CREATIVES_BUCKET).createSignedUrl(path, 60);
  if (signed.error || !signed.data) throw new OptimizeError("No encontramos el video subido. Súbelo de nuevo.", 404);
  const head = await fetch(signed.data.signedUrl, { headers: { Range: "bytes=0-63" }, signal: AbortSignal.timeout(15_000) });
  if (!head.ok) throw new OptimizeError("No encontramos el video subido. Súbelo de nuevo.", 404);
  const size = Number(head.headers.get("content-range")?.split("/")[1] ?? head.headers.get("content-length") ?? 0);
  const kind = sniffMedia(new Uint8Array(await head.arrayBuffer()));
  if (kind?.mime !== "video/mp4") return drop("El archivo no es un video MP4.");
  if (size > FINAL_MAX_BYTES) return drop("El video pesa más de 100 MB.", 413);
  const width = Math.round(Number(body.width));
  const height = Math.round(Number(body.height));
  if (ratioOf(width, height) !== "9:16") return drop("El video tiene que ser vertical 9:16.", 422);
  const duration = Number(body.durationS);
  if (!Number.isFinite(duration) || duration < FINAL_SECONDS_MIN || duration > FINAL_SECONDS_MAX) return drop(`El video tiene que durar entre ${FINAL_SECONDS_MIN} y ${FINAL_SECONDS_MAX} segundos.`, 422);

  // El video anterior se reemplaza (su copia en Anuncios sale, salvo que ya esté en Meta).
  if (s.ad_media_id) await removeAdCopies([s.ad_media_id]);
  if (s.final_storage_path && s.final_storage_path !== path) await db.storage.from(CREATIVES_BUCKET).remove([s.final_storage_path]);
  const now = stamp();
  fail(
    "Guardar el video",
    (
      await db
        .from("video_scripts")
        .update({ final_storage_path: path, final_width: width, final_height: height, final_duration_s: duration, final_size_bytes: size, final_status: "in_review", final_decided_at: null, ad_media_id: null, updated_at: now })
        .eq("id", s.id)
    ).error,
  );
}

export type FinalDecision = "approve" | "reject" | "reopen";

/** Aprobar copia el video a Anuncios; descartarlo lo borra (y su copia, salvo que ya esté en Meta). */
export async function decideFinal(userId: string, productId: string, scriptId: string, action: FinalDecision): Promise<void> {
  const s = await readyScript(userId, productId, scriptId);
  if (!s.final_storage_path) throw new OptimizeError("Primero sube el video montado.", 409);
  const db = adminClient();
  const now = stamp();
  if (action === "approve") {
    const adMediaId = s.ad_media_id ?? (await copyFinalToAds(s));
    fail("Guardar tu decisión", (await db.from("video_scripts").update({ final_status: "approved", final_decided_at: now, ad_media_id: adMediaId, updated_at: now }).eq("id", s.id)).error);
    return;
  }
  let adMediaId = s.ad_media_id;
  if (adMediaId && (await removeAdCopies([adMediaId])).has(adMediaId)) adMediaId = null;
  if (action === "reopen") {
    fail("Guardar tu decisión", (await db.from("video_scripts").update({ final_status: "in_review", final_decided_at: null, ad_media_id: adMediaId, updated_at: now }).eq("id", s.id)).error);
    return;
  }
  fail("Borrar el video", (await db.storage.from(CREATIVES_BUCKET).remove([s.final_storage_path])).error);
  fail(
    "Guardar tu decisión",
    (
      await db
        .from("video_scripts")
        .update({ final_storage_path: null, final_width: null, final_height: null, final_duration_s: null, final_size_bytes: null, final_status: null, final_decided_at: now, ad_media_id: adMediaId, updated_at: now })
        .eq("id", s.id)
    ).error,
  );
}

async function copyFinalToAds(s: ScriptRow): Promise<string> {
  const db = adminClient();
  const bytes = await storedBytes(s.final_storage_path!);
  const path = `${s.user_id}/${s.product_id}/video-ugc-${s.id}.mp4`;
  fail("Copiar a Anuncios", (await db.storage.from(AD_MEDIA_BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true })).error);
  const angleName = (s.input as ScriptInput).angle_name;
  const { data: last } = await db.from("ad_media").select("position").eq("product_id", s.product_id).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db
    .from("ad_media")
    .insert({
      user_id: s.user_id,
      product_id: s.product_id,
      kind: "video",
      name: `${scriptFormat(s) === "mascot" ? "Video mascota" : "Video UGC"} · ${angleName || `Ángulo ${s.angle_slot}`}`.slice(0, 120),
      storage_path: path,
      mime_type: "video/mp4",
      width: s.final_width,
      height: s.final_height,
      ratio: "9:16",
      duration_s: s.final_duration_s,
      size_bytes: bytes.byteLength,
      position: ((last?.position as number | undefined) ?? -1) + 1,
      status: "ready",
      angle_slot: s.angle_slot as AngleSlot,
    })
    .select("id")
    .single();
  fail("Agregar a Anuncios", error);
  return (data as { id: string }).id;
}
