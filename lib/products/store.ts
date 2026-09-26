import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { baseFirst, pickBase } from "./base";
import type { CustomerAvatar, ProductBrief } from "@/lib/ai/schemas";
import type { AvatarProposal, ContentStatus, OptimizationRun, ReferenceImage, RunStatus } from "@/lib/types";

// Lecturas y escrituras de productos, imágenes de referencia, corridas y propuestas. Siempre con
// service_role filtrando por el dueño (el mismo patrón de lib/onboarding/store.ts).

export const REFERENCES_BUCKET = "product-references";
const SIGNED_URL_TTL_S = 60 * 60;
/** Una corrida que no avanza en este tiempo se da por interrumpida (el proceso murió). */
const RUN_STALE_MS = 10 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;

export interface ProductRow {
  id: string;
  user_id: string;
  shopify_product_id: string;
  title: string;
  handle: string | null;
  vendor: string | null;
  product_type: string | null;
  category: string | null;
  tags: string[];
  options: { name: string; values: string[] }[];
  description: string | null;
  base_info: string;
  base_info_updated_at: string | null;
  price: number;
  compare_at_price: number | null;
  cost: number | null;
  currency: string;
  /** Color de acento de la página del producto (#rrggbb); null si no se eligió. */
  page_accent_color: string | null;
  created_at: string;
}

export interface ImageRow {
  id: string;
  product_id: string;
  source: "shopify" | "upload" | "url";
  url: string | null;
  storage_path: string | null;
  alt: string | null;
  position: number;
  is_cover: boolean;
  /** Elegida por el comerciante como imagen base (una por producto). */
  is_base: boolean;
  excluded: boolean;
}

