// Reglas de las etiquetas de los packs (lo que propone la IA y lo que edita el comerciante). Puro.
import type { PackLabel } from "@/lib/ai/schemas";
import type { PricingPlan } from "./plan";

export const MAX_LABEL_CHARS = 40;
export const MAX_SUPPORT_CHARS = 60;
export const MAX_BADGE_CHARS = 20;

const clean = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Una etiqueta por pack del plan, en su orden; descarta packs que no existen y duplicados, recorta
 * largos y deja un solo distintivo (el primero): si todos dicen “Más elegido”, ninguno lo es.
 */
export function normalizePackLabels(labels: PackLabel[], packs: { units: number }[]): PackLabel[] {
  const out: PackLabel[] = [];
  let badgeUsed = false;
  for (const pack of packs) {
    const l = labels.find((x) => x.units === pack.units);
    if (!l) continue;
    const label = clean(l.label, MAX_LABEL_CHARS);
    if (!label) continue;
    let badge = clean(l.badge, MAX_BADGE_CHARS);
    if (badge && badgeUsed) badge = null;
    if (badge) badgeUsed = true;
    out.push({ ...l, units: pack.units, label, support: clean(l.support, MAX_SUPPORT_CHARS), badge, reason: l.reason.trim() });
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
