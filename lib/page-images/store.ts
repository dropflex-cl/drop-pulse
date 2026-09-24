import "server-only";
import { fail } from "@/lib/angles/store";
import { LISTING, type Listing } from "@/lib/copy/listing";
import { copyProgress } from "@/lib/copy/progress";
import { activeComponents, currentContent, toComponentViews } from "@/lib/copy/store";
import { adminClient } from "@/lib/integrations/admin";
import type { DbContentStatus } from "@/lib/products/store";
import type { PageImageOptionView, PageImageSlotView, RunStatus } from "@/lib/types";
import { COVER, GALLERY, SHOT_NAMES, SLOT_FORMAT, SLOT_RATIO, benefitSlot, slotKind } from "./catalog";
import type { PageQaResult, ShotText, StoredShot } from "./schemas";

// page_image_runs, page_image_shots y page_images: lecturas de la etapa Imágenes, limpieza de lo
// descartado y paso a la pantalla. Siempre con service_role filtrando por el dueño.

export const PAGE_MEDIA_BUCKET = "page-media";

const RUN_RUNNING_STALE_MS = 10 * 60 * 1000;
const RUN_QUEUED_STALE_MS = 3 * 60 * 1000;
/** Una imagen en cola puede esperar a que Higgsfield libere un cupo; más de esto, se da por perdida. */
const IMAGE_QUEUED_STALE_MS = 30 * 60 * 1000;
const IMAGE_RUNNING_STALE_MS = 20 * 60 * 1000;
const SIGNED_URL_TTL_S = 60 * 60;
/** Lo descartado se borra pasado este plazo: deja tiempo para Deshacer. */
export const DISCARD_PURGE_MS = 2 * 60 * 1000;

export interface PageImageRunRow {
  id: string;
  product_id: string;
  user_id: string;
  status: RunStatus;
  error_code: string | null;
  error_message: string | null;
  input: Record<string, unknown>;
  created_at: string;
}

export interface ShotRow {
  id: string;
  product_id: string;
  user_id: string;
  run_id: string;
  slot: string;
  position: number;
  payload: StoredShot;
  created_at: string;
}

export interface PageImageRow {
  id: string;
  product_id: string;
  user_id: string;
  slot: string;
  source: "ai" | "upload" | "reference";
  shot_id: string | null;
  reference_image_id: string | null;
  attempt: number;
  retry_of: string | null;
  endpoint: string | null;
  input: Record<string, unknown>;
  baked_texts: ShotText[];
  render_status: "queued" | "running" | "succeeded" | "failed";
  hf_request_id: string | null;
  error_code: string | null;
  error_message: string | null;
  qa: PageQaResult | null;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  status: DbContentStatus;
  position: number | null;
  submitted_at: string | null;
  updated_at: string;
  created_at: string;
}

/**
 * Lo aprobado de la página que usan las imágenes: la ficha y los beneficios del componente
 * «Foto y razones» (image-with-benefits), que definen un espacio de beneficio cada uno. El id de un
 * beneficio es «<id del componente>.<n>»: sigue igual mientras no se reescriba el componente.
 */
export interface PageCopyFacts {
  /** La página (la ficha) está aprobada: la etapa se habilita. */
  complete: boolean;
  shortName?: string;
  /** Cómo funciona, en una frase: la descripción de «Hero y cifras» o la descripción corta de la ficha. */
  howItWorks?: string;
  benefits: { id: string; text: string }[];
}

export async function pageCopy(userId: string, productId: string): Promise<PageCopyFacts> {
  const rows = (await activeComponents(userId, [productId])).get(productId) ?? [];
  const progress = copyProgress(toComponentViews(rows));
  const approved = (id: string) => rows.find((r) => r.component === id && r.status === "approved");
  const listing = approved(LISTING);
  const ficha = listing ? (currentContent(listing) as Listing) : undefined;
  const stats = approved("stats-with-image");
  const statsText = stats ? (currentContent(stats) as { description?: string }).description?.replaceAll("**", "") : undefined;
  const iwb = rows.find((r) => r.component === "image-with-benefits" && r.status === "approved" && r.enabled);
  const benefits = iwb ? ((currentContent(iwb) as { benefits?: { title: string; body: string }[] }).benefits ?? []) : [];
  return {
    complete: progress.complete,
    shortName: ficha?.short_name,
    howItWorks: statsText ?? ficha?.short_description,
    benefits: benefits.map((b, i) => ({ id: `${iwb!.id}.${i + 1}`, text: `${b.title}: ${b.body}` })),
  };
}

