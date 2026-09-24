// Envíos y políticas de la tienda (Ajustes › Envíos y políticas): lo que el comerciante declara y
// cómo viaja a la tienda (shop.metafields.dropflex.policies y .logistics, contrato en
// lib/shopify/components/define.ts › SHARED_METAFIELDS). Puro: lo usan la pantalla, el servidor y la
// publicación. Un dato vacío es «no lo ofrezco»: el componente que lo menciona no se muestra.

export interface StorePolicies {
  /** Envío gratis a todo el país (o desde `freeShippingThreshold`). */
  freeShipping: boolean;
  /** Monto desde el que el envío es gratis, en la moneda de la tienda; null = siempre gratis. */
  freeShippingThreshold: number | null;
  /** Días para cambios o devoluciones; null = no ofrece. */
  returnDays: number | null;
  /** Meses de garantía; null = no ofrece. */
  warrantyMonths: number | null;
  /** WhatsApp de atención, solo dígitos con código de país (56912345678); null = no ofrece. */
  whatsapp: string | null;
  /** Días hábiles que tarda en despachar. */
  handlingDays: number | null;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  /** Hora de corte (0–23) para despachar el mismo día. */
  cutoffHour: number | null;
  businessDaysOnly: boolean;
  saturdayDelivery: boolean;
}

export const EMPTY_POLICIES: StorePolicies = {
  freeShipping: true,
  freeShippingThreshold: null,
  returnDays: null,
  warrantyMonths: null,
  whatsapp: null,
  handlingDays: null,
  transitDaysMin: null,
  transitDaysMax: null,
  cutoffHour: null,
  businessDaysOnly: true,
  saturdayDelivery: false,
};

export type PolicyField = keyof StorePolicies;

const LIMITS: Partial<Record<PolicyField, [min: number, max: number]>> = {
  returnDays: [1, 365],
  warrantyMonths: [1, 120],
  handlingDays: [0, 30],
  transitDaysMin: [0, 60],
  transitDaysMax: [0, 60],
  cutoffHour: [0, 23],
};

/** Qué está mal, por campo, en frases simples. Vacío = se puede guardar. */
export function policyProblems(p: StorePolicies): Partial<Record<PolicyField, string>> {
  const out: Partial<Record<PolicyField, string>> = {};
  for (const [field, [min, max]] of Object.entries(LIMITS) as [PolicyField, [number, number]][]) {
    const v = p[field] as number | null;
    if (v == null) continue;
    if (!Number.isInteger(v) || v < min || v > max) out[field] = `Escribe un número entero entre ${min} y ${max}.`;
  }
  if (p.freeShippingThreshold != null && !(Number.isFinite(p.freeShippingThreshold) && p.freeShippingThreshold > 0)) {
    out.freeShippingThreshold = "Escribe un monto mayor que cero, o déjalo vacío si el envío es siempre gratis.";
  }
  if (p.whatsapp != null && !/^\d{8,15}$/.test(p.whatsapp)) out.whatsapp = "Escribe solo números, con el código del país (ej.: 56912345678).";
  if (p.transitDaysMin != null && p.transitDaysMax != null && p.transitDaysMin > p.transitDaysMax && !out.transitDaysMin) {
    out.transitDaysMax = "El máximo no puede ser menor que el mínimo.";
  }
  const transit = [p.transitDaysMin, p.transitDaysMax].filter((v) => v != null).length;
  if (transit === 1) out[p.transitDaysMin == null ? "transitDaysMin" : "transitDaysMax"] = "Completa el mínimo y el máximo, o deja los dos vacíos.";
  return out;
}

/** Solo dígitos: «+56 9 1234 5678» → «56912345678». */
export const cleanWhatsapp = (raw: string) => raw.replace(/\D/g, "") || null;

/**
 * shop.metafields.dropflex.policies (json). El pago al recibir es la operación de DropFlex: siempre.
 * `locale` es el idioma del mercado («es-CL»): las fechas de la tienda van en el idioma de los
 * textos, aunque el idioma de Shopify sea otro.
 */
