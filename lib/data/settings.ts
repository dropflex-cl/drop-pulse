// Supuestos del comerciante (Ajustes). Los supuestos, valores de ejemplo; el mercado, de Supabase.
import "server-only";
import { listTemplates } from "@/lib/ads/store";
import { adminClient } from "@/lib/integrations/admin";
import { getHiggsfieldConnection } from "@/lib/integrations/higgsfield/connection";
import { getMetaConnection } from "@/lib/integrations/meta/connection";
import { sessionUser } from "@/lib/integrations/session";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { getMarket } from "@/lib/settings/market";
import type { Assumptions } from "@/lib/types";

export async function getAssumptions(): Promise<Assumptions> {
  return { deliveryRate: 80, maxCpa: 6000, store: "tutienda.cl", metaAccount: "Cuenta publicitaria de Meta" };
}

/** Mercado del comerciante; null sin Shopify conectado (no hay de dónde detectarlo). */
export async function getMarketSettings() {
  const user = await sessionUser();
  if (!user) return null;
  const conn = await getShopifyConnection(user.id);
  if (!conn || conn.status !== "connected") return null;
  const { market, confirmed } = await getMarket(user.id, conn);
  return { value: { countryCode: market.countryCode, currency: market.currency, language: market.language }, confirmed };
}

/** Ajustes › Campañas: el tope de gasto diario y las plantillas propias. */
export async function getAdSettings() {
  const user = await sessionUser();
  if (!user) return null;
  const [{ data }, meta, templates] = await Promise.all([
    adminClient().from("merchant_settings").select("ad_daily_spend_cap, currency").eq("user_id", user.id).maybeSingle(),
    getMetaConnection(user.id),
    listTemplates(user.id),
  ]);
  const row = data as { ad_daily_spend_cap: number | string | null; currency: string } | null;
  return { spendCap: row?.ad_daily_spend_cap == null ? null : Number(row.ad_daily_spend_cap), currency: meta?.ad_account_currency?.trim() || row?.currency || "CLP", templates };
}

/** Ajustes › Higgsfield: la clave propia del comerciante (solo lo visible; la clave vive en Vault). */
export async function getHiggsfieldSettings() {
  const user = await sessionUser();
  if (!user) return null;
  const conn = await getHiggsfieldConnection(user.id);
  return conn ? { keyHint: conn.key_hint, status: conn.status, error: conn.last_error } : { keyHint: null, status: null, error: null };
}
