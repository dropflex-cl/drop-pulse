// Reglas compartidas del redactor de página y de otros pasos que escriben para el comprador
// (Creativos): los montos que se pueden nombrar, las palabras internas y las promesas prohibidas. Puro.

import { currencySymbol, parseAmount } from "@/lib/format";
import type { PricingPlan } from "@/lib/pricing/plan";

/** Bump cuando cambie el prompt o el esquema del redactor de página. */
export const COPY_PROMPT_VERSION = 4;

/** Palabras de trabajo que no pueden llegar a la tienda («según la ficha», «el ángulo principal»). */
export const INTERNAL = /(?<![\p{L}])(la ficha|ficha de producto|precio y oferta|cliente ideal|[áa]ngulo (principal|secundario))(?![\p{L}])/iu;

/** Promesas que la ley y Meta no permiten en productos de bienestar (el prompt da las alternativas). */
export const FORBIDDEN = [/\bcura(n|r)?\b/i, /\bresultados? garantizados?\b/i, /\b100\s?% garantizad[oa]s?\b/i];

/** El texto dice que se paga al recibir. */
export const COD = /pag(a|as|o|ar|ues)\b.*\b(recib|entreg|llegu)|contra ?entrega|al recibir/i;

/**
 * Montos que la página puede nombrar: precio, tachado y su ahorro, y cada pack (total, por unidad,
 * ahorro y cuánto baja cada unidad frente a llevar una).
 */
export function allowedAmounts(p: PricingPlan): number[] {
  const out = [p.salePrice, ...p.packs.flatMap((k) => [k.price, k.perUnitPrice, k.savings, p.salePrice - k.perUnitPrice])];
  if (p.compareAtPrice != null) out.push(p.compareAtPrice, p.compareAtPrice - p.salePrice);
  return out.filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * El monto es uno de los permitidos o su redondeo («casi $56.000» por $55.990, «$18.663» por
 * 18.663,33): hasta 1 % de diferencia. Un monto inventado queda lejos de todos.
 */
export function amountAllowed(n: number, allowed: number[]): boolean {
  return allowed.some((a) => Math.abs(a - n) <= Math.max(1, a * 0.01));
}

/** Los montos con el símbolo de la moneda que aparecen en un texto. */
export function amountsIn(t: string, currency: string): number[] {
  const symbol = currencySymbol(currency).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...t.matchAll(new RegExp(`${symbol}\\s?(\\d[\\d.,]*\\d|\\d)`, "g"))].map((m) => parseAmount(m[1], currency)).filter((n) => Number.isFinite(n));
}