export function policiesMetafield(p: StorePolicies, locale?: string | null) {
  return {
    cod: true,
    ...(locale ? { locale } : {}),
    free_shipping: p.freeShipping,
    ...(p.freeShipping && p.freeShippingThreshold ? { free_shipping_threshold: p.freeShippingThreshold } : {}),
    ...(p.returnDays ? { return_days: p.returnDays } : {}),
    ...(p.warrantyMonths ? { warranty_months: p.warrantyMonths } : {}),
    ...(p.whatsapp ? { whatsapp: p.whatsapp } : {}),
  };
}

/**
 * shop.metafields.dropflex.logistics (json), o null si faltan los plazos: sin ellos los
 * componentes ocultan lo que dice «llega en {min} a {max} días» (nunca un plazo inventado).
 */
export function logisticsMetafield(p: StorePolicies, timezone: string | null) {
  if (p.transitDaysMin == null || p.transitDaysMax == null) return null;
  return {
    handling_days: p.handlingDays ?? 0,
    transit_days_min: p.transitDaysMin,
    transit_days_max: p.transitDaysMax,
    ...(p.cutoffHour != null ? { cutoff_hour: p.cutoffHour } : {}),
    ...(timezone ? { timezone } : {}),
    business_days_only: p.businessDaysOnly,
    saturday_delivery: p.saturdayDelivery,
    holidays: [] as string[],
  };
}

/** Días hábiles de entrega (despacho + tránsito), como los calcula el Liquid; null sin plazos. */
export function deliveryDays(p: StorePolicies): { min: number; max: number } | null {
  if (p.transitDaysMin == null || p.transitDaysMax == null) return null;
  const h = p.handlingDays ?? 0;
  return { min: h + p.transitDaysMin, max: h + Math.max(p.transitDaysMin, p.transitDaysMax) };
}

/** Fila de merchant_settings → StorePolicies. */
export function fromRow(r: Record<string, unknown> | null): StorePolicies {
  if (!r) return EMPTY_POLICIES;
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    freeShipping: r.free_shipping !== false,
    freeShippingThreshold: n(r.free_shipping_threshold),
    returnDays: n(r.return_days),
    warrantyMonths: n(r.warranty_months),
    whatsapp: (r.whatsapp as string | null) ?? null,
    handlingDays: n(r.handling_days),
    transitDaysMin: n(r.transit_days_min),
    transitDaysMax: n(r.transit_days_max),
    cutoffHour: n(r.cutoff_hour),
    businessDaysOnly: r.business_days_only !== false,
    saturdayDelivery: r.saturday_delivery === true,
  };
}

/** StorePolicies → columnas de merchant_settings. */
export function toRow(p: StorePolicies) {
  return {
    free_shipping: p.freeShipping,
    free_shipping_threshold: p.freeShipping ? p.freeShippingThreshold : null,
    return_days: p.returnDays,
    warranty_months: p.warrantyMonths,
    whatsapp: p.whatsapp,
    handling_days: p.handlingDays,
    transit_days_min: p.transitDaysMin,
    transit_days_max: p.transitDaysMax,
    cutoff_hour: p.cutoffHour,
    business_days_only: p.businessDaysOnly,
    saturday_delivery: p.saturdayDelivery,
  };
}

/** «es» + «CL» → «es-CL» (lo que entiende Intl.DateTimeFormat). */
export const marketLocale = (language: string | null | undefined, country: string | null | undefined) =>
  language ? (country ? `${language.trim()}-${country.trim().toUpperCase()}` : language.trim()) : null;

export const POLICY_COLUMNS =
  "language, country_code, free_shipping, free_shipping_threshold, return_days, warranty_months, whatsapp, handling_days, transit_days_min, transit_days_max, cutoff_hour, business_days_only, saturday_delivery, timezone, currency";
