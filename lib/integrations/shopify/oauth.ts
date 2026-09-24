import "server-only";
import { createHmac } from "node:crypto";
import { OnboardingError } from "@/lib/onboarding/types";
import { shopifyEnv } from "../env";
import { safeEqual } from "../oauth-state";

// OAuth de Shopify para una app pública NO embebida con instalación administrada (spec §5.1–5.3).
// Portado de dropflex (lib/integrations/shopify/oauth.ts) con estas correcciones:
// - una sola lista de alcances, igual a shopify.app.toml, y se exigen todas (falla 5);
// - se valida el `timestamp` de las peticiones firmadas (falla 11);
// - tokens offline que vencen (`expiring: 1`) con refresh token (falla 8);
// - timeout en cada llamada (falla 10).

/** Debe coincidir con [access_scopes] de shopify.app.toml y shopify.app.dev.toml. */
/** Lo mínimo para conectar la tienda e importar el catálogo (sin estos el callback falla). */
export const CONNECT_SCOPES = ["read_products", "write_products", "read_inventory", "read_orders"] as const;
/**
 * Lo que necesita «Publicar»: write_themes para instalar, actualizar y publicar el tema de DropFlex;
 * write_files para subir las imágenes de la página a Shopify Files. Una tienda conectada antes no
 * los tiene: Publicar lo detecta (`missingPublishScopes`) y pide volver a dar permisos.
 * write_inventory apaga el seguimiento de inventario de las variantes publicadas (SELLABLE en
 * lib/shopify/publish/mapping.ts): sin él Shopify rechaza el productSet entero.
 */
export const PUBLISH_SCOPES = ["read_themes", "write_themes", "read_files", "write_files", "write_inventory"] as const;
/** Todo lo que se pide al autorizar. Debe coincidir con shopify.app.toml y shopify.app.dev.toml. */
export const SHOPIFY_SCOPES = [...CONNECT_SCOPES, ...PUBLISH_SCOPES] as const;

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const TIMESTAMP_WINDOW_S = 10 * 60;
const TIMEOUT_MS = 15_000;

export function isShopDomain(shop: string | null | undefined): shop is string {
  return typeof shop === "string" && shop.length <= 100 && SHOP_RE.test(shop);
}

/** “mitienda”, “mitienda.myshopify.com” o la URL completa → “mitienda.myshopify.com”. */
export function normalizeShop(input: string): string {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.myshopify\.com$/, "");
  if (!raw) throw new OnboardingError("Escribe la dirección de tu tienda.", 400, "shop");
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(raw)) {
    throw new OnboardingError("Usa solo letras, números y guiones, como en mitienda.myshopify.com.", 400, "shop");
  }
  return `${raw}.myshopify.com`;
}

/**
 * ¿Existe la tienda? Atajo para el error de campo “No encontramos esa tienda”: solo un 404 cuenta
 * como “no existe”. Si la red falla, se deja seguir; Shopify lo dirá en su propia pantalla.
 */
export async function shopExists(shop: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${shop}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5_000) });
    return res.status !== 404;
  } catch {
    return true;
  }
}

export function authorizeUrl(shop: string, state: string): string {
  const { apiKey, redirectUri } = shopifyEnv();
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", apiKey);
  // Con instalación administrada valen los alcances del toml; se envían igual por si la tienda
  // llega sin haber instalado (camino O2) y para que ambos caminos pidan lo mismo.
  url.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  // Sin grant_options[]=per-user: token offline (de la tienda), no de un empleado.
  return url.toString();
}

/** Mensaje firmado: parámetros ordenados sin `hmac` ni `signature`, `k=v` unidos por `&`. */
function hmacMessage(params: URLSearchParams): string {
  const keys = [...new Set(params.keys())].filter((k) => k !== "hmac" && k !== "signature").sort();
  return keys.map((k) => `${k}=${params.getAll(k).join(",")}`).join("&");
}

/**
 * Valida una petición firmada por Shopify (lanzamiento de la App URL o callback de OAuth):
 * HMAC-SHA256 en hex con el client secret, en tiempo constante, y `timestamp` dentro de 10 min.
 */
export function verifyShopifyRequest(params: URLSearchParams, now = Date.now()): boolean {
  const hmac = params.get("hmac");
  const ts = Number(params.get("timestamp"));
  if (!hmac || !Number.isFinite(ts)) return false;
  if (Math.abs(now / 1000 - ts) > TIMESTAMP_WINDOW_S) return false;
  const expected = createHmac("sha256", shopifyEnv().apiSecret).update(hmacMessage(params)).digest("hex");
  return safeEqual(expected, hmac);
}

export interface ShopifyToken {
  accessToken: string;
  scopes: string[];
  /** null = token offline sin vencimiento. */
  expiresAt: Date | null;
  refreshToken: string | null;
}

export class ShopifyTokenError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

interface TokenResponse {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
}

async function tokenRequest(shop: string, body: Record<string, string | number>): Promise<ShopifyToken> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // El cuerpo puede traer el motivo, pero nunca se loguea (podría traer el token).
  if (!res.ok) throw new ShopifyTokenError(`Shopify respondió ${res.status} al pedir el token`, res.status);
  const data = (await res.json()) as TokenResponse;
  if (!data.access_token) throw new ShopifyTokenError("Shopify no devolvió un token", 502);
  return {
    accessToken: data.access_token,
    scopes: (data.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    expiresAt: typeof data.expires_in === "number" ? new Date(Date.now() + data.expires_in * 1000) : null,
    refreshToken: data.refresh_token ?? null,
  };
}

/**
 * Canjea el `code` por un token offline que vence (`expiring: 1`): la documentación vigente de Shopify
 * lo exige a las apps públicas nuevas y devuelve un refresh token junto al de acceso.
 */
export function exchangeCode(shop: string, code: string): Promise<ShopifyToken> {
  const { apiKey, apiSecret } = shopifyEnv();
  return tokenRequest(shop, { client_id: apiKey, client_secret: apiSecret, code, expiring: 1 });
}

/** Renueva el token de acceso con el refresh token (verifica los campos en la documentación vigente). */
export function refreshAccessToken(shop: string, refreshToken: string): Promise<ShopifyToken> {
  const { apiKey, apiSecret } = shopifyEnv();
  return tokenRequest(shop, { client_id: apiKey, client_secret: apiSecret, grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Alcances que faltan. Algunos implican otros (write_products ⊃ read_products). */
function grantedSet(granted: string[]) {
  const has = new Set(granted);
  for (const s of granted) if (s.startsWith("write_")) has.add(`read_${s.slice(6)}`);
  return has;
}

/** Los que faltan para conectar (el callback falla sin ellos). */
export function missingScopes(granted: string[]): string[] {
  const has = grantedSet(granted);
  return CONNECT_SCOPES.filter((s) => !has.has(s));
}

/** Los que faltan para publicar (tema y archivos). */
export function missingPublishScopes(granted: string[]): string[] {
  const has = grantedSet(granted);
  return PUBLISH_SCOPES.filter((s) => !has.has(s));
}
