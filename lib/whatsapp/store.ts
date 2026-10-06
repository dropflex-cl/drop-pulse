import { createContextRepository, contextAccess } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { selectVariant } from "@/lib/copy/variants";
// Etapa WhatsApp: los datos que completan los mensajes (la tienda, el producto, el precio y los packs,
// Ajustes › Envíos y políticas) y el consejo de uso guardado en `products.usage_tip`.
import { LISTING, type Listing } from "@/lib/copy/listing";
import { currentContent } from "@/lib/copy/store";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { getPricingPlan } from "@/lib/pricing/store";
import { type ProductRow } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";
import { deliveryDays } from "@/lib/settings/policies";
import { getStorePolicies } from "@/lib/settings/policies-store";
import type { MessagesState } from "@/lib/types";
import "server-only";

/** El nombre corto de la ficha aprobada (Página del producto), o null. */
async function approvedShortName(userId: string, productId: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("page_components")
    .select("content, proposal")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("component", LISTING)
    .eq("status", "approved")
    .is("superseded_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Leer la ficha del producto: ${error.message}`);
  const listing = data ? (selectVariant(currentContent(data)).content as Partial<Listing> | null) : null;
  return listing?.short_name?.trim() || null;
}

export async function messagesState(userId: string, row: ProductRow): Promise<MessagesState> {
  const [shop, settings, pricing, shortName, tipRead] = await Promise.all([
    getShopifyConnection(userId),
    getStorePolicies(userId),
    getPricingPlan(userId, row.id),
    approvedShortName(userId, row.id),
    createContextRepository().loadTipReview!({ p_access: contextAccess({ userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES }), p_product_id: row.id }, AbortSignal.timeout(10000)) as Promise<{ content_etag: string; usable: boolean; current: import("./tip").UsageTip | null }>,
  ]);
  const { market } = await getMarket(userId, shop);
  const p = settings?.policies;
  const days = p ? deliveryDays(p) : null;
  const price = Number(row.price);
  const tip = tipRead.current;
  return {
    facts: {
      store: shop?.shop_name?.trim() || null,
      product: shortName ?? row.title,
      currency: pricing?.currency ?? row.currency,
      packs: pricing ? pricing.packs.map((k) => ({ units: k.units, price: k.price })) : price > 0 ? [{ units: 1, price }] : [],
      delivery: days ? { ...days, businessDays: p!.businessDaysOnly } : null,
      returnDays: p?.returnDays ?? null,
      warrantyMonths: p?.warrantyMonths ?? null,
      countryCode: market.countryCode,
      tip: tipRead.usable ? tip?.text ?? null : null,
    },
    tip: tip ? { text: tip.text, basis: tip.basis, createdAt: tip.created_at, usable: tipRead.usable, etag: tipRead.content_etag } : null,
    tipBlocked: null,
  };
}