export interface RunRow {
  id: string;
  product_id: string;
  user_id: string;
  status: RunStatus;
  current_step: "product_brief" | "customer_avatar" | null;
  error_message: string | null;
  input: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface AvatarRow {
  id: string;
  product_id: string;
  status: DbContentStatus;
  payload: CustomerAvatar;
  edited_at: string | null;
  created_at: string;
}

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ---------------------------------------------------------------- Ciclo de vida (DB ↔ UI)

export type DbContentStatus = "generated" | "in_review" | "approved" | "rejected" | "publishing" | "published" | "error";

const TO_UI: Record<DbContentStatus, ContentStatus> = {
  generated: "generado",
  in_review: "revision",
  approved: "aprobado",
  rejected: "rechazado",
  publishing: "publicando",
  published: "publicado",
  error: "error",
};

export const toUiStatus = (s: DbContentStatus): ContentStatus => TO_UI[s];

// ---------------------------------------------------------------- Productos

export async function listProductRows(userId: string): Promise<ProductRow[]> {
  const { data, error } = await adminClient().from("products").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  fail("Leer los productos", error);
  return (data ?? []) as ProductRow[];
}

export async function getProductRow(userId: string, id: string): Promise<ProductRow | null> {
  // Un id que no es uuid (un enlace viejo de los datos de ejemplo) es simplemente “no existe”.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await adminClient().from("products").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  fail("Leer el producto", error);
  return data as ProductRow | null;
}

export async function updateBaseInfo(userId: string, id: string, text: string): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await adminClient()
    .from("products")
    .update({ base_info: text, base_info_updated_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id");
  fail("Guardar la información", error);
  if (!data?.length) throw new Error("Producto no encontrado");
  return now;
}

/** Guarda el color de acento de la página (ya normalizado a #rrggbb). */
export async function updatePageAccent(userId: string, id: string, hex: string): Promise<void> {
  const { data, error } = await adminClient()
    .from("products")
    .update({ page_accent_color: hex, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id");
  fail("Guardar el color de la página", error);
  if (!data?.length) throw new Error("Producto no encontrado");
}

// ---------------------------------------------------------------- Imágenes de referencia

export async function listImageRows(userId: string, productIds: string[]): Promise<ImageRow[]> {
  if (!productIds.length) return [];
  const { data, error } = await adminClient()
    .from("product_reference_images")
    .select("id, product_id, source, url, storage_path, alt, position, is_cover, is_base, excluded")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  fail("Leer las imágenes", error);
  return (data ?? []) as ImageRow[];
}

/** URLs para mostrar (y para que el modelo lea): las de Shopify tal cual; las subidas, firmadas. */
export async function withDisplayUrls(rows: ImageRow[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const stored = rows.filter((r) => r.storage_path);
  for (const r of rows) if (r.url && !r.storage_path) urls.set(r.id, r.url);
  if (stored.length) {
    const { data, error } = await adminClient()
      .storage.from(REFERENCES_BUCKET)
      .createSignedUrls(
        stored.map((r) => r.storage_path!),
        SIGNED_URL_TTL_S,
      );
    fail("Firmar las imágenes", error);
    for (const [i, r] of stored.entries()) {
      const signed = data?.[i]?.signedUrl;
      if (signed) urls.set(r.id, signed);
    }
  }
  return urls;
}

const rowFlags = (r: Pick<ImageRow, "is_base" | "is_cover" | "excluded">) => ({ base: r.is_base, cover: r.is_cover, excluded: r.excluded });

/** La imagen base del producto (lib/products/base.ts). Toda generación nueva parte de ella. */
export function baseImage<T extends Pick<ImageRow, "is_base" | "is_cover" | "excluded">>(rows: T[]): T | undefined {
  return pickBase(rows, rowFlags);
}

/** Las imágenes en uso con la base primero: lo que se le pasa al modelo, en ese orden. */
export function imagesForGeneration<T extends Pick<ImageRow, "is_base" | "is_cover" | "excluded">>(rows: T[]): T[] {
  return baseFirst(rows, rowFlags);
}

export function toReferenceImage(r: ImageRow, src: string): ReferenceImage {
  return { id: r.id, src, alt: r.alt ?? "", source: r.source, excluded: r.excluded, cover: r.is_cover, base: r.is_base };
}

// ---------------------------------------------------------------- Corridas y propuestas

/** Marca como fallidas las corridas que quedaron colgadas. Devuelve cuántas. */
export async function expireStaleRuns(userId: string): Promise<void> {
  const now = Date.now();
  const db = adminClient();
  const message = "La optimización se interrumpió. Toca Reintentar.";
  const stamp = new Date().toISOString();
  const [a, b] = await Promise.all([
    db
      .from("pipeline_runs")
      .update({ status: "failed", error_code: "stale", error_message: message, finished_at: stamp })
      .eq("user_id", userId)
      .eq("status", "running")
      .lt("started_at", new Date(now - RUN_STALE_MS).toISOString()),
    db
      .from("pipeline_runs")
      .update({ status: "failed", error_code: "stale", error_message: message, finished_at: stamp })
      .eq("user_id", userId)
      .eq("status", "queued")
      .lt("created_at", new Date(now - QUEUED_STALE_MS).toISOString()),
  ]);
  fail("Cerrar corridas colgadas", a.error);
  fail("Cerrar corridas colgadas", b.error);
}

/** La corrida más reciente de cada producto. */
export async function latestRuns(userId: string, productIds: string[]): Promise<Map<string, RunRow>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("pipeline_runs")
    .select("*")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer las optimizaciones", error);
  const map = new Map<string, RunRow>();
  for (const r of (data ?? []) as RunRow[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** La propuesta de cliente ideal vigente de cada producto (la más reciente que no se descartó). */
export async function latestAvatars(userId: string, productIds: string[]): Promise<Map<string, AvatarRow>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("customer_avatars")
    .select("id, product_id, status, payload, edited_at, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  fail("Leer los clientes ideales", error);
  const map = new Map<string, AvatarRow>();
  for (const r of (data ?? []) as AvatarRow[]) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

// ---------------------------------------------------------------- Estado para la ruta (liviano)

/** Lo que la ruta de etapas mira de una corrida o propuesta (sin payload ni input). */
export type RunState = Pick<RunRow, "product_id" | "status" | "error_message" | "created_at">;
export type AvatarState = Pick<AvatarRow, "product_id" | "status" | "created_at">;

/** La fila más reciente de cada producto (las filas vienen ordenadas de la más nueva a la más vieja). */
export function newestByProduct<T extends { product_id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const r of rows) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}

/** Como latestRuns, sin input: solo para la posición en la ruta. */
export async function latestRunStates(userId: string, productIds: string[]): Promise<Map<string, RunState>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("pipeline_runs")
    .select("product_id, status, error_message, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .order("created_at", { ascending: false });
  fail("Leer las optimizaciones", error);
  return newestByProduct((data ?? []) as RunState[]);
}

/** Como latestAvatars, sin el cliente ideal: solo para la posición en la ruta. */
export async function latestAvatarStates(userId: string, productIds: string[]): Promise<Map<string, AvatarState>> {
  if (!productIds.length) return new Map();
  const { data, error } = await adminClient()
    .from("customer_avatars")
    .select("product_id, status, created_at")
    .eq("user_id", userId)
    .in("product_id", productIds)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  fail("Leer los clientes ideales", error);
  return newestByProduct((data ?? []) as AvatarState[]);
}

/** El id de la ficha vigente: la huella con que la Página recuerda de qué ficha se escribió. */
export async function latestBriefId(userId: string, productId: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("product_briefs")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail("Leer la ficha", error);
  return (data?.id as string | undefined) ?? null;
}

export async function latestBrief(userId: string, productId: string): Promise<ProductBrief | null> {
  const { data, error } = await adminClient()
    .from("product_briefs")
    .select("payload")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail("Leer la ficha", error);
  return (data?.payload as ProductBrief | undefined) ?? null;
}

export function toRun(r: RunRow): OptimizationRun {
  return {
    id: r.id,
    status: r.status,
    step: r.current_step,
    error: r.error_message ?? undefined,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
  };
}

export function toProposal(r: AvatarRow): AvatarProposal {
  return { id: r.id, status: toUiStatus(r.status), avatar: r.payload, createdAt: r.created_at, editedAt: r.edited_at ?? undefined };
}
