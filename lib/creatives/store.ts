import "server-only";
import { ANGLES, type AngleSlot, type SalesAngle } from "@/lib/angles/catalog";
import { fail } from "@/lib/angles/store";
import { adminClient } from "@/lib/integrations/admin";
import type { ImageProvider } from "@/lib/image-provider";
import type { Preset } from "@/lib/integrations/higgsfield/client";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { CreativeAssetView, CreativeConceptView, RunStatus } from "@/lib/types";
import { FAMILY_DEFS, type Family, type Ratio } from "./catalog";
import type { ConceptPayload, QaResult, StoredText } from "./schemas";

// creative_runs, creative_concepts y creative_assets: lecturas de la etapa Creativos y su paso a la
// pantalla. Siempre con service_role filtrando por el dueño (como lib/copy/store.ts).

export const CREATIVES_BUCKET = "creative-media";
/** Donde vive la copia de una pieza aprobada, junto a los creativos subidos a mano (Anuncios). */
export const AD_MEDIA_BUCKET = "ad-media";

const RUN_RUNNING_STALE_MS = 10 * 60 * 1000;
const RUN_QUEUED_STALE_MS = 3 * 60 * 1000;
/** Una pieza en cola puede esperar a que Higgsfield libere un cupo; más de esto, se da por perdida. */
const ASSET_QUEUED_STALE_MS = 30 * 60 * 1000;
const ASSET_RUNNING_STALE_MS = 20 * 60 * 1000;
/** Gemini responde en la misma llamada (tope de la función: 5 min): más que esto, el proceso se cortó. */
const GEMINI_RUNNING_STALE_MS = 6 * 60 * 1000;
const SIGNED_URL_TTL_S = 60 * 60;
/** Lo descartado se borra pasado este plazo: deja tiempo para Deshacer. */
export const REJECTED_PURGE_MS = 2 * 60 * 1000;

export interface CreativeRunRow {
  id: string;
  product_id: string;
  user_id: string;
  status: RunStatus;
  error_code: string | null;
  error_message: string | null;
  input: Record<string, unknown>;
  created_at: string;
}

/** Lo que agregó la dirección de arte (prompt v2): los conceptos v1 no lo traen. */
type ArtFields = "look" | "art" | "layout" | "product_units" | "kit_parts";

/**
 * Lo que se guarda de un concepto: lo del generador, el preset elegido (nombre y portada) y, de la
 * corrida, cómo se ve el producto y el kit de la foto base (el render los necesita en cada pieza).
 */
export type StoredConcept = Omit<ConceptPayload, ArtFields | "texts"> &
  Partial<Pick<ConceptPayload, ArtFields>> & {
    texts: StoredText[];
    product_look?: string;
    kit?: string[];
    preset: Pick<Preset, "id" | "name" | "group" | "cover"> | null;
    /** El ángulo de venta del desarrollo del que sale. */
    sales_angle: SalesAngle;
    /** El nombre del ángulo de testeo (desde CREATIVES_PROMPT_VERSION 3). */
    angle_name?: string;
  };

export interface ConceptRow {
  id: string;
  product_id: string;
  user_id: string;
  run_id: string;
  position: number;
  angle_slot: AngleSlot;
  family: Family;
  payload: StoredConcept;
  edited_at: string | null;
  created_at: string;
}

export interface AssetRow {
  id: string;
  product_id: string;
  user_id: string;
  concept_id: string;
  ratio: Ratio;
  attempt: number;
  /** Con qué se generó (lib/image-provider.ts): el render, el reintento y el sondeo siguen con ese. */
  provider: ImageProvider;
  endpoint: string;
  preset_id: string | null;
  input: Record<string, unknown>;
  baked_texts: StoredText[];
  render_status: "queued" | "running" | "succeeded" | "failed";
  hf_request_id: string | null;
  error_code: string | null;
  error_message: string | null;
  qa: QaResult | null;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  status: DbContentStatus;
  ad_media_id: string | null;
  submitted_at: string | null;
  updated_at: string;
  created_at: string;
}

