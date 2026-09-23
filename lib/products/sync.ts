import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { numericId } from "@/lib/integrations/shopify/catalog";
import { shopifyQuery, ShopifyAuthError } from "@/lib/integrations/shopify/client";
import { getShopifyConnection, type ShopifyConnection } from "@/lib/integrations/shopify/connection";
import {
  PRODUCT_DETAIL_QUERY,
  PRODUCT_IDS_QUERY,
  PRODUCTS_DETAIL_QUERY,
  type ProductDetailNode,
  type ProductDetailQuery,
  type ProductIdsQuery,
  type ProductsDetailQuery,
} from "@/lib/integrations/shopify/queries";
import { getMarket } from "@/lib/settings/market";
import { deleteProducts, forgetCatalogItems } from "./delete";

// Los productos que el comerciante eligió en el onboarding pasan de catalog_items (el espejo liviano
// del catálogo) a products, con su descripción completa y todas sus imágenes. Parten en la etapa
// Información base: el texto viene lleno con la descripción de Shopify para no partir de cero.

const num = (v: string | null | undefined) => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchDetail(conn: ShopifyConnection, id: string): Promise<ProductDetailNode | null> {
  const gid = `gid://shopify/Product/${id}`;
  try {
    return (await shopifyQuery<ProductDetailQuery>(conn, PRODUCT_DETAIL_QUERY(true), { id: gid })).product;
  } catch (e) {
    // Sin read_inventory, unitCost da ACCESS_DENIED: se reintenta sin costo (como la importación).
    if (e instanceof ShopifyAuthError) return (await shopifyQuery<ProductDetailQuery>(conn, PRODUCT_DETAIL_QUERY(false), { id: gid })).product;
    throw e;
  }
}

