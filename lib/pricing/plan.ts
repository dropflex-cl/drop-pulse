// El plan de precios de un producto: lo que el comerciante decide en “Precio y packs” (Información
// base) más todo lo que se deriva con la calculadora. Puro: la pantalla lo recalcula en vivo y el
// servidor lo vuelve a calcular antes de guardar, así lo que lee la IA nunca viene del navegador.

import {
  computeBeroasMetrics,
  computeDiscountPercent,
  computeExpectedProfit,
  computeMinimumPrice,
  computeOfferLadder,
  roundingFor,
  suggestCompareAtPrice,
} from "./calculator";

/** Lo que escribe el comerciante. Tasas en porcentaje (0–100); dinero en la moneda de la tienda. */
export interface PricingForm {
  /** Precio de compra al proveedor, por unidad. */
  unitCost: number;
  /** Envío promedio por pedido despachado. */
  avgShippingCost: number;
  /** Lo máximo que paga en anuncios por pedido (CPA objetivo). */
  purchaseCostLimit: number;
  /** De cada 100 pedidos, cuántos se confirman. */
  confirmationRate: number;
  /** De cada 100 confirmados, cuántos se entregan. */
  deliveryRate: number;
  /** Precio de venta de 1 unidad. */
  salePrice: number;
  /** Precio tachado (ancla); null sin tachado. */
  compareAtPrice: number | null;
  /** Descuento de cada unidad extra en los packs, en porcentaje (0–95). */
  extraUnitDiscount: number;
}

export interface PackPrice {
  units: number;
  price: number;
  /** Ganancia por pedido entregado. */
  profit: number;
  margin: number;
  perUnitPrice: number;
  /** Lo que ahorra el cliente frente a comprar las unidades por separado. */
  savings: number;
  savingsRate: number;
  earnsMoreThanPrevious: boolean;
}

export interface PricingPlan extends PricingForm {
  currency: string;
  /** Precio de equilibrio de 1 unidad (ya redondeado). */
  minimumPrice: number;
  /** El recomendado: el primer precio “redondo” (…990) sobre el equilibrio. */
  recommendedPrice: number;
  /** Descuento que anuncia el tachado, en porcentaje. */
  discountPercent: number | null;
  /** Ganancia por pedido entregado a este precio. */
  profit: number;
  margin: number;
  /** Lo máximo que se puede pagar en anuncios por pedido a este precio sin perder. */
  maxCpa: number | null;
  beroas: number | null;
  /** 1x, 2x y 3x. */
  packs: PackPrice[];
}

export const PACK_TIERS = [1, 2, 3];
export const DEFAULT_EXTRA_UNIT_DISCOUNT = 35;
export const MAX_EXTRA_UNIT_DISCOUNT = 95;
/** Supuestos del curso (v1, TFL_PRICING_DEFAULTS), en CLP. */
export const CLP_DEFAULTS = { purchaseCostLimit: 5000, avgShippingCost: 8000, confirmationRate: 70, deliveryRate: 70 } as const;

const finite = (n: number) => Number.isFinite(n);

/** Qué falta o está mal, por campo, en español. Vacío si se puede calcular y guardar. */
export function validatePricingForm(f: PricingForm): Partial<Record<keyof PricingForm, string>> {
  const e: Partial<Record<keyof PricingForm, string>> = {};
  if (!finite(f.unitCost) || f.unitCost <= 0) e.unitCost = "Escribe cuánto te cuesta en el proveedor";
  if (!finite(f.avgShippingCost) || f.avgShippingCost < 0) e.avgShippingCost = "Escribe el envío promedio (0 si no pagas envío)";
  if (!finite(f.purchaseCostLimit) || f.purchaseCostLimit < 0) e.purchaseCostLimit = "Escribe cuánto pagas en anuncios por pedido";
  if (!finite(f.confirmationRate) || f.confirmationRate <= 0 || f.confirmationRate > 100) e.confirmationRate = "Entre 1 y 100";
  if (!finite(f.deliveryRate) || f.deliveryRate <= 0 || f.deliveryRate > 100) e.deliveryRate = "Entre 1 y 100";
  if (!finite(f.salePrice) || f.salePrice <= 0) e.salePrice = "Escribe el precio de venta";
  if (f.compareAtPrice != null && (!finite(f.compareAtPrice) || f.compareAtPrice <= f.salePrice)) e.compareAtPrice = "Debe ser mayor que el precio de venta";
  if (!finite(f.extraUnitDiscount) || f.extraUnitDiscount < 0 || f.extraUnitDiscount > MAX_EXTRA_UNIT_DISCOUNT) {
    e.extraUnitDiscount = `Entre 0 y ${MAX_EXTRA_UNIT_DISCOUNT}`;
  }
  return e;
}

/** Precio recomendado y tachado sugerido para unos costos (null si aún no se puede calcular). */
export function suggestPrices(
  f: Pick<PricingForm, "unitCost" | "avgShippingCost" | "purchaseCostLimit" | "confirmationRate" | "deliveryRate">,
  currency: string,
) {
  const rules = roundingFor(currency);
  const minimum = computeMinimumPrice(f, rules);
  if (!minimum) return null;
  return { minimumPrice: minimum.rounded, recommendedPrice: minimum.charm, compareAtPrice: suggestCompareAtPrice(minimum.charm, undefined, rules) };
}

/** El plan completo, o null si el formulario tiene errores. */
export function buildPricingPlan(f: PricingForm, currency: string): PricingPlan | null {
  if (Object.keys(validatePricingForm(f)).length) return null;
  const rules = roundingFor(currency);
  const minimum = computeMinimumPrice(f, rules);
  const profit = computeExpectedProfit(f, f.salePrice, rules);
  const ladder = computeOfferLadder(f, f.salePrice, { extraUnitDiscount: f.extraUnitDiscount / 100, tiers: PACK_TIERS, rules });
  if (!minimum || !profit || !ladder) return null;
  const beroas = computeBeroasMetrics(f, f.salePrice);
  return {
    ...f,
    currency,
    minimumPrice: minimum.rounded,
    recommendedPrice: minimum.charm,
    discountPercent: computeDiscountPercent(f.salePrice, f.compareAtPrice),
    profit: profit.amount,
    margin: profit.margin,
    maxCpa: beroas ? beroas.maxCpa : null,
    beroas: beroas?.beroas ?? null,
    packs: ladder.map((t) => ({
      units: t.units,
      price: t.suggestedPrice,
      profit: t.profit,
      margin: t.margin,
      perUnitPrice: t.perUnitPrice,
      savings: t.savings,
      savingsRate: t.savingsRate,
      earnsMoreThanPrevious: t.earnsMoreThanPrevious,
    })),
  };
}
