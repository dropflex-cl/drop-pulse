import "server-only";
import { OnboardingError } from "@/lib/onboarding/types";
import { deleteAllProducts } from "@/lib/products/delete";
import type { ConnectionErrorCode } from "@/lib/onboarding/errors";
import { adminClient } from "../admin";
import { deleteToken, setToken } from "../tokens";
import type { ShopifyToken } from "./oauth";

// Fila de shopify_connections y sus transiciones. Todo con service_role: el cliente nunca escribe aquí.

export interface ShopifyConnection {
  user_id: string;
  shop_domain: string;
  shop_gid: string | null;
  shop_name: string | null;
  currency: string | null;
  /** País y zona horaria que Shopify tiene para la tienda (lib/integrations/shopify/market.ts). */
  country_code: string | null;
  timezone: string | null;
  scopes: string[];
  status: "connecting" | "action" | "connected" | "error" | "revoked";
  error_code: string | null;
  token_expires_at: string | null;
  import_status: "pending" | "importing" | "complete" | "failed";
  import_cursor: string | null;
  imported_count: number;
  total_count: number | null;
  import_lease_until: string | null;
  orders_synced_at: string | null;
  connected_at: string | null;
  uninstalled_at: string | null;
}

const TABLE = "shopify_connections";

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function getShopifyConnection(userId: string): Promise<ShopifyConnection | null> {
  const { data, error } = await adminClient().from(TABLE).select("*").eq("user_id", userId).maybeSingle();
  fail("Leer la conexión de Shopify", error);
  return data as ShopifyConnection | null;
}

export async function findByShop(shop: string): Promise<ShopifyConnection | null> {
  const { data, error } = await adminClient().from(TABLE).select("*").eq("shop_domain", shop).maybeSingle();
  fail("Buscar la tienda", error);
  return data as ShopifyConnection | null;
}

/** Una tienda = un comerciante: si ya está vinculada a otro usuario, no se toma (falla 4 del spec). */
export async function assertShopAvailable(userId: string, shop: string) {
  const owner = await findByShop(shop);
  if (owner && owner.user_id !== userId) {
    throw new OnboardingError("Esa tienda ya está conectada a otra cuenta de DropFlex. Entra con esa cuenta o escríbenos.", 409, "shop");
  }
}

/**
 * Los productos de una tienda que se va, con `deleteProducts` (CLAUDE.md › Datos): campañas pausadas
 * en Meta, archivos de los 4 buckets y costo de IA. Un `delete` directo sobre `products` los dejaría
 * sueltos. Si alguno falla, lanza antes de tocar lo demás: se puede reintentar sin perder el rastro.
 */
async function forgetShopProducts(userId: string) {
  try {
    await deleteAllProducts(userId);
  } catch (e) {
    console.error("[shopify/connection] borrar productos", userId, e);
    throw new OnboardingError("No pudimos borrar los productos de tu tienda anterior. Vuelve a intentarlo en unos minutos.", 503, "shop");
  }
}

/** Se borra lo importado de otra tienda si el comerciante cambia de dirección. */
async function forgetOtherShop(userId: string, shop: string) {
  const current = await getShopifyConnection(userId);
  if (!current || current.shop_domain === shop) return;
  const db = adminClient();
  // Los productos y el mercado eran de la otra tienda. Primero los productos: si fallan, no se toca nada más.
  await forgetShopProducts(userId);
  fail("Borrar el catálogo anterior", (await db.from("catalog_items").delete().eq("user_id", userId)).error);
  fail("Reiniciar la selección", (await db.from("onboarding").update({ selected: [], generation: null }).eq("user_id", userId)).error);
  fail("Olvidar el mercado anterior", (await db.from("merchant_settings").delete().eq("user_id", userId)).error);
  await deleteToken("shopify", userId);
  await deleteToken("shopify_refresh", userId);
}