/** Cierra lo colgado: corridas del generador y piezas que nunca terminaron. */
export async function expireStaleCreatives(userId: string): Promise<void> {
  const db = adminClient();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const runPatch = { status: "failed", error_code: "stale", error_message: "La IA se interrumpió. Toca Reintentar.", finished_at: stamp, updated_at: stamp };
  const assetPatch = { render_status: "failed", error_code: "stale", error_message: "La imagen no terminó de generarse. Toca Generar de nuevo.", finished_at: stamp, updated_at: stamp };
  const before = (ms: number) => new Date(now - ms).toISOString();
  const results = await Promise.all([
    db.from("creative_runs").update(runPatch).eq("user_id", userId).eq("status", "running").lt("started_at", before(RUN_RUNNING_STALE_MS)),
    db.from("creative_runs").update(runPatch).eq("user_id", userId).eq("status", "queued").lt("created_at", before(RUN_QUEUED_STALE_MS)),
    db.from("creative_assets").update(assetPatch).eq("user_id", userId).eq("render_status", "running").lt("submitted_at", before(ASSET_RUNNING_STALE_MS)),
    db.from("creative_assets").update(assetPatch).eq("user_id", userId).eq("render_status", "running").eq("provider", "gemini").lt("submitted_at", before(GEMINI_RUNNING_STALE_MS)),
    db.from("creative_assets").update(assetPatch).eq("user_id", userId).eq("render_status", "queued").lt("created_at", before(ASSET_QUEUED_STALE_MS)),
  ]);
  for (const r of results) fail("Cerrar lo colgado de Creativos", r.error);
  await purgeDiscardedCreatives(userId);
}

/**
 * Saca de Anuncios las copias (ad_media) de piezas generadas: archivo de ad-media y fila. Se quedan
 * las que ya se subieron a Meta o que usa un anuncio (ads.media_id no se borra en cascada): tienen
 * su propio archivo y no dependen de la pieza. Devuelve los ids que se borraron.
 */
export async function removeAdCopies(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const db = adminClient();
  const [media, used] = await Promise.all([
    db.from("ad_media").select("id, storage_path, meta_image_hash").in("id", ids),
    db.from("ads").select("media_id").in("media_id", ids),
  ]);
  fail("Leer los creativos de Anuncios", media.error);
  fail("Leer los anuncios", used.error);
  const inUse = new Set((used.data ?? []).map((a) => a.media_id as string));
  const removable = ((media.data ?? []) as { id: string; storage_path: string; meta_image_hash: string | null }[]).filter((m) => !m.meta_image_hash && !inUse.has(m.id));
  if (!removable.length) return new Set();
  fail("Borrar el creativo", (await db.storage.from(AD_MEDIA_BUCKET).remove(removable.map((m) => m.storage_path))).error);
  fail("Borrar el creativo", (await db.from("ad_media").delete().in("id", removable.map((m) => m.id))).error);
  return new Set(removable.map((m) => m.id));
}

/**
 * Lo descartado se borra de verdad (archivo de creative-media y fila):
 * - una pieza descartada, pasado el plazo de Deshacer;
 * - al proponer otros, todas las piezas de los conceptos reemplazados, también las aprobadas (con su
 *   copia en Anuncios, ver removeAdCopies), salvo las que siguen generándose: se borran cuando
 *   terminan (si no, Higgsfield dejaría un archivo sin fila). Después, los conceptos reemplazados
 *   que quedan sin piezas.
 * Primero Storage y después la base: si Storage falla, la fila queda y se reintenta en la próxima
 * lectura. El costo queda en ai_generations.
 */
