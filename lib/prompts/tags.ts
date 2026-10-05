// Los «tags» de cada prompt guardado en la base (prompt_templates): textos literales del prompt que el
// código reemplaza con los datos del producto. El tag es el texto tal cual aparece en el prompt
// («[PRECIO]»), así el mega prompt validado se guarda sin cambiarle una letra. Puro, con tests.

import { money } from "@/lib/format";
import { countryName, type Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";

export const PROMPT_KEYS = ["product_data", "strategy"] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

export const PROMPT_NAMES: Record<PromptKey, { name: string; desc: string }> = {
  product_data: { name: "Datos del producto", desc: "Información base › «Identificar con IA»: la IA mira las imágenes y escribe la descripción del producto." },
  strategy: { name: "Estrategia", desc: "Etapa Estrategia: el informe completo (clientes, hooks, ángulos, creativos, objeciones y ofertas)." },
};

/** Lo que llena los tags de la estrategia. */
export interface StrategyTagContext {
  name: string;
  description: string;
  pricing: PricingPlan;
  market: Market;
}

/** Lo que llena los tags de Datos del producto. */
export interface ProductDataTagContext {
  shopifyTitle: string;
  baseInfo: string;
}

export interface TagDef<C> {
  /** El texto literal que se reemplaza. */
  tag: string;
  /** Qué pone el sistema ahí (Ajustes › Prompts). */
  label: string;
  resolve: (c: C) => string;
}

const units = (n: number) => (n === 1 ? "1 unidad" : `${n} unidades`);

/** «$24.990 (1 unidad) · Packs: 2 unidades por $39.990 · 3 unidades por $49.990 · Pago contra entrega». */
export function priceText(p: PricingPlan): string {
  const m = (v: number) => money(v, p.currency);
  const parts = [`${m(p.salePrice)} (1 unidad)`];
  if (p.compareAtPrice != null) parts.push(`precio tachado ${m(p.compareAtPrice)}`);
  const packs = p.packs.filter((k) => k.units > 1);
  if (packs.length) parts.push(`Packs: ${packs.map((k) => `${units(k.units)} por ${m(k.price)}${k.recommended ? " (oferta principal)" : ""}`).join(" · ")}`);
  parts.push("Pago contra entrega");
  return parts.join(" · ");
}

/** «$6.500 por unidad + envío promedio $9.000 por pedido». */
export function costText(p: PricingPlan): string {
  const m = (v: number) => money(v, p.currency);
  return `${m(p.unitCost)} por unidad (proveedor)${p.avgShippingCost > 0 ? ` + envío promedio ${m(p.avgShippingCost)} por pedido` : ""}`;
}

export const STRATEGY_TAGS: TagDef<StrategyTagContext>[] = [
  { tag: "[ESCRIBE EL NOMBRE DEL PRODUCTO]", label: "Nombre del producto (Datos del producto)", resolve: (c) => c.name.trim() },
  { tag: "[DESCRIPCIÓN O PEGA LA INFORMACIÓN DEL PRODUCTO]", label: "Descripción (Datos del producto)", resolve: (c) => c.description.trim() },
  { tag: "[PRECIO]", label: "Precio de 1 unidad, tachado y packs (Precio y packs)", resolve: (c) => priceText(c.pricing) },
  { tag: "[PAÍS]", label: "País de la tienda (Ajustes › Mercado)", resolve: (c) => countryName(c.market.countryCode) },
  { tag: "[COSTO, SI LO CONOCES]", label: "Costo del proveedor y envío (Precio y packs)", resolve: (c) => costText(c.pricing) },
];

export const PRODUCT_DATA_TAGS: TagDef<ProductDataTagContext>[] = [
  { tag: "[NOMBRE EN SHOPIFY]", label: "Título del producto en Shopify", resolve: (c) => c.shopifyTitle.trim() },
  { tag: "[INFORMACIÓN DEL COMERCIANTE]", label: "Lo que sabes del producto (Información base)", resolve: (c) => c.baseInfo.trim() || "(nada)" },
];

/** Los tags de cada prompt (sin el `resolve`, para validar y para la pantalla). */
export const TAGS_BY_KEY: Record<PromptKey, { tag: string; label: string }[]> = {
  product_data: PRODUCT_DATA_TAGS,
  strategy: STRATEGY_TAGS,
};

export const isPromptKey = (v: unknown): v is PromptKey => typeof v === "string" && (PROMPT_KEYS as readonly string[]).includes(v);
