import "server-only";
import { contextAccess, contextDatabaseError } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { checkArtifact } from "@/lib/product-intelligence/policy";
import { randomUUID } from "node:crypto";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { afterCacheWarm } from "@/lib/ai/cache-gate";
import { failure, recordAiGeneration } from "@/lib/ai/track";
import { type PackLabel } from "@/lib/ai/schemas";
import { type AngleSlot } from "@/lib/angles/catalog";
import { fail } from "@/lib/products/database";
import { AD_MEDIA_BUCKET, CREATIVES_BUCKET, removeAdCopies } from "@/lib/creatives/store";
import { ratioOf, sniffMedia } from "@/lib/ads/media";
import { adminClient } from "@/lib/integrations/admin";
import { HiggsfieldError, requestStatus, submit, uploadImage, type RequestState } from "@/lib/integrations/higgsfield/client";
import { failedMessage } from "@/lib/integrations/higgsfield/failure";
import { higgsfieldKey, markHiggsfieldInvalid } from "@/lib/integrations/higgsfield/connection";
import { shopifyQuery } from "@/lib/integrations/shopify/client";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { SHOP_DOMAIN_QUERY, type ShopDomainQuery } from "@/lib/integrations/shopify/queries";
import type { Market } from "@/lib/market";
import { optimizeForAds } from "@/lib/media/optimize";
import type { PricingPlan } from "@/lib/pricing/plan";
import { imageQaEnabled, imagesForGeneration, listImageRows } from "@/lib/products/store";
import {
  CHARACTER_KEY,
  DAILY_CLIPS,
  DAILY_KEYFRAMES,
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
import { PackageNotReady, buildPackage, watermarkText, type MontagePackage } from "@/lib/video/package";
import { KEYFRAME_QA_SYSTEM, keyframeQaUser } from "@/lib/video/prompts";
import { aRollRequest, bRollRequest, keyframeRefs, keyframeRequest, type ShotRequest } from "@/lib/video/render";
import {
  keyframeQaSchema,
  firstSentence,
  keyframeQaVerdict,
  type KeyframeQa,
  type UgcScript,
} from "@/lib/video/schemas";
import { getScriptRow, getShotRow, isShotRecoverable, latestByKey, shotsFor, videoStep, type ScriptRow, type ShotRow } from "@/lib/video/store";
import { download, imageBlock, imageBlockFromBytes, toJpeg } from "./images";
import { OptimizeError, requireAiKey } from "./errors";

// Video UGC en Creativos (docs/spec-video-ugc.md). Cada paso en segundo plano (after), como Creativos:
// 1. El chat escribe guion/plan; save_ugc_content los valida y guarda. El comerciante aprueba.
// 2. Las imágenes clave (Flare): K1 define la cara y las demás la usan de referencia; un QA con Claude
//    revisa manos, producto, cara y textos. El comerciante aprueba cada una.
// 3. Los clips: tomas habladas en Seedance 2.0 (voz y labios desde el prompt) y B-roll en Kling.
// 4. El paquete de montaje va al script local (scripts/ugc-montage.py); el video final vuelve por
//    «Subir video montado» y, al aprobarlo, pasa a Anuncios.

const POLL_BUDGET_MS = 200_000;
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
async function baseImage(userId: string, productId: string, frozenId?: string): Promise<{ url: string; storagePath: string | null } | null> {
  const rows = imagesForGeneration(await listImageRows(userId, [productId]));
  const row = frozenId ? rows.find((r) => r.id === frozenId) : rows[0];
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
  /** Producto de belleza o cuidado personal: la persona no muestra el problema (lib/video/render.ts). */
  appearance?: boolean;
};

const scriptFormat = (s: Pick<ScriptRow, "format">) => formatOf(s.format);

async function readyScript(userId: string, productId: string, scriptId: string): Promise<ScriptRow & { payload: UgcScript }> {
  const s = await getScriptRow(userId, productId, scriptId);
  if (!s) throw new OptimizeError("Ese guion ya no está vigente. Actualiza la página.", 409);
  if (s.status !== "succeeded" || !s.payload) throw new OptimizeError("El guion todavía no está listo.", 409);
  return s as ScriptRow & { payload: UgcScript };
}

// ---------------------------------------------------------------- 2 y 3. Tomas

function requestFor(script: UgcScript, key: string, input: ScriptInput, format: VideoFormat): { kind: ShotKind; req: ShotRequest } {
  const language = input.market?.language ?? "es";
  const kfOf = (k: string) => script.keyframes.find((x) => x.key === k);
  const kf = kfOf(key);
  if (kf) return { kind: "keyframe", req: keyframeRequest(kf, script, CHARACTER_KEY, format, { appearance: input.appearance }) };
  const a = script.a_roll.find((x) => x.key === key);
  if (a) return { kind: "a_roll", req: aRollRequest(a, language, Boolean(kfOf(a.keyframe)?.uses_product), format, script.opening) };
  const b = script.b_roll.find((x) => x.key === key);
  if (b) return { kind: "b_roll", req: bRollRequest(b, Boolean(kfOf(b.keyframe)?.uses_product), format, kfOf(b.keyframe)?.camera, script.opening) };
  throw new OptimizeError(`La toma ${key} no está en el guion.`, 409);
}

async function insertShot(s: ScriptRow & { payload: UgcScript }, key: string, attempt: number, operationId?: string | null): Promise<ShotRow> {
  const { kind, req } = requestFor(s.payload, key, s.input as ScriptInput, scriptFormat(s));
  const { data, error } = await adminClient()
    .from("video_shots")
    .insert({ script_id: s.id, product_id: s.product_id, user_id: s.user_id, key, kind, attempt, endpoint: req.endpoint, input: req.input, operation_id: operationId ?? null, render_status: "queued" })
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
  if (await imageQaEnabled(userId, productId)) await requireAiKey(userId);
  await requireHiggsfield(userId);
  const s = await readyScript(userId, productId, scriptId);
  if (s.source === "mcp_chat") throw new OptimizeError("Genera este video con el servicio compartido de UGC.", 409);
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
  if (s.source === "mcp_chat") throw new OptimizeError("Genera este video con el servicio compartido de UGC.", 409);
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
  if (s.source === "mcp_chat") throw new OptimizeError("Reemplaza esta toma con el servicio compartido de UGC.", 409);
  const now = stamp();
  fail("Reemplazar la toma", (await adminClient().from("video_shots").update({ superseded_at: now, updated_at: now }).eq("id", old.id)).error);
  return (await insertShot(s, old.key, old.attempt + 1)).id;
}

export type KeyframeDecision = "approve" | "reject" | "reopen";

export async function decideKeyframe(userId: string, productId: string, shotId: string, action: KeyframeDecision, expectedEtag?: string, shotUpdatedAt?: string): Promise<void> {
  const shot = await getShotRow(userId, shotId);
  if (!shot || shot.product_id !== productId || shot.superseded_at) throw new OptimizeError("Esa imagen ya no está vigente. Actualiza Videos.", 409);
  await reviewKeyframes(userId, productId, shot.script_id, action, expectedEtag, shotId, shotUpdatedAt);
}

export async function approveAllKeyframes(userId: string, productId: string, scriptId: string, expectedEtag?: string): Promise<void> {
  await reviewKeyframes(userId, productId, scriptId, "approve", expectedEtag);
}
async function reviewKeyframes(userId: string, productId: string, scriptId: string, action: KeyframeDecision, expectedEtag?: string, shotId?: string, shotUpdatedAt?: string) {
  const script = await readyScript(userId, productId, scriptId);
  if (script.source === "mcp_chat" && !expectedEtag) throw new OptimizeError("Actualiza Videos antes de decidir.", 409);
  const { error } = await adminClient().rpc("pi_review_ugc_keyframes", { p_access: finalAccess(userId), p_product_id: productId, p_script_id: scriptId,
    p_etag: expectedEtag ?? script.artifact_etag, p_action: action, p_shot_id: shotId ?? null, p_shot_updated_at: shotUpdatedAt ?? null });
  if (error) throw contextDatabaseError(error);
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
  const { data, error } = await adminClient().from("video_shots").update({ ...patch, updated_at: stamp() }).eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    if (typeof patch.storage_path === "string") await adminClient().storage.from(CREATIVES_BUCKET).remove([patch.storage_path]);
    fail("Guardar la toma", error);
    throw new OptimizeError("Esa toma ya no está disponible.", 409);
  }
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
        const base = await baseImage(s.user_id, s.product_id, script.input.base_reference_image_id as string | undefined);
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
async function getShotRowForWorker(id: string): Promise<ShotRow | null> {
  const { data, error } = await adminClient().from("video_shots").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ShotRow | null;
}
export async function processShot(shotId: string, force = false): Promise<void> {
  const row = await getShotRowForWorker(shotId);
  let s: ShotRow | null;
  if (row?.operation_id) {
    const claim = await adminClient().rpc("pi_claim_ugc_shot", { p_shot_id: shotId });
    if (claim.error) { console.error("[video] reclamar operación", claim.error.message); return; }
    s = claim.data as ShotRow | null;
  } else s = await lease(shotId, ["queued"], force);
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
    if (e instanceof NotReady) { if (s.operation_id) await patchShot(s.id, { error_code: null }); return; } // el sondeo la vuelve a intentar cuando su referencia esté lista
    await onHiggsfieldError(s.user_id, e);
    if (e instanceof HiggsfieldError && e.code === "busy") {
      await patchShot(s.id, { render_status: "queued", error_code: "busy", error_message: e.message });
      return;
    }
    if (submitted && e instanceof HiggsfieldError && (e.code === "network" || e.code === "unavailable")) {
      console.error("[video] se sigue con el sondeo", e.message);
      return;
    }
    if (s.operation_id && !submitted && (e instanceof HiggsfieldError && ["network", "unavailable"].includes(e.code) || !(e instanceof HiggsfieldError || e instanceof OptimizeError))) {
      await patchShot(s.id, { render_status: "failed", error_code: "dispatch_unknown", error_message: "No pudimos confirmar si Higgsfield recibió la toma. Revisa el trabajo en Higgsfield antes de volver a generar.", finished_at: stamp() });
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
async function logShot(s: ShotRow, ok: boolean, error?: string, latencyMs?: number, detail?: string | null) {
  await recordAiGeneration({
    userId: s.user_id,
    productId: s.product_id,
    step: s.kind === "keyframe" ? "video_keyframe" : "video_clip",
    detail: s.key,
    provider: "higgsfield",
    model: s.endpoint,
    error: ok ? null : (error ?? "failed"),
    problems: detail ? [detail] : null,
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
    const message = failedMessage(state.status, state.error, {
      nsfw: "Higgsfield la rechazó por sus reglas de contenido. Cambia la escena o la línea y genera de nuevo.",
      failed: "Higgsfield no pudo generarla. Toca Generar de nuevo; si vuelve a fallar, cambia la imagen clave o la línea.",
    });
    await patchShot(s.id, { render_status: "failed", error_code: state.status, error_message: message, finished_at: stamp() });
    await logShot(s, false, state.status, Date.now() - started, state.error);
    return;
  }
  if (s.kind === "keyframe") return storeKeyframe(s, await download(out), () => logShot(s, true, undefined, Date.now() - started));
  const bytes = await downloadVideo(out);
  const path = `${s.user_id}/${s.product_id}/video-${s.id}.mp4`;
  fail("Guardar el clip", (await adminClient().storage.from(CREATIVES_BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true })).error);
  await logShot(s, true, undefined, Date.now() - started);
  await patchShot(s.id, { render_status: "succeeded", storage_path: path, size_bytes: bytes.byteLength, duration_s: Number(s.input.duration ?? 0) || null, finished_at: stamp() });
}

/**
 * La imagen clave: se guarda y, si el producto tiene encendida la revisión de imágenes
 * (`products.image_qa`), pasa el QA y, si falla, un segundo intento. Al terminar K1, siguen las demás.
 */
async function storeKeyframe(s: ShotRow, bytes: Buffer, log: () => Promise<void>): Promise<void> {
  const img = await optimizeForAds(bytes);
  const path = `${s.user_id}/${s.product_id}/video-${s.id}.${img.ext}`;
  fail("Guardar la imagen clave", (await adminClient().storage.from(CREATIVES_BUCKET).upload(path, img.data, { contentType: img.mime, upsert: true })).error);
  await log();
  const script = await readyScript(s.user_id, s.product_id, s.script_id).catch(() => null);
  const qa =
    script && (await imageQaEnabled(s.user_id, s.product_id))
      ? await runKeyframeQa(s, script, bytes).catch((e) => {
          console.error("[video] QA", e);
          return null;
        })
      : null;
  await patchShot(s.id, { render_status: "succeeded", storage_path: path, width: img.width, height: img.height, size_bytes: img.data.byteLength, qa, status: "in_review", finished_at: stamp() });
  if (!script) return;
  if (qa && !qa.pass && s.attempt === 1 && script.source !== "mcp_chat") {
    // Un solo reintento automático: la toma nueva reemplaza a la que falló el QA.
    const now = stamp();
    fail("Reemplazar la imagen", (await adminClient().from("video_shots").update({ superseded_at: now, updated_at: now }).eq("id", s.id)).error);
    const retry = await insertShot(script, s.key, 2, s.operation_id);
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
    const base = await baseImage(s.user_id, s.product_id, script.input.base_reference_image_id as string | undefined);
    if (base) content.push({ type: "text", text: "Foto real del producto:" }, { ...(await imageBlock(base.url)), cache_control: { type: "ephemeral" } });
  }
  const refsCharacter = def.uses_character && def.key !== CHARACTER_KEY;
  if (refsCharacter) {
    const k1 = await keyframeShot(script.id, s.user_id, CHARACTER_KEY, false);
    if (k1) content.push({ type: "text", text: "Personaje (referencia de la cara):" }, await imageBlockFromBytes(await storedBytes(k1.storage_path!)));
  }
  const o = script.payload.opening;
  const opening = o && o.keyframe === def.key ? { first_motion: o.first_motion, hook: script.payload.a_roll[0] ? firstSentence(script.payload.a_roll[0].line) : undefined } : null;
  content.push({ type: "text", text: "Imagen generada:" }, await imageBlockFromBytes(generated), { type: "text", text: keyframeQaUser(def, refsCharacter, scriptFormat(script), opening) });
  let result;
  try {
    const qa = () => generateStructured({ userId: s.user_id, system: KEYFRAME_QA_SYSTEM, content, schema: keyframeQaSchema, effort: "low", maxTokens: 3000 });
    // Las imágenes clave se revisan juntas (processShots): la primera con el producto escribe su caché.
    result = def.uses_product ? await afterCacheWarm(`video_qa:${s.product_id}`, qa) : await qa();
  } catch (e) {
    if (e instanceof AiStepError) await recordAiGeneration({ userId: s.user_id, productId: s.product_id, step: "video_qa", detail: s.key, ...failure(e) });
    throw e;
  }
  await recordAiGeneration({ userId: s.user_id, productId: s.product_id, step: "video_qa", detail: s.key, usage: result.usage });
  return keyframeQaVerdict(result.data);
}

/** «Recuperar»: una toma que falló después de llegar a Higgsfield se vuelve a consultar sin cobrar. */
export async function recoverShot(userId: string, productId: string, shotId: string): Promise<void> {
  const s = await getShotRow(userId, shotId);
  if (!s || s.product_id !== productId || s.superseded_at) throw new OptimizeError("No encontramos esa toma vigente.", 404);
  if (!isShotRecoverable(s)) throw new OptimizeError("Esta toma no llegó a generarse en Higgsfield. Toca Generar de nuevo.", 409);
  const now = Date.now();
  const patch = { render_status: "running", error_code: null, error_message: null, finished_at: null, submitted_at: new Date(now).toISOString(), updated_at: new Date(now - LEASE_MS - 1000).toISOString() };
  fail("Recuperar la toma", (await adminClient().from("video_shots").update(patch).eq("id", s.id).eq("render_status", "failed")).error);
}

/** Un timeout de submit exige conciliación explícita; esta acción solo lee al proveedor. */
export async function reconcileShot(userId: string, productId: string, shotId: string, body: { expected_artifact_etag?: string; expected_shot_updated_at?: string; request_id?: string; confirm_not_sent?: boolean }) {
  const requestId = body.request_id?.trim() || null;
  if (requestId && !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new OptimizeError("Revisa el identificador del trabajo en Higgsfield.", 400);
  if (requestId) await requestStatus(await requireHiggsfield(userId), requestId);
  const { error } = await adminClient().rpc("pi_reconcile_ugc_shot", { p_access: finalAccess(userId), p_product_id: productId, p_shot_id: shotId,
    p_etag: body.expected_artifact_etag, p_shot_updated_at: body.expected_shot_updated_at, p_request_id: requestId, p_confirm_not_sent: body.confirm_not_sent === true });
  if (error) throw contextDatabaseError(error);
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

/** La marca de agua del video: el dominio de la tienda. Si Shopify no responde, el nombre guardado al conectar. */
async function storeWatermark(userId: string): Promise<string | null> {
  const conn = await getShopifyConnection(userId);
  if (!conn) return null;
  try {
    const { shop } = await shopifyQuery<ShopDomainQuery>(conn, SHOP_DOMAIN_QUERY);
    return watermarkText(shop.primaryDomain?.host, shop.name);
  } catch (e) {
    console.error("[video] leer el dominio de la tienda", e);
    return watermarkText(null, conn.shop_name);
  }
}

export async function montagePackage(userId: string, productId: string, scriptId: string): Promise<MontagePackage> {
  const s = await readyScript(userId, productId, scriptId);
  if (s.source === "mcp_chat") {
    const { data, error } = await adminClient().rpc("pi_load_ugc", { p_access: finalAccess(userId), p_product_id: productId });
    if (error) throw contextDatabaseError(error);
    checkArtifact(s.provenance?.context_stamp as string, data?.stamp);
  }
  const shots = [...latestByKey(await shotsFor(userId, [s.id])).values()];
  const step = videoStep(s, shots.filter((x) => x.kind === "keyframe"), shots.filter((x) => x.kind !== "keyframe"));
  if (step !== "montage" && step !== "final") throw new OptimizeError("Faltan clips por generar.", 409);
  const clips = shots.filter((x) => x.kind !== "keyframe" && x.render_status === "succeeded" && x.storage_path);
  const db = adminClient();
  const signed = await db.storage.from(CREATIVES_BUCKET).createSignedUrls(clips.map((c) => c.storage_path!), PACKAGE_TTL_S);
  fail("Firmar los clips", signed.error);
  const clipUrls = new Map<string, string>();
  clips.forEach((c, i) => signed.data?.[i]?.signedUrl && clipUrls.set(c.key, signed.data[i].signedUrl));
  const [product, base, watermark] = await Promise.all([
    db.from("products").select("title, page_accent_color").eq("id", productId).eq("user_id", userId).single(),
    baseImage(userId, productId, s.input.base_reference_image_id as string | undefined),
    storeWatermark(userId),
  ]);
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
      executionKey: s.execution_key ?? undefined,
      watermark,
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
  if (!s.approved_at) throw new OptimizeError("Aprueba el guion antes de subir el video.", 409);
  if (file.type !== "video/mp4") throw new OptimizeError("Sube el video en MP4.", 415);
  if (!file.size || file.size > FINAL_MAX_BYTES) throw new OptimizeError("El video pesa más de 100 MB. Usa la salida del script de montaje.", 413);
  const path = `${userId}/${productId}/video-final-${s.id}-${randomUUID().slice(0, 8)}.mp4`;
  const { data, error } = await adminClient().storage.from(CREATIVES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Preparar la subida: ${error?.message ?? "sin URL"}`);
  return { path, uploadUrl: data.signedUrl, artifactEtag: s.artifact_etag };
}

export async function confirmFinal(userId: string, productId: string, scriptId: string, body: { path?: string; width?: number; height?: number; durationS?: number | null; expected_artifact_etag?: string }): Promise<void> {
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

  const claimed = await claimFinal(userId, productId, s, body.expected_artifact_etag);
  try {
  // El video anterior se reemplaza (su copia en Anuncios sale, salvo que ya esté en Meta).
  if (s.ad_media_id) await removeAdCopies([s.ad_media_id]);
  if (s.final_storage_path && s.final_storage_path !== path) await db.storage.from(CREATIVES_BUCKET).remove([s.final_storage_path]);
  await patchFinal(userId, productId, claimed, { final_storage_path: path, final_width: width, final_height: height, final_duration_s: duration, final_size_bytes: size, final_status: "in_review", final_decided_at: null, ad_media_id: null });
  } finally { await releaseFinal(userId, productId, claimed); }

}

export type FinalDecision = "approve" | "reject" | "reopen";

/** Aprobar copia el video a Anuncios; descartarlo lo borra (y su copia, salvo que ya esté en Meta). */
export async function decideFinal(userId: string, productId: string, scriptId: string, action: FinalDecision, expectedEtag?: string): Promise<void> {
  const s = await readyScript(userId, productId, scriptId);
  if (!s.final_storage_path) throw new OptimizeError("Primero sube el video montado.", 409);
  const claimed = await claimFinal(userId, productId, s, expectedEtag, action);
  try {
    if (action === "approve") {
      const adMediaId = s.ad_media_id ?? await copyFinalToAds(s);
      await patchFinal(userId, productId, claimed, { final_status: "approved", final_decided_at: stamp(), ad_media_id: adMediaId });
      return;
    }
    let adMediaId = s.ad_media_id;
    if (adMediaId && (await removeAdCopies([adMediaId])).has(adMediaId)) adMediaId = null;
    if (action === "reopen") {
      await patchFinal(userId, productId, claimed, { final_status: "in_review", final_decided_at: null, ad_media_id: adMediaId });
      return;
    }
    // Se conserva el archivo para Deshacer; se borra al reemplazarlo o eliminar el producto.
    await patchFinal(userId, productId, claimed, { final_status: "rejected", final_decided_at: stamp(), ad_media_id: adMediaId });
  } finally { await releaseFinal(userId, productId, claimed); }
}
type FinalClaim = ScriptRow & { final_operation_id: string };
const finalAccess = (userId: string) => contextAccess({ userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES });
async function claimFinal(userId: string, productId: string, script: ScriptRow, expectedEtag?: string, action = "upload"): Promise<FinalClaim> {
  if (script.source === "mcp_chat" && !expectedEtag) throw new OptimizeError("Actualiza Videos antes de decidir sobre el montaje.", 409);
  checkArtifact(expectedEtag ?? script.artifact_etag, script.artifact_etag);
  const { data, error } = await adminClient().rpc("pi_claim_ugc_final", { p_access: { ...finalAccess(userId), final_action: action }, p_product_id: productId, p_script_id: script.id, p_etag: expectedEtag ?? script.artifact_etag });
  if (error) throw contextDatabaseError(error);
  return data as FinalClaim;
}
async function patchFinal(userId: string, productId: string, script: FinalClaim, patch: Record<string, unknown>) {
  const { error } = await adminClient().rpc("pi_complete_ugc_final", { p_access: finalAccess(userId), p_product_id: productId, p_script_id: script.id, p_token: script.final_operation_id, p_patch: patch });
  if (error) throw contextDatabaseError(error);
}
async function releaseFinal(userId: string, productId: string, script: FinalClaim) {
  // Si el commit ya liberó el token, no altera nada. Un fallo de limpieza queda visible en logs.
  const { data } = await adminClient().from("video_scripts").select("final_operation_id").eq("id", script.id).eq("user_id", userId).maybeSingle();
  if (data?.final_operation_id === script.final_operation_id) await patchFinal(userId, productId, script, {}).catch((e) => console.error("[video] liberar montaje", e));
}

async function copyFinalToAds(s: ScriptRow): Promise<string> {
  const db = adminClient();
  const bytes = await storedBytes(s.final_storage_path!);
  const sourceSuffix = s.final_storage_path!.split("/").pop()!;
  const path = `${s.user_id}/${s.product_id}/video-ugc-${sourceSuffix}`;
  const existing = await db.from("ad_media").select("id").eq("user_id", s.user_id).eq("product_id", s.product_id).eq("storage_path", path).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data.id;
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
      ugc_provenance: { ...s.provenance, script_id: s.id, artifact_etag: s.artifact_etag, execution_key: s.execution_key },
    })
    .select("id")
    .single();
  fail("Agregar a Anuncios", error);
  return (data as { id: string }).id;
}
