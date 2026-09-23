import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { REFERENCES_BUCKET } from "./store";

// Borrado completo de un producto (CLAUDE.md › Datos › Productos eliminados en Shopify): archivos en
// Storage, filas propias y en cascada (imágenes de referencia, corridas, fichas, clientes ideales,
// reseñas importadas con sus listados e importaciones),
// el registro de costo de IA y su rastro en el catálogo del onboarding. Nada queda huérfano.
//
// Orden: primero Storage, después la base. Si Storage falla, la fila del producto sigue ahí y la
// próxima sincronización lo vuelve a intentar; al revés quedarían archivos sin dueño para siempre.

const LIST_PAGE = 1000;
const REMOVE_BATCH = 100;

/** Todas las rutas bajo <user_id>/<product_id>/ (incluye subidas firmadas que nunca se confirmaron). */
async function storedPaths(userId: string, productId: string): Promise<string[]> {
  const bucket = adminClient().storage.from(REFERENCES_BUCKET);
  const prefix = `${userId}/${productId}`;
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: LIST_PAGE, offset });
    if (error) throw new Error(`Listar archivos de ${productId}: ${error.message}`);
    for (const f of data ?? []) if (f.id) paths.push(`${prefix}/${f.name}`);
    if (!data || data.length < LIST_PAGE) return paths;
  }
}

async function removeFiles(userId: string, productId: string) {
  const db = adminClient();
  const { data: rows, error } = await db
    .from("product_reference_images")
    .select("storage_path")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .not("storage_path", "is", null);
  if (error) throw new Error(`Leer imágenes de ${productId}: ${error.message}`);
  // Fotos de reseñas (lib/reviews/store.ts): viven bajo el mismo prefijo; se nombran también por si acaso.
  const { data: reviews, error: reviewsError } = await db.from("product_reviews").select("photos").eq("user_id", userId).eq("product_id", productId);
  if (reviewsError) throw new Error(`Leer reseñas de ${productId}: ${reviewsError.message}`);
  const reviewPaths = (reviews ?? []).flatMap((r) => ((r.photos ?? []) as { path: string }[]).map((p) => p.path));
  const paths = [...new Set([...(await storedPaths(userId, productId)), ...(rows ?? []).map((r) => r.storage_path as string), ...reviewPaths])];
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const { error: rmError } = await db.storage.from(REFERENCES_BUCKET).remove(paths.slice(i, i + REMOVE_BATCH));
    if (rmError) throw new Error(`Borrar archivos de ${productId}: ${rmError.message}`);
  }
}

/**
 * Borra los productos indicados y todo lo que cuelga de ellos. Devuelve cuántos se borraron; un
 * producto que falla se salta (queda para la próxima vez) sin frenar a los demás.
 */
export async function deleteProducts(userId: string, productIds: string[]): Promise<number> {
  const db = adminClient();
  let deleted = 0;
  for (const id of productIds) {
    try {
      await removeFiles(userId, id);
      // ai_generations tiene "on delete set null": se borra antes para no dejar filas sueltas.
      const gen = await db.from("ai_generations").delete().eq("user_id", userId).eq("product_id", id);
      if (gen.error) throw new Error(`Borrar generaciones de ${id}: ${gen.error.message}`);
      // La cascada se lleva product_reference_images, pipeline_runs, product_briefs, customer_avatars,
      // product_pricing, pack_labels, review_sources, review_imports y product_reviews.
      const { data, error } = await db.from("products").delete().eq("user_id", userId).eq("id", id).select("shopify_product_id");
      if (error) throw new Error(`Borrar el producto ${id}: ${error.message}`);
      const shopifyId = data?.[0]?.shopify_product_id as string | undefined;
      if (shopifyId) await forgetCatalogItems(userId, [shopifyId]);
      deleted++;
    } catch (e) {
      console.error("[products/delete]", id, e);
    }
  }
  return deleted;
}

/** Saca del espejo del catálogo y de la selección del onboarding los ids de Shopify que ya no existen. */
export async function forgetCatalogItems(userId: string, shopifyIds: string[]) {
  if (!shopifyIds.length) return;
  const db = adminClient();
  const { error } = await db.from("catalog_items").delete().eq("user_id", userId).in("id", shopifyIds);
  if (error) throw new Error(`Borrar del catálogo: ${error.message}`);
  const { data: ob, error: obError } = await db.from("onboarding").select("selected").eq("user_id", userId).maybeSingle();
  if (obError) throw new Error(`Leer la selección: ${obError.message}`);
  const selected = (ob?.selected as string[] | undefined) ?? [];
  const gone = new Set(shopifyIds);
  if (selected.some((id) => gone.has(id))) {
    const { error: upError } = await db
      .from("onboarding")
      .update({ selected: selected.filter((id) => !gone.has(id)) })
      .eq("user_id", userId);
    if (upError) throw new Error(`Actualizar la selección: ${upError.message}`);
  }
}
