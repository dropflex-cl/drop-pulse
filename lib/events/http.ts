// Rutas /api/events/*: el evento del calendario, la sesión y la zona horaria de la tienda (las
// fechas de los campos se leen en esa zona). Mismo contrato de errores que /api/products.
import "server-only";
import { requireUser } from "@/lib/integrations/session";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { DEFAULT_MARKET } from "@/lib/market";
import { ProductApiError } from "@/lib/products/http";
import { getMarket } from "@/lib/settings/market";
import { getEventBySlug } from "./store";

export async function eventRequest(slug: string) {
  const user = await requireUser();
  const event = await getEventBySlug(slug);
  if (!event) throw new ProductApiError("No encontramos ese evento.", 404);
  const { market } = await getMarket(user.id, await getShopifyConnection(user.id));
  return { userId: user.id, event, timezone: market.timezone ?? DEFAULT_MARKET.timezone! };
}
