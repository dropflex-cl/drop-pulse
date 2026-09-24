import "server-only";
import { ANGLES, type AngleRole, type SalesAngle } from "@/lib/angles/catalog";
import { fail } from "@/lib/angles/store";
import { adminClient } from "@/lib/integrations/admin";
import type { Preset } from "@/lib/integrations/higgsfield/client";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { CreativeAssetView, CreativeConceptView, RunStatus } from "@/lib/types";
import { FAMILY_DEFS, type Family, type Ratio } from "./catalog";
import type { ConceptPayload, QaResult, StoredText } from "./schemas";

// creative_runs, creative_concepts y creative_assets: lecturas de la etapa Creativos y su paso a la
// pantalla. Siempre con service_role filtrando por el dueño (como lib/copy/store.ts).

export const CREATIVES_BUCKET = "creative-media";

const RUN_RUNNING_STALE_MS = 10 * 60 * 1000;
const RUN_QUEUED_STALE_MS = 3 * 60 * 1000;
/** Una pieza en cola puede esperar a que Higgsfield libere un cupo; más de esto, se da por perdida. */
const ASSET_QUEUED_STALE_MS = 30 * 60 * 1000;
const ASSET_RUNNING_STALE_MS = 20 * 60 * 1000;
const SIGNED_URL_TTL_S = 60 * 60;

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
  };

export interface ConceptRow {
  id: string;
  product_id: string;
  user_id: string;
  run_id: string;
  position: number;
  angle_role: AngleRole;
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
    db.from("creative_assets").update(assetPatch).eq("user_id", userId).eq("render_status", "queued").lt("created_at", before(ASSET_QUEUED_STALE_MS)),
  ]);
  for (const r of results) fail("Cerrar lo colgado de Creativos", r.error);
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
    .select("id, product_id, user_id, run_id, position, angle_role, family, payload, edited_at, created_at")
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
    .select("id, product_id, user_id, run_id, position, angle_role, family, payload, edited_at, created_at")
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

/** Lo que necesita la ruta del producto (lib/products/stages.ts › CreativeFacts). */
export async function creativeCounts(userId: string, productIds: string[]) {
  const [runs, concepts] = await Promise.all([latestCreativeRuns(userId, productIds), activeConcepts(userId, productIds)]);
  const all = [...concepts.values()].flat();
  const assets = await assetsFor(userId, all.map((c) => c.id));
  return (productId: string) => {
    const mine = assets.filter((a) => a.product_id === productId);
    const run = runs.get(productId);
    return {
      running: run?.status === "queued" || run?.status === "running",
      concepts: concepts.get(productId)?.length ?? 0,
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
    angle: c.angle_role,
    angleName: ANGLES[p.sales_angle]?.name ?? "",
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
