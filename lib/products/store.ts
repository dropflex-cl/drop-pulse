import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { baseFirst, pickBase } from "./base";
import type { ContentStatus, ReferenceImage } from "@/lib/types";

// Lecturas y escrituras de productos, imágenes de referencia, corridas y propuestas. Siempre con
// service_role filtrando por el dueño (el mismo patrón de lib/onboarding/store.ts).

export const REFERENCES_BUCKET = "product-references";
const SIGNED_URL_TTL_S = 60 * 60;

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
  /** Se vende como extra en el checkout: no se optimiza y no aparece en Productos ni en Hoy. */
  is_upsell: boolean;
  /** Cada imagen generada pasa por el QA con Claude (y su reintento). Apagado por defecto. */
  image_qa: boolean;
  pdp_persuasion_enabled?: boolean;
  /** El consejo de uso del mensaje «Entregado» (etapa WhatsApp); null si no se escribió. */
  usage_tip?: import("@/lib/whatsapp/tip").UsageTip | null;
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

/** Marca o desmarca el producto como upsell del checkout. */
export async function updateUpsell(userId: string, id: string, upsell: boolean): Promise<void> {
  const { data, error } = await adminClient()
    .from("products")
    .update({ is_upsell: upsell, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id");
  fail("Guardar el upsell", error);
  if (!data?.length) throw new Error("Producto no encontrado");
}

/** Información base › «Revisar cada imagen con IA». */
export async function updateImageQa(userId: string, id: string, enabled: boolean): Promise<void> {
  const { data, error } = await adminClient()
    .from("products")
    .update({ image_qa: enabled, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id");
  fail("Guardar la revisión de imágenes", error);
  if (!data?.length) throw new Error("Producto no encontrado");
}

/**
 * Toda imagen generada pasa por aquí antes de su QA: sin el interruptor encendido no se llama a Claude
 * (ni se reintenta). Se lee al terminar la imagen, no al pedirla. Si no se puede leer, no se revisa: la
 * imagen ya está pagada y guardarla no depende de esto.
 */
export async function imageQaEnabled(userId: string, productId: string): Promise<boolean> {
  const { data, error } = await adminClient().from("products").select("image_qa").eq("user_id", userId).eq("id", productId).maybeSingle();
  if (error) {
    console.error("[products] leer la revisión de imágenes", error.message);
    return false;
  }
  return (data as { image_qa: boolean } | null)?.image_qa === true;
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

/** La fila más reciente de cada producto (las filas vienen ordenadas de la más nueva a la más vieja). */
export function newestByProduct<T extends { product_id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const r of rows) if (!map.has(r.product_id)) map.set(r.product_id, r);
  return map;
}
