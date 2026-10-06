// La UI y PI leen los números guardados, también en snapshots históricos, sin recalcular el pasado.
import { withRecommendation, type PricingPlan } from "./plan";

export interface PricingRow {
  currency: string;
  unit_cost: number | string; avg_shipping_cost: number | string; purchase_cost_limit: number | string;
  confirmation_rate: number | string; delivery_rate: number | string; sale_price: number | string;
  compare_at_price: number | string | null; extra_unit_discount: number | string;
  minimum_price: number | string; recommended_price: number | string; profit: number | string;
  max_cpa: number | string | null; beroas: number | string | null;
  packs: { units: number; price: number; profit: number; margin: number; per_unit_price: number; savings: number;
    savings_rate: number; earns_more_than_previous: boolean; recommended?: boolean }[];
  updated_at?: string;
}
export function pricingPlanFromRow(row: PricingRow): PricingPlan & { updatedAt: string } {
  const salePrice = Number(row.sale_price), profit = Number(row.profit);
  const compareAtPrice = row.compare_at_price === null ? null : Number(row.compare_at_price);
  const packs = withRecommendation(row.packs.map((pack) => ({ units: pack.units, price: pack.price, profit: pack.profit, margin: pack.margin,
    perUnitPrice: pack.per_unit_price, savings: pack.savings, savingsRate: pack.savings_rate,
    earnsMoreThanPrevious: pack.earns_more_than_previous, recommended: false, profitMultiple: null })));
  // Nuevas escrituras congelan la recomendación; filas anteriores conservan el lector existente.
  if (row.packs.every((pack) => typeof pack.recommended === "boolean")) packs.forEach((pack, index) => { pack.recommended = row.packs[index].recommended!; });
  return { currency: row.currency, unitCost: Number(row.unit_cost), avgShippingCost: Number(row.avg_shipping_cost),
    purchaseCostLimit: Number(row.purchase_cost_limit), confirmationRate: Number(row.confirmation_rate), deliveryRate: Number(row.delivery_rate),
    salePrice, compareAtPrice, extraUnitDiscount: Number(row.extra_unit_discount), minimumPrice: Number(row.minimum_price), recommendedPrice: Number(row.recommended_price),
    discountPercent: compareAtPrice === null ? null : Math.round((compareAtPrice - salePrice) / compareAtPrice * 100),
    profit, margin: salePrice > 0 ? profit / salePrice : 0, maxCpa: row.max_cpa === null ? null : Number(row.max_cpa),
    beroas: row.beroas === null ? null : Number(row.beroas), packs, updatedAt: row.updated_at ?? "" };
}
