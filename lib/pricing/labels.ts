// Reglas de las etiquetas de los packs (lo que propone la IA y lo que edita el comerciante). Puro.
import type { PackLabel } from "@/lib/ai/schemas";
import type { PricingPlan } from "./plan";

/**
 * Largo recomendado (lo que se le pide a la IA y lo que marca el contador) y tope duro (solo para no
 * guardar un párrafo). Nunca se corta en el largo recomendado: una etiqueta a mitad de palabra
 * (“nunca sin”) es peor que una un poco larga, que el comerciante decide si acorta.
 */
export const LABEL_CHARS = { recommended: 40, max: 80 };
export const SUPPORT_CHARS = { recommended: 40, max: 100 };
export const BADGE_CHARS = { recommended: 16, max: 30 };

/** Espacios normalizados; si pasa el tope duro, se corta en la última palabra completa. */
const clean = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return (cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut).replace(/[\s,;:·-]+$/, "");
};

/**
 * Una etiqueta por pack del plan, en su orden; descarta packs que no existen y duplicados, recorta
 * solo lo que pasa el tope duro (en palabra completa) y deja un solo distintivo (el primero): si todos dicen “Más elegido”, ninguno lo es.
 */
export function normalizePackLabels(labels: PackLabel[], packs: { units: number }[]): PackLabel[] {
  const out: PackLabel[] = [];
  let badgeUsed = false;
  for (const pack of packs) {
    const l = labels.find((x) => x.units === pack.units);
    if (!l) continue;
    const label = clean(l.label, LABEL_CHARS.max);
    if (!label) continue;
    let badge = clean(l.badge, BADGE_CHARS.max);
    if (badge && badgeUsed) badge = null;
    if (badge) badgeUsed = true;
    out.push({ ...l, units: pack.units, label, support: clean(l.support, SUPPORT_CHARS.max), badge, reason: l.reason.trim() });
  }
  return out;
}

/** Precios de los packs cuando se generaron las etiquetas. */
export const packPrices = (plan: Pick<PricingPlan, "packs">) => plan.packs.map((p) => ({ units: p.units, price: p.price }));

/** ¿Cambiaron los precios desde que se generaron? (“3 al precio de 2” puede haber dejado de ser cierto). */
export function labelsStale(prices: { units: number; price: number }[], plan: Pick<PricingPlan, "packs"> | null | undefined): boolean {
  if (!plan || !prices.length) return false;
  return plan.packs.some((p) => prices.find((x) => x.units === p.units)?.price !== p.price);
}