/** Cierra lo colgado: corridas del director e imágenes que nunca terminaron. */
export async function expireStalePageImages(userId: string): Promise<void> {
  const db = adminClient();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const runPatch = { status: "failed", error_code: "stale", error_message: "La IA se interrumpió. Toca Reintentar.", finished_at: stamp, updated_at: stamp };
  const imagePatch = { render_status: "failed", error_code: "stale", error_message: "La imagen no terminó de generarse. Toca Generar otra.", finished_at: stamp, updated_at: stamp };
  const before = (ms: number) => new Date(now - ms).toISOString();
  const results = await Promise.all([
    db.from("page_image_runs").update(runPatch).eq("user_id", userId).eq("status", "running").lt("started_at", before(RUN_RUNNING_STALE_MS)),
    db.from("page_image_runs").update(runPatch).eq("user_id", userId).eq("status", "queued").lt("created_at", before(RUN_QUEUED_STALE_MS)),
    db.from("page_images").update(imagePatch).eq("user_id", userId).eq("render_status", "running").lt("submitted_at", before(IMAGE_RUNNING_STALE_MS)),
    db.from("page_images").update(imagePatch).eq("user_id", userId).eq("render_status", "queued").lt("created_at", before(IMAGE_QUEUED_STALE_MS)),
  ]);
  for (const r of results) fail("Cerrar lo colgado de Imágenes", r.error);
  await purgeDiscardedPageImages(userId);
}

/**
 * Lo descartado se borra de verdad (archivo de page-media y fila):
 * - una opción descartada, pasado el plazo de Deshacer;
 * - al proponer otra galería, todas las imágenes generadas de las tomas reemplazadas, también las
 *   elegidas, salvo las que siguen generándose (se borran al terminar: si no, quedaría un archivo sin
 *   fila). Después, las tomas reemplazadas que quedan sin imágenes.
 * Las subidas y las fotos de Información base no dependen de la galería: se quedan.
 * Primero Storage y después la base: si Storage falla, la fila queda y se reintenta en la próxima
 * lectura. El costo queda en ai_generations.
 */
export async function purgeDiscardedPageImages(userId: string): Promise<void> {
  const db = adminClient();
  const [rejected, superseded] = await Promise.all([
    db.from("page_images").select("id, storage_path").eq("user_id", userId).eq("status", "rejected").lt("decided_at", new Date(Date.now() - DISCARD_PURGE_MS).toISOString()),
    db.from("page_image_shots").select("id").eq("user_id", userId).not("superseded_at", "is", null),
  ]);
  fail("Leer lo descartado", rejected.error);
  fail("Leer las tomas reemplazadas", superseded.error);
  const oldShots = (superseded.data ?? []).map((s) => s.id as string);
  let orphans: { id: string; storage_path: string | null }[] = [];
  if (oldShots.length) {
    const r = await db.from("page_images").select("id, storage_path").eq("user_id", userId).in("shot_id", oldShots).in("render_status", ["succeeded", "failed"]);
    fail("Leer las imágenes reemplazadas", r.error);
    orphans = (r.data ?? []) as typeof orphans;
  }
  const rows = [...((rejected.data ?? []) as typeof orphans), ...orphans];
  if (rows.length) {
    const paths = [...new Set(rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p)))];
    if (paths.length) fail("Borrar las imágenes descartadas", (await db.storage.from(PAGE_MEDIA_BUCKET).remove(paths)).error);
    fail("Borrar las opciones descartadas", (await db.from("page_images").delete().eq("user_id", userId).in("id", [...new Set(rows.map((r) => r.id))])).error);
  }
  if (oldShots.length) {
    const left = await db.from("page_images").select("shot_id").eq("user_id", userId).in("shot_id", oldShots);
    fail("Leer las imágenes que quedan", left.error);
    const keep = new Set((left.data ?? []).map((a) => a.shot_id as string));
    const empty = oldShots.filter((id) => !keep.has(id));
    if (empty.length) fail("Borrar las tomas reemplazadas", (await db.from("page_image_shots").delete().eq("user_id", userId).in("id", empty)).error);
  }
}