/** Paso previo al salto a Shopify: queda `connecting` con la tienda pedida. */
export async function markConnecting(userId: string, shop: string) {
  const current = await getShopifyConnection(userId);
  // Reautorizar la misma tienda ya conectada no la baja a “conectando” mientras el usuario está en Shopify.
  if (current?.shop_domain === shop && current.status === "connected") return;
  await forgetOtherShop(userId, shop);
  const { error } = await adminClient()
    .from(TABLE)
    .upsert(
      { user_id: userId, shop_domain: shop, status: "connecting", error_code: null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  // unique(shop_domain): otro usuario la tomó entre el chequeo y el upsert.
  if (error?.code === "23505") throw new OnboardingError("Esa tienda ya está conectada a otra cuenta de DropFlex. Entra con esa cuenta o escríbenos.", 409, "shop");
  fail("Guardar la conexión de Shopify", error);
}

export async function markShopifyError(userId: string, code: ConnectionErrorCode) {
  const { error } = await adminClient()
    .from(TABLE)
    .update({ status: "error", error_code: code, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  fail("Guardar el error de Shopify", error);
}

/** Token guardado en Vault y conexión lista para importar. */
export async function markConnected(
  userId: string,
  shop: string,
  token: ShopifyToken,
  info: { gid: string; name: string; currency: string; total: number },
) {
  await forgetOtherShop(userId, shop);
  await setToken("shopify", userId, token.accessToken);
  if (token.refreshToken) await setToken("shopify_refresh", userId, token.refreshToken);
  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        shop_domain: shop,
        shop_gid: info.gid,
        shop_name: info.name,
        currency: info.currency,
        country_code: null,
        timezone: null,
        scopes: token.scopes,
        status: "connected",
        error_code: null,
        token_expires_at: token.expiresAt?.toISOString() ?? null,
        import_status: "importing",
        import_cursor: null,
        imported_count: 0,
        total_count: info.total,
        import_lease_until: null,
        connected_at: now,
        uninstalled_at: null,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
  if (error?.code === "23505") throw new OnboardingError("Esa tienda ya está conectada a otra cuenta de DropFlex. Entra con esa cuenta o escríbenos.", 409, "shop");
  fail("Guardar la conexión de Shopify", error);
}

export async function saveRefreshedToken(userId: string, token: ShopifyToken) {
  await setToken("shopify", userId, token.accessToken);
  if (token.refreshToken) await setToken("shopify_refresh", userId, token.refreshToken);
  const { error } = await adminClient()
    .from(TABLE)
    .update({ token_expires_at: token.expiresAt?.toISOString() ?? null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  fail("Guardar el token renovado", error);
}

/** app/uninstalled o “Desconectar”: sin token, estado `revoked`. Lo importado se conserva. */
export async function revokeShopify(userId: string, code: "revoked" | "disconnected" = "revoked") {
  await deleteToken("shopify", userId);
  await deleteToken("shopify_refresh", userId);
  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from(TABLE)
    .update({ status: "revoked", error_code: code, uninstalled_at: now, import_lease_until: null, updated_at: now })
    .eq("user_id", userId);
  fail("Marcar la tienda como desconectada", error);
}

/** shop/redact (48 h después de desinstalar): se borra todo lo de esa tienda. */
export async function redactShop(shop: string) {
  const conn = await findByShop(shop);
  if (!conn) return;
  const db = adminClient();
  // Primero los productos con todo lo que cuelga de ellos (en cascada: publicaciones y caché de
  // shopify_files). Si fallan, se lanza con la conexión todavía en pie para no perder el rastro.
  await deleteAllProducts(conn.user_id);
  await deleteToken("shopify", conn.user_id);
  await deleteToken("shopify_refresh", conn.user_id);
  fail("Borrar el catálogo", (await db.from("catalog_items").delete().eq("user_id", conn.user_id)).error);
  fail("Reiniciar la selección", (await db.from("onboarding").update({ selected: [], generation: null }).eq("user_id", conn.user_id)).error);
  fail("Borrar el tema instalado", (await db.from("shopify_theme_installations").delete().eq("user_id", conn.user_id).eq("shop_domain", shop)).error);
  fail("Borrar la conexión", (await db.from(TABLE).delete().eq("user_id", conn.user_id)).error);
}