async function insertProduct(userId: string, node: ProductDetailNode, currency: string): Promise<boolean> {
  const db = adminClient();
  const variant = node.variants.nodes[0];
  const description = node.description?.trim() ?? "";
  const { data, error } = await db
    .from("products")
    .upsert(
      {
        user_id: userId,
        shopify_product_id: numericId(node.id),
        shopify_gid: node.id,
        title: node.title,
        handle: node.handle,
        vendor: node.vendor || null,
        product_type: node.productType || null,
        category: node.category?.fullName ?? null,
        tags: node.tags ?? [],
        options: node.options ?? [],
        description,
        base_info: description,
        price: num(variant?.price) ?? 0,
        compare_at_price: num(variant?.compareAtPrice),
        cost: num(variant?.inventoryItem?.unitCost?.amount),
        currency,
        shopify_status: node.status,
      },
      { onConflict: "user_id,shopify_product_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Guardar el producto: ${error.message}`);
  if (!data) return false; // Ya existía (otra invocación lo creó primero).

  const images = node.media.nodes
    .filter((m) => m.mediaContentType === "IMAGE" && m.image?.url)
    .map((m, i) => ({
      product_id: data.id,
      user_id: userId,
      source: "shopify",
      shopify_media_id: m.id,
      url: m.image!.url,
      alt: m.alt || null,
      width: m.image!.width,
      height: m.image!.height,
      position: i,
      is_cover: m.id === node.featuredMedia?.id,
    }));
  if (images.length) {
    const { error: imgError } = await db.from("product_reference_images").insert(images);
    if (imgError) throw new Error(`Guardar las imágenes: ${imgError.message}`);
  }
  return true;
}

/**
 * Crea los productos elegidos que aún no existen. Idempotente: se puede llamar al empezar a generar
 * y otra vez al abrir Productos. Un producto que Shopify ya no tiene se salta sin frenar a los demás.
 */
export async function syncSelectedProducts(userId: string): Promise<number> {
  const db = adminClient();
  const [{ data: onboarding, error: obError }, { data: existing, error: exError }] = await Promise.all([
    db.from("onboarding").select("selected").eq("user_id", userId).maybeSingle(),
    db.from("products").select("shopify_product_id").eq("user_id", userId),
  ]);
  if (obError) throw new Error(`Leer la selección: ${obError.message}`);
  if (exError) throw new Error(`Leer los productos: ${exError.message}`);
  const have = new Set((existing ?? []).map((r) => r.shopify_product_id as string));
  const missing = ((onboarding?.selected as string[] | undefined) ?? []).filter((id) => !have.has(id));
  if (!missing.length) return 0;

  const conn = await getShopifyConnection(userId);
  if (!conn || conn.status !== "connected") return 0;
  const { market } = await getMarket(userId, conn);

  let created = 0;
  for (const id of missing) {
    try {
      const node = await fetchDetail(conn, id);
      if (!node) continue;
      if (await insertProduct(userId, node, market.currency)) created++;
    } catch (e) {
      console.error(`[products/sync] producto ${id}`, e);
      if (e instanceof ShopifyAuthError) break;
    }
  }
  return created;
}

// ---------------------------------------------------------------- Sincronizar (botón en Productos)

const IDS_PER_PAGE = 250;
const DETAIL_BATCH = 10;
/** Tope de productos nuevos por toque: una tienda grande se completa en varios toques. */
const IMPORT_PER_RUN = 50;

export class ShopifyNotConnectedError extends Error {}

export interface SyncResult {
  created: number;
  deleted: number;
  /** Productos activos que faltan por traer (quedan para el próximo toque). */
  pending: number;
}

/** Todos los productos de la tienda (id numérico → estado). Lanza si no se pudo leer completo. */
async function listShopifyProducts(conn: ShopifyConnection): Promise<Map<string, string>> {
  const all = new Map<string, string>();
  let after: string | null = null;
  for (;;) {
    const data: ProductIdsQuery = await shopifyQuery<ProductIdsQuery>(conn, PRODUCT_IDS_QUERY, { first: IDS_PER_PAGE, after });
    for (const n of data.products.nodes) all.set(numericId(n.id), n.status);
    if (!data.products.pageInfo.hasNextPage) return all;
    after = data.products.pageInfo.endCursor;
  }
}

async function fetchDetails(conn: ShopifyConnection, ids: string[]): Promise<ProductDetailNode[]> {
  const vars = { ids: ids.map((id) => `gid://shopify/Product/${id}`) };
  let data: ProductsDetailQuery;
  try {
    data = await shopifyQuery<ProductsDetailQuery>(conn, PRODUCTS_DETAIL_QUERY(true), vars);
  } catch (e) {
    if (!(e instanceof ShopifyAuthError)) throw e;
    data = await shopifyQuery<ProductsDetailQuery>(conn, PRODUCTS_DETAIL_QUERY(false), vars);
  }
  return data.nodes.filter((n): n is ProductDetailNode => !!n && "id" in n);
}

/**
 * Deja products igual a la tienda: trae los productos activos que aún no están y borra, con todo lo
 * suyo (lib/products/delete.ts), los que ya no existen en Shopify. Solo se borra con la lista de
 * Shopify leída completa: si una página falla, no se borra nada.
 */
export async function syncShopifyProducts(userId: string): Promise<SyncResult> {
  const conn = await getShopifyConnection(userId);
  if (!conn || conn.status !== "connected") throw new ShopifyNotConnectedError();
  const db = adminClient();

  const remote = await listShopifyProducts(conn);
  const { data: local, error } = await db.from("products").select("id, shopify_product_id").eq("user_id", userId);
  if (error) throw new Error(`Leer los productos: ${error.message}`);
  const have = new Set((local ?? []).map((r) => r.shopify_product_id as string));

  // 1. Eliminados en Shopify (en cualquier estado: un borrador o archivado no cuenta como eliminado).
  const gone = (local ?? []).filter((r) => !remote.has(r.shopify_product_id as string));
  const deleted = await deleteProducts(userId, gone.map((r) => r.id as string));
  const { data: mirror } = await db.from("catalog_items").select("id").eq("user_id", userId);
  await forgetCatalogItems(userId, (mirror ?? []).map((r) => r.id as string).filter((id) => !remote.has(id)));

  // 2. Activos que aún no están.
  const missing = [...remote].filter(([id, status]) => status === "ACTIVE" && !have.has(id)).map(([id]) => id);
  const batch = missing.slice(0, IMPORT_PER_RUN);
  const { market } = await getMarket(userId, conn);
  let created = 0;
  for (let i = 0; i < batch.length; i += DETAIL_BATCH) {
    for (const node of await fetchDetails(conn, batch.slice(i, i + DETAIL_BATCH))) {
      try {
        if (await insertProduct(userId, node, market.currency)) created++;
      } catch (e) {
        console.error(`[products/sync] producto ${node.id}`, e);
      }
    }
  }
  return { created, deleted, pending: missing.length - batch.length };
}