export async function purgeDiscardedCreatives(userId: string): Promise<void> {
  const db = adminClient();
  const [rejected, superseded] = await Promise.all([
    db
      .from("creative_assets")
      .select("id, storage_path")
      .eq("user_id", userId)
      .eq("status", "rejected")
      .lt("decided_at", new Date(Date.now() - REJECTED_PURGE_MS).toISOString()),
    db.from("creative_concepts").select("id").eq("user_id", userId).not("superseded_at", "is", null),
  ]);
  fail("Leer lo descartado", rejected.error);
  fail("Leer los conceptos reemplazados", superseded.error);
  const oldConcepts = (superseded.data ?? []).map((c) => c.id as string);
  let orphans: { id: string; storage_path: string | null }[] = [];
  if (oldConcepts.length) {
    const r = await db
      .from("creative_assets")
      .select("id, storage_path, ad_media_id")
      .eq("user_id", userId)
      .in("concept_id", oldConcepts)
      .in("render_status", ["succeeded", "failed"]);
    fail("Leer las piezas reemplazadas", r.error);
    const found = (r.data ?? []) as (typeof orphans[number] & { ad_media_id: string | null })[];
    await removeAdCopies(found.map((a) => a.ad_media_id).filter((id): id is string => Boolean(id)));
    orphans = found;
  }
  const rows = [...((rejected.data ?? []) as typeof orphans), ...orphans];
  if (rows.length) {
    const paths = [...new Set(rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p)))];
    if (paths.length) fail("Borrar las imágenes descartadas", (await db.storage.from(CREATIVES_BUCKET).remove(paths)).error);
    fail("Borrar las piezas descartadas", (await db.from("creative_assets").delete().eq("user_id", userId).in("id", [...new Set(rows.map((r) => r.id))])).error);
  }
  if (oldConcepts.length) {
    const left = await db.from("creative_assets").select("concept_id").eq("user_id", userId).in("concept_id", oldConcepts);
    fail("Leer las piezas que quedan", left.error);
    const keep = new Set((left.data ?? []).map((a) => a.concept_id as string));
    const empty = oldConcepts.filter((id) => !keep.has(id));
    if (empty.length) fail("Borrar los conceptos reemplazados", (await db.from("creative_concepts").delete().eq("user_id", userId).in("id", empty)).error);
  }
}

export async function latestCreativeRuns(userId: string, productIds: string[]): Promise<Map<string, CreativeRunRow>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("creative_runs")
    .select("id, product_id, user_id, status, error_code, error_message, input, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer las corridas de Creativos", error);
  const map = new Map<string, CreativeRunRow>();
  for (const r of (data ?? []) as CreativeRunRow[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

export async function activeConcepts(userId: string, productIds: string[]): Promise<Map<string, ConceptRow[]>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("creative_concepts")
    .select("id, product_id, user_id, run_id, position, angle_slot, family, payload, edited_at, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .is("superseded_at", null)
    .order("position", { ascending: true });
  fail("Leer los conceptos", error);
  const map = new Map<string, ConceptRow[]>();
  for (const r of (data ?? []) as ConceptRow[]) map.set(r.product_id, [...(map.get(r.product_id) ?? []), r]);
  return map;
}

export async function getConceptRow(userId: string, productId: string, conceptId: string): Promise<ConceptRow | null> {
  const { data, error } = await adminClient()
    .from("creative_concepts")
    .select("id, product_id, user_id, run_id, position, angle_slot, family, payload, edited_at, created_at")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("id", conceptId)
    .is("superseded_at", null)
    .maybeSingle();
  fail("Leer el concepto", error);
  return (data as ConceptRow | null) ?? null;
}

export async function assetsFor(userId: string, conceptIds: string[]): Promise<AssetRow[]> {
  if (!conceptIds.length) return [];
  const { data, error } = await adminClient().from("creative_assets").select("*").eq("user_id", userId).in("concept_id", conceptIds).order("created_at", { ascending: true });
  fail("Leer las piezas", error);
  return (data ?? []) as AssetRow[];
}

export async function getAssetRow(userId: string, assetId: string): Promise<AssetRow | null> {
  const { data, error } = await adminClient().from("creative_assets").select("*").eq("user_id", userId).eq("id", assetId).maybeSingle();
  fail("Leer la pieza", error);
  return (data as AssetRow | null) ?? null;
}

/** Lo que necesita la ruta del producto (lib/products/stages.ts › CreativeFacts). Solo las columnas que cuentan. */
export async function creativeCounts(userId: string, productIds: string[]) {
  if (!productIds.length) return () => ({ running: false, concepts: 0, rendering: 0, pending: 0, approved: 0 });
  const db = adminClient();
  const [runRes, conceptRes] = await Promise.all([
    db.from("creative_runs").select("product_id, status").eq("user_id", userId).in("product_id", productIds).order("created_at", { ascending: false }),
    db.from("creative_concepts").select("id, product_id").eq("user_id", userId).in("product_id", productIds).is("superseded_at", null),
  ]);
  fail("Leer las corridas de Creativos", runRes.error);
  fail("Leer los conceptos", conceptRes.error);
  const runs = new Map<string, Pick<CreativeRunRow, "status">>();
  for (const r of (runRes.data ?? []) as Pick<CreativeRunRow, "product_id" | "status">[]) if (!runs.has(r.product_id)) runs.set(r.product_id, r);
  const concepts = (conceptRes.data ?? []) as { id: string; product_id: string }[];
  let assets: Pick<AssetRow, "product_id" | "render_status" | "status">[] = [];
  if (concepts.length) {
    const { data, error } = await db.from("creative_assets").select("product_id, render_status, status").eq("user_id", userId).in("concept_id", concepts.map((c) => c.id));
    fail("Leer las piezas", error);
    assets = (data ?? []) as typeof assets;
  }
  return (productId: string) => {
    const mine = assets.filter((a) => a.product_id === productId);
    const run = runs.get(productId);
    return {
      running: run?.status === "queued" || run?.status === "running",
      concepts: concepts.filter((c) => c.product_id === productId).length,
      rendering: mine.filter((a) => a.render_status === "queued" || a.render_status === "running").length,
      pending: mine.filter((a) => a.render_status === "succeeded" && (a.status === "generated" || a.status === "in_review")).length,
      approved: mine.filter((a) => a.status === "approved").length,
    };
  };
}

// ---------------------------------------------------------------- A la pantalla

export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data, error } = await adminClient().storage.from(CREATIVES_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_S);
  fail("Firmar las piezas", error);
  paths.forEach((p, i) => data?.[i]?.signedUrl && out.set(p, data[i].signedUrl));
  return out;
}

