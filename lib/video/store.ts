import "server-only";
import type { AngleSlot } from "@/lib/angles/catalog";
import { fail } from "@/lib/angles/store";
import { CREATIVES_BUCKET, signedUrls } from "@/lib/creatives/store";
import { adminClient } from "@/lib/integrations/admin";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { RunStatus, VideoCardView, VideoShotView, VideoStep } from "@/lib/types";
import type { ShotKind } from "./catalog";
import { scriptCost } from "./cost";
import type { KeyframeQa, UgcScript } from "./schemas";

// video_scripts y video_shots (docs/spec-video-ugc.md §6): lecturas de la pestaña Videos y su paso a
// la pantalla. Siempre con service_role filtrando por el dueño (como lib/creatives/store.ts).

const SCRIPT_RUNNING_STALE_MS = 10 * 60 * 1000;
const SCRIPT_QUEUED_STALE_MS = 3 * 60 * 1000;
/** Una toma en cola puede esperar a que Higgsfield libere un cupo; Seedance tarda 3–6 min. */
const SHOT_QUEUED_STALE_MS = 40 * 60 * 1000;
const SHOT_RUNNING_STALE_MS = 25 * 60 * 1000;

export interface ScriptRow {
  id: string;
  product_id: string;
  user_id: string;
  angle_slot: AngleSlot;
  status: RunStatus;
  error_code: string | null;
  error_message: string | null;
  payload: UgcScript | null;
  input: Record<string, unknown>;
  approved_at: string | null;
  edited_at: string | null;
  superseded_at: string | null;
  final_storage_path: string | null;
  final_width: number | null;
  final_height: number | null;
  final_duration_s: number | null;
  final_size_bytes: number | null;
  final_status: DbContentStatus | null;
  final_decided_at: string | null;
  ad_media_id: string | null;
  created_at: string;
}

export interface ShotRow {
  id: string;
  script_id: string;
  product_id: string;
  user_id: string;
  key: string;
  kind: ShotKind;
  attempt: number;
  endpoint: string;
  input: Record<string, unknown>;
  render_status: "queued" | "running" | "succeeded" | "failed";
  hf_request_id: string | null;
  submitted_at: string | null;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  size_bytes: number | null;
  qa: KeyframeQa | null;
  status: DbContentStatus;
  error_code: string | null;
  error_message: string | null;
  superseded_at: string | null;
  updated_at: string;
  created_at: string;
}

/** Cierra lo colgado: guiones que no terminaron y tomas que Higgsfield nunca devolvió. */
export async function expireStaleVideos(userId: string): Promise<void> {
  const db = adminClient();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const before = (ms: number) => new Date(now - ms).toISOString();
  const scriptPatch = { status: "failed", error_code: "stale", error_message: "La IA se interrumpió. Toca Reintentar.", finished_at: stamp, updated_at: stamp };
  const shotPatch = { render_status: "failed", error_code: "stale", error_message: "No terminó de generarse. Toca Generar de nuevo.", finished_at: stamp, updated_at: stamp };
  const results = await Promise.all([
    db.from("video_scripts").update(scriptPatch).eq("user_id", userId).eq("status", "running").lt("started_at", before(SCRIPT_RUNNING_STALE_MS)),
    db.from("video_scripts").update(scriptPatch).eq("user_id", userId).eq("status", "queued").lt("created_at", before(SCRIPT_QUEUED_STALE_MS)),
    db.from("video_shots").update(shotPatch).eq("user_id", userId).eq("render_status", "running").lt("submitted_at", before(SHOT_RUNNING_STALE_MS)),
    db.from("video_shots").update(shotPatch).eq("user_id", userId).eq("render_status", "queued").lt("created_at", before(SHOT_QUEUED_STALE_MS)),
  ]);
  for (const r of results) fail("Cerrar lo colgado de Videos", r.error);
  await purgeSupersededVideos(userId);
}

/**
 * Lo reemplazado se borra de verdad (archivo de creative-media y fila): las tomas reemplazadas que ya
 * terminaron y los guiones reemplazados que quedan sin tomas (con su video final). Lo que sigue
 * generándose se borra al terminar. Primero Storage, después la base. El costo queda en ai_generations.
 * La copia de un video final en Anuncios (ad_media) se queda: tiene su propio archivo.
 */
