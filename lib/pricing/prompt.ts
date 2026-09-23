// Los precios del comerciante como texto para los prompts (ficha y cliente ideal). Puro.
import { money } from "@/lib/format";
import type { PricingPlan } from "./plan";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Bloque “PRECIO Y OFERTA”: lo que decidió el comerciante en la calculadora, tal cual. */
export function pricingBlock(p: PricingPlan): string {
  const m = (v: number) => money(v, p.currency);
  const lines = [
    "PRECIO Y OFERTA (lo decidió el comerciante en la calculadora; úsalo tal cual, no lo cambies ni preguntes por él)",
    `- Precio de compra al proveedor: ${m(p.unitCost)} por unidad.`,
    `- Precio de venta: ${m(p.salePrice)}.` +
      (p.compareAtPrice != null ? ` Precio tachado: ${m(p.compareAtPrice)} (${p.discountPercent ?? 0}% de descuento anunciado).` : " Sin precio tachado."),
    "- Packs:",
    ...p.packs.map(
      (k) =>
        `  · ${k.units} ${k.units === 1 ? "unidad" : "unidades"}: ${m(k.price)}` +
        (k.units > 1 ? ` (${m(k.perUnitPrice)} c/u; el cliente ahorra ${m(k.savings)}, ${pct(k.savingsRate)})` : "") +
        ` · ganancia ${m(k.profit)} por pedido entregado`,
    ),
    `- Economía del pago contra entrega: envío promedio ${m(p.avgShippingCost)} por pedido; se confirma el ${p.confirmationRate}% de los pedidos y se entrega el ${p.deliveryRate}% de los confirmados.`,
    `- Precio de equilibrio: ${m(p.minimumPrice)}. Ganancia a este precio: ${m(p.profit)} por pedido entregado (${pct(p.margin)}).`,
  ];
  if (p.maxCpa != null) lines.push(`- Lo máximo que puede pagar en anuncios por pedido sin perder: ${m(p.maxCpa)} (hoy apunta a ${m(p.purchaseCostLimit)}).`);
  return lines.join("\n");
}
