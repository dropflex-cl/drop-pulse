// Lectura de insights de Meta → métricas del dominio (docs/spec-anuncios.md §6.1). Portado de dropflex
// (lib/ads/meta/mappers.ts), con alcance, frecuencia, CPM, clics en el enlace y nivel de anuncio.
// Meta manda los números como texto y las acciones como listas por `action_type`. Puro.

export type InsightLevel = "campaign" | "adset" | "ad";

/** La compra del píxel (el evento que optimizan las campañas). */
const PURCHASE_ACTION = "omni_purchase";

/**
 * «Pagos iniciados»: el comprador tocó comprar en el formulario contra entrega. Meta reporta el mismo
 * evento con varios nombres (el agregado `omni_`, el nombre suelto y el del píxel), así que cada
 * familia se lee por su primer alias presente, nunca sumando alias. Cuentan dos familias porque el
 * formulario puede disparar InitiateCheckout o AddPaymentInfo; si dispara las dos, sumar contaría
 * dos veces al mismo comprador: se toma el MÁXIMO.
 */
const INITIATED_CHECKOUT_ALIASES = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"] as const;
const ADD_PAYMENT_INFO_ALIASES = ["omni_add_payment_info", "add_payment_info", "offsite_conversion.fb_pixel_add_payment_info"] as const;

/** Campos pedidos a `/insights`. */
export const INSIGHT_FIELDS = [
  "campaign_id",
  "adset_id",
  "ad_id",
  "spend",
  "impressions",
  "reach",
  "inline_link_clicks",
  "cpm",
  "actions",
  "action_values",
  "date_start",
] as const;

/** Las métricas de una unidad en un período (un día, o lo acumulado). */
export interface Metrics {
  spend: number;
  impressions: number;
  reach: number;
  /** Clics en el enlace. */
  clicks: number;
  purchases: number;
  purchase_value: number;
  initiated_checkouts: number;
}

/** Las métricas con lo calculado: CTR (en %), CPC, CPM, CPA y ROAS; null cuando no hay base. */
export interface DerivedMetrics extends Metrics {
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
}

export interface InsightRow extends Metrics {
  level: InsightLevel;
  /** El id de Meta de la unidad (campaña, conjunto o anuncio). */
  metaId: string;
  date: string;
}

export const EMPTY_METRICS: Metrics = { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, purchase_value: 0, initiated_checkouts: 0 };

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** El valor de un `action_type` en una lista de acciones o valores. */
function actionEntry(arr: unknown, actionType: string): number | null {
  if (!Array.isArray(arr)) return null;
  for (const e of arr) {
    if (e && typeof e === "object" && (e as { action_type?: string }).action_type === actionType) return numOrNull((e as { value?: unknown }).value);
  }
  return null;
}

function familyEntry(arr: unknown, aliases: readonly string[]): number | null {
  for (const alias of aliases) {
    const v = actionEntry(arr, alias);
    if (v != null) return v;
  }
  return null;
}

/** Compradores que llegaron al formulario (máximo entre las dos familias, no la suma). */
export function initiatedCheckoutsOf(actions: unknown): number {
  const checkout = familyEntry(actions, INITIATED_CHECKOUT_ALIASES) ?? 0;
  const payment = familyEntry(actions, ADD_PAYMENT_INFO_ALIASES) ?? 0;
  return Math.max(checkout, payment);
}

/** Una fila cruda de insights (un día de una unidad) → dominio. */
export function toInsightRow(raw: Record<string, unknown>, level: InsightLevel): InsightRow {
  const metaId = String((level === "ad" ? raw.ad_id : level === "adset" ? raw.adset_id : raw.campaign_id) ?? "");
  return {
    level,
    metaId,
    date: String(raw.date_start ?? ""),
    spend: num(raw.spend),
    impressions: Math.round(num(raw.impressions)),
    reach: Math.round(num(raw.reach)),
    clicks: Math.round(num(raw.inline_link_clicks)),
    purchases: Math.round(actionEntry(raw.actions, PURCHASE_ACTION) ?? 0),
    purchase_value: actionEntry(raw.action_values, PURCHASE_ACTION) ?? 0,
    initiated_checkouts: Math.round(initiatedCheckoutsOf(raw.actions)),
  };
}

/** Suma de métricas (el alcance se suma como aproximación: Meta no lo da acumulable por día). */
export function sumMetrics(rows: Metrics[]): Metrics {
  const out = { ...EMPTY_METRICS };
  for (const r of rows) {
    out.spend += r.spend;
    out.impressions += r.impressions;
    out.reach += r.reach;
    out.clicks += r.clicks;
    out.purchases += r.purchases;
    out.purchase_value += r.purchase_value;
    out.initiated_checkouts += r.initiated_checkouts;
  }
  return out;
}

/** CTR en % (clics en el enlace / impresiones), CPC, CPM, CPA = gasto / compras, ROAS = valor / gasto. */
export function derive(m: Metrics): DerivedMetrics {
  return {
    ...m,
    ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null,
    cpc: m.clicks > 0 ? m.spend / m.clicks : null,
    cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null,
    cpa: m.purchases > 0 ? m.spend / m.purchases : null,
    roas: m.spend > 0 ? m.purchase_value / m.spend : null,
  };
}
