// Los precios del comerciante como texto para los prompts (ficha y cliente ideal). Puro.
import { money } from "@/lib/format";
import type { PackLabel } from "@/lib/ai/schemas";
import type { PricingPlan } from "./plan";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const units = (n: number) => (n === 1 ? "1 unidad" : `Pack ${n} unidades`);

/**
 * Bloque “PRECIO Y OFERTA”: lo que decidió el comerciante en la calculadora, tal cual. La oferta
 * principal es el pack recomendado: el CPA y el despacho se pagan una vez por pedido, así que el
 * negocio está en que el cliente lleve más de una unidad; 1 unidad es la referencia de precio.
 */
/** `labels`: las etiquetas APROBADAS de los packs (textos, anuncios); sin aprobar no se pasan. */
export function pricingBlock(p: PricingPlan, labels?: PackLabel[]): string {
  const m = (v: number) => money(v, p.currency);
  const main = p.packs.find((k) => k.recommended);
  const threeForTwo = (k: (typeof p.packs)[number]) => k.units === 3 && Math.abs(k.price - 2 * p.salePrice) <= 10 * (p.salePrice >= 1000 ? 100 : 1);
  const lines = [
    "PRECIO Y OFERTA (lo decidió el comerciante en la calculadora; úsalo tal cual, no lo cambies ni preguntes por él)",
    `- Precio de compra al proveedor: ${m(p.unitCost)} por unidad.`,
    `- Precio de 1 unidad: ${m(p.salePrice)}.` +
      (p.compareAtPrice != null ? ` Precio tachado: ${m(p.compareAtPrice)} (${p.discountPercent ?? 0}% de descuento anunciado).` : " Sin precio tachado."),
    "- Packs:",
    ...p.packs.map(
      (k) =>
        `  · ${units(k.units)}: ${m(k.price)}` +
        (k.units > 1 ? ` (${m(k.perUnitPrice)} c/u; ahorra ${m(k.savings)}, ${pct(k.savingsRate)}${threeForTwo(k) ? "; «lleva 3, paga 2»" : ""})` : "") +
        ` · ganancia ${m(k.profit)} por pedido entregado` +
        (labels?.find((l) => l.units === k.units) ? ` · se presenta como «${labels.find((l) => l.units === k.units)!.label}»` : "") +
        (k.recommended ? " ← OFERTA PRINCIPAL" : ""),
    ),
  ];
  if (main && main.units > 1) {
    lines.push(
      `- OFERTA PRINCIPAL: ${units(main.units)} a ${m(main.price)}. El anuncio y el despacho se pagan una vez por pedido, así que el negocio está en que el cliente lleve el pack` +
        (main.profitMultiple ? ` (gana ${Math.round(main.profitMultiple)} veces lo que deja 1 unidad)` : "") +
        ". Todo lo que escribas empuja el pack; 1 unidad es solo la referencia de precio.",
    );
  }
  lines.push(
    `- Economía del pago contra entrega: envío promedio ${m(p.avgShippingCost)} por pedido; se confirma el ${p.confirmationRate}% de los pedidos y se entrega el ${p.deliveryRate}% de los confirmados.`,
    `- Precio de equilibrio de 1 unidad: ${m(p.minimumPrice)}. Ganancia con 1 unidad: ${m(p.profit)} por pedido entregado (${pct(p.margin)}).`,
  );
  if (p.maxCpa != null) lines.push(`- Lo máximo que puede pagar en anuncios por pedido de 1 unidad sin perder: ${m(p.maxCpa)} (hoy apunta a ${m(p.purchaseCostLimit)}).`);
  return lines.join("\n");
}