export async function latestPageImageRuns(userId: string, productIds: string[]): Promise<Map<string, PageImageRunRow>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("page_image_runs")
    .select("id, product_id, user_id, status, error_code, error_message, input, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer las corridas de Imágenes", error);
  const map = new Map<string, PageImageRunRow>();
  for (const r of (data ?? []) as PageImageRunRow[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

export async function activeShots(userId: string, productId: string): Promise<ShotRow[]> {
  const { data, error } = await adminClient()
    .from("page_image_shots")
    .select("id, product_id, user_id, run_id, slot, position, payload, created_at")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .is("superseded_at", null)
    .order("position", { ascending: true });
  fail("Leer las tomas", error);
  return (data ?? []) as ShotRow[];
}

export async function getShotRow(userId: string, productId: string, shotId: string): Promise<ShotRow | null> {
  const { data, error } = await adminClient()
    .from("page_image_shots")
    .select("id, product_id, user_id, run_id, slot, position, payload, created_at")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("id", shotId)
    .is("superseded_at", null)
    .maybeSingle();
  fail("Leer la toma", error);
  return (data as ShotRow | null) ?? null;
}

export async function pageImageRows(userId: string, productIds: string[]): Promise<PageImageRow[]> {
  if (!productIds.length) return [];
  const { data, error } = await adminClient().from("page_images").select("*").eq("user_id", userId).in("product_id", productIds).order("created_at", { ascending: true });
  fail("Leer las imágenes de la página", error);
  return (data ?? []) as PageImageRow[];
}

export async function getPageImageRow(userId: string, imageId: string): Promise<PageImageRow | null> {
  const { data, error } = await adminClient().from("page_images").select("*").eq("user_id", userId).eq("id", imageId).maybeSingle();
  fail("Leer la imagen", error);
  return (data as PageImageRow | null) ?? null;
}

/** Lo que necesita la ruta del producto (lib/products/stages.ts › ImageFacts). */
export async function pageImageCounts(userId: string, productIds: string[]) {
  const [runs, rows] = await Promise.all([latestPageImageRuns(userId, productIds), pageImageRows(userId, productIds)]);
  return (productId: string) => {
    const mine = rows.filter((r) => r.product_id === productId);
    const run = runs.get(productId);
    const chosen = mine.filter((r) => r.status === "approved");
    return {
      running: run?.status === "queued" || run?.status === "running",
      rendering: mine.filter((r) => r.render_status === "queued" || r.render_status === "running").length,
      options: mine.filter((r) => r.render_status === "succeeded" && r.status !== "rejected").length,
      cover: chosen.some((r) => r.slot === COVER),
      gallery: chosen.filter((r) => r.slot === GALLERY).length,
    };
  };
}

// ---------------------------------------------------------------- A la pantalla

export async function signedPageUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data, error } = await adminClient().storage.from(PAGE_MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_S);
  fail("Firmar las imágenes", error);
  paths.forEach((p, i) => data?.[i]?.signedUrl && out.set(p, data[i].signedUrl));
  return out;
}

/** Higgsfield dio su respuesta final (no generó o la rechazó): esas no se recuperan. */
const HF_FINAL = ["failed", "nsfw", "canceled"];

/** La imagen falló, pero Higgsfield la recibió y no dio una respuesta final: vale preguntar de nuevo. */
export function isRecoverable(a: Pick<PageImageRow, "render_status" | "hf_request_id" | "error_code">): boolean {
  return a.render_status === "failed" && Boolean(a.hf_request_id) && !HF_FINAL.includes(a.error_code ?? "");
}

export function toOptionView(r: PageImageRow, src?: string): PageImageOptionView {
  const waiting = r.render_status === "queued" && r.error_code === "busy";
  return {
    id: r.id,
    source: r.source,
    shotId: r.shot_id ?? undefined,
    referenceId: r.reference_image_id ?? undefined,
    render: r.render_status,
    attempt: r.attempt,
    error: r.render_status === "failed" || waiting ? (r.error_message ?? undefined) : undefined,
    src,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    qa: r.qa ? { pass: r.qa.pass, issues: r.qa.issues } : undefined,
    chosen: r.status === "approved",
    discarded: r.status === "rejected",
    order: r.status === "approved" && r.slot === GALLERY ? (r.position ?? undefined) : undefined,
    recoverable: isRecoverable(r) || undefined,
    createdAt: r.created_at,
  };
}

/**
 * Los espacios de la página, en su orden: Portada, Galería y un Beneficio por cada beneficio
 * aprobado en Textos. Un intento que el QA rechazó se esconde cuando su reintento salió bien.
 */
export function toSlotViews(copy: PageCopyFacts, shots: ShotRow[], rows: PageImageRow[], urls: Map<string, string>): PageImageSlotView[] {
  const replaced = new Set(rows.filter((r) => r.retry_of && r.render_status === "succeeded").map((r) => r.retry_of!));
  // Una falla deja de mostrarse cuando su toma ya tiene otra imagen más nueva (se ve solo la última).
  const superseded = (r: PageImageRow) => r.render_status === "failed" && rows.some((o) => o.shot_id && o.shot_id === r.shot_id && o.created_at > r.created_at);
  const rank = (r: PageImageRow) => (r.render_status === "failed" ? 1 : 0);
  const optionsOf = (slot: string) =>
    rows
      .filter((r) => r.slot === slot && !replaced.has(r.id) && !superseded(r))
      .sort((a, b) => rank(a) - rank(b))
      .map((r) => toOptionView(r, r.storage_path ? urls.get(r.storage_path) : r.reference_image_id ? urls.get(`ref:${r.reference_image_id}`) : undefined));
  const shotsOf = (slot: string) => shots.filter((s) => s.slot === slot).map((s) => ({ id: s.id, name: s.payload.name, type: SHOT_NAMES[s.payload.type] ?? s.payload.type, look: s.payload.look }));
  const slot = (key: string, title: string, pairs?: string): PageImageSlotView => {
    const kind = slotKind(key)!;
    return { key, kind, title, required: kind !== "benefit", format: SLOT_FORMAT[kind], ratio: SLOT_RATIO[kind], pairs, shots: shotsOf(key), options: optionsOf(key) };
  };
  return [
    slot(COVER, "Portada"),
    slot(GALLERY, "Galería"),
    ...copy.benefits.map((b, i) => slot(benefitSlot(b.id), `Beneficio ${i + 1}`, b.text)),
  ];
}