export async function purgeSupersededVideos(userId: string): Promise<void> {
  const db = adminClient();
  const [shots, scripts] = await Promise.all([
    db.from("video_shots").select("id, storage_path").eq("user_id", userId).not("superseded_at", "is", null).in("render_status", ["succeeded", "failed"]),
    db.from("video_scripts").select("id, final_storage_path").eq("user_id", userId).not("superseded_at", "is", null).in("status", ["succeeded", "failed"]),
  ]);
  fail("Leer las tomas reemplazadas", shots.error);
  fail("Leer los guiones reemplazados", scripts.error);
  const oldShots = (shots.data ?? []) as { id: string; storage_path: string | null }[];
  const paths = oldShots.map((s) => s.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length) fail("Borrar las tomas reemplazadas", (await db.storage.from(CREATIVES_BUCKET).remove(paths)).error);
  if (oldShots.length) fail("Borrar las tomas reemplazadas", (await db.from("video_shots").delete().eq("user_id", userId).in("id", oldShots.map((s) => s.id))).error);

  const oldScripts = (scripts.data ?? []) as { id: string; final_storage_path: string | null }[];
  if (!oldScripts.length) return;
  const left = await db.from("video_shots").select("script_id").eq("user_id", userId).in("script_id", oldScripts.map((s) => s.id));
  fail("Leer las tomas que quedan", left.error);
  const keep = new Set((left.data ?? []).map((s) => s.script_id as string));
  // Las tomas de un guion reemplazado también se van (cascada), pero sus archivos no: primero ellos.
  const pending = oldScripts.filter((s) => !keep.has(s.id));
  const withShots = oldScripts.filter((s) => keep.has(s.id));
  if (withShots.length) {
    const rest = await db.from("video_shots").select("id, storage_path, render_status").eq("user_id", userId).in("script_id", withShots.map((s) => s.id));
    fail("Leer las tomas del guion reemplazado", rest.error);
    const rows = (rest.data ?? []) as { id: string; storage_path: string | null; render_status: string }[];
    // Si alguna sigue generándose, el guion espera a la próxima pasada.
    if (rows.every((r) => r.render_status === "succeeded" || r.render_status === "failed")) {
      const p = rows.map((r) => r.storage_path).filter((x): x is string => Boolean(x));
      if (p.length) fail("Borrar las tomas del guion reemplazado", (await db.storage.from(CREATIVES_BUCKET).remove(p)).error);
      pending.push(...withShots);
    }
  }
  if (!pending.length) return;
  const finals = pending.map((s) => s.final_storage_path).filter((p): p is string => Boolean(p));
  if (finals.length) fail("Borrar los videos reemplazados", (await db.storage.from(CREATIVES_BUCKET).remove(finals)).error);
  fail("Borrar los guiones reemplazados", (await db.from("video_scripts").delete().eq("user_id", userId).in("id", pending.map((s) => s.id))).error);
}

export async function activeScripts(userId: string, productId: string): Promise<ScriptRow[]> {
  const { data, error } = await adminClient().from("video_scripts").select("*").eq("user_id", userId).eq("product_id", productId).is("superseded_at", null).order("angle_slot");
  fail("Leer los guiones", error);
  return (data ?? []) as ScriptRow[];
}

export async function getScriptRow(userId: string, productId: string, scriptId: string): Promise<ScriptRow | null> {
  const { data, error } = await adminClient().from("video_scripts").select("*").eq("user_id", userId).eq("product_id", productId).eq("id", scriptId).is("superseded_at", null).maybeSingle();
  fail("Leer el guion", error);
  return (data as ScriptRow | null) ?? null;
}

/** Las tomas vigentes de los guiones, de la más vieja a la más nueva. */
export async function shotsFor(userId: string, scriptIds: string[]): Promise<ShotRow[]> {
  if (!scriptIds.length) return [];
  const { data, error } = await adminClient().from("video_shots").select("*").eq("user_id", userId).in("script_id", scriptIds).is("superseded_at", null).order("created_at", { ascending: true });
  fail("Leer las tomas", error);
  return (data ?? []) as ShotRow[];
}