/** Higgsfield dio su respuesta final (no generó o la rechazó): esas no se recuperan. */
const HF_FINAL = ["failed", "nsfw", "canceled"];

/** La pieza falló, pero Higgsfield la recibió y no dio una respuesta final: vale preguntar de nuevo. */
export function isRecoverable(a: Pick<AssetRow, "render_status" | "hf_request_id" | "error_code">): boolean {
  return a.render_status === "failed" && Boolean(a.hf_request_id) && !HF_FINAL.includes(a.error_code ?? "");
}

export function toAssetView(a: AssetRow, src?: string): CreativeAssetView {
  const waiting = a.render_status === "queued" && a.error_code === "busy";
  return {
    id: a.id,
    ratio: a.ratio,
    attempt: a.attempt,
    render: a.render_status,
    error: a.render_status === "failed" || waiting ? (a.error_message ?? undefined) : undefined,
    src,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    qa: a.qa ? { pass: a.qa.pass, issues: a.qa.issues } : undefined,
    status: toUiStatus(a.status),
    inAds: Boolean(a.ad_media_id),
    recoverable: isRecoverable(a) || undefined,
    createdAt: a.created_at,
  };
}

export function toConceptView(c: ConceptRow, assets: AssetRow[], urls: Map<string, string>): CreativeConceptView {
  const p = c.payload;
  return {
    id: c.id,
    angle: c.angle_slot,
    angleName: p.angle_name || (ANGLES[p.sales_angle]?.name ?? ""),
    family: c.family,
    familyName: FAMILY_DEFS[c.family]?.name ?? c.family,
    name: p.name,
    why: p.why,
    look: p.look,
    preset: p.preset ? { id: p.preset.id, name: p.preset.name, group: p.preset.group, cover: p.preset.cover ?? undefined } : undefined,
    texts: p.texts.map((t) => ({ role: t.role, text: t.text })),
    edited: c.edited_at != null,
    assets: assets.filter((a) => a.concept_id === c.id).map((a) => toAssetView(a, a.storage_path ? urls.get(a.storage_path) : undefined)),
  };
}