export async function getShotRow(userId: string, shotId: string): Promise<ShotRow | null> {
  const { data, error } = await adminClient().from("video_shots").select("*").eq("user_id", userId).eq("id", shotId).maybeSingle();
  fail("Leer la toma", error);
  return (data as ShotRow | null) ?? null;
}

/** La última toma vigente de cada clave (una clave puede tener varios intentos). */
export function latestByKey(shots: ShotRow[]): Map<string, ShotRow> {
  const out = new Map<string, ShotRow>();
  for (const s of shots) out.set(s.key, s);
  return out;
}

// ---------------------------------------------------------------- A la pantalla

const HF_FINAL = ["failed", "nsfw", "canceled"];

export function isShotRecoverable(s: Pick<ShotRow, "render_status" | "hf_request_id" | "error_code">): boolean {
  return s.render_status === "failed" && Boolean(s.hf_request_id) && !HF_FINAL.includes(s.error_code ?? "");
}

export function toShotView(s: ShotRow, src?: string): VideoShotView {
  const waiting = s.render_status === "queued" && s.error_code === "busy";
  return {
    id: s.id,
    key: s.key,
    kind: s.kind,
    attempt: s.attempt,
    render: s.render_status,
    error: s.render_status === "failed" || waiting ? (s.error_message ?? undefined) : undefined,
    src,
    qa: s.qa ? { pass: s.qa.pass, issues: s.qa.issues } : undefined,
    status: toUiStatus(s.status),
    recoverable: isShotRecoverable(s) || undefined,
  };
}

const keyOrder = (a: string, b: string) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1));

/** En qué paso está: lo que falta decide qué muestra la tarjeta. */
export function videoStep(script: ScriptRow | undefined, keyframes: ShotRow[], clips: ShotRow[]): VideoStep {
  const p = script?.payload;
  if (!script || !p || script.status !== "succeeded" || !script.approved_at) return "script";
  const kfDone = p.keyframes.every((k) => keyframes.some((s) => s.key === k.key && s.render_status === "succeeded" && s.status === "approved"));
  if (!kfDone) return "keyframes";
  const needed = [...p.a_roll.map((a) => a.key), ...p.b_roll.map((b) => b.key)];
  if (!needed.every((k) => clips.some((s) => s.key === k && s.render_status === "succeeded"))) return "clips";
  return script.final_storage_path ? "final" : "montage";
}

export async function toCardView(slot: AngleSlot, angleName: string, script: ScriptRow | undefined, shots: ShotRow[]): Promise<VideoCardView> {
  const mine = shots.filter((s) => s.script_id === script?.id);
  const latest = [...latestByKey(mine).values()];
  const keyframes = latest.filter((s) => s.kind === "keyframe").sort((a, b) => keyOrder(a.key, b.key));
  const clips = latest.filter((s) => s.kind !== "keyframe").sort((a, b) => keyOrder(a.key, b.key));
  const paths = [...latest.map((s) => s.storage_path), script?.final_storage_path].filter((p): p is string => Boolean(p));
  const urls = await signedUrls(paths);
  const cost = script?.payload ? scriptCost(script.payload) : { keyframes: 0, clips: 0 };
  return {
    slot,
    angleName,
    step: videoStep(script, keyframes, clips),
    script: script
      ? {
          id: script.id,
          status: script.status,
          error: script.error_message ?? undefined,
          payload: script.payload ?? undefined,
          approved: script.approved_at != null,
          edited: script.edited_at != null,
          createdAt: script.created_at,
        }
      : undefined,
    keyframes: keyframes.map((s) => toShotView(s, s.storage_path ? urls.get(s.storage_path) : undefined)),
    clips: clips.map((s) => toShotView(s, s.storage_path ? urls.get(s.storage_path) : undefined)),
    final: script?.final_storage_path
      ? {
          src: urls.get(script.final_storage_path),
          durationS: script.final_duration_s ?? undefined,
          sizeBytes: script.final_size_bytes ?? undefined,
          status: toUiStatus(script.final_status ?? "in_review"),
          inAds: Boolean(script.ad_media_id),
        }
      : undefined,
    cost: { keyframes: cost.keyframes, clips: cost.clips },
  };
}
