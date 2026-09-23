import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import type { ProductRow } from "@/lib/products/store";
import { buildPricingPlan, CLP_DEFAULTS, DEFAULT_EXTRA_UNIT_DISCOUNT, type PackPrice, type PricingForm, type PricingPlan } from "./plan";

// product_pricing: el plan de precios guardado. Escrituras solo desde el servidor (service_role),
// siempre recalculadas con la calculadora: nunca se guarda un número derivado que mande el navegador.

interface PricingRow {
  currency: string;
  unit_cost: number | string;
  avg_shipping_cost: number | string;
  purchase_cost_limit: number | string;
  confirmation_rate: number | string;
  delivery_rate: number | string;
  sale_price: number | string;
  compare_at_price: number | string | null;
  extra_unit_discount: number | string;
  minimum_price: number | string;
  recommended_price: number | string;
  profit: number | string;
  max_cpa: number | string | null;
  beroas: number | string | null;
  packs: {
    units: number;
    price: number;
    profit: number;
    margin: number;
    per_unit_price: number;
    savings: number;
    savings_rate: number;
    earns_more_than_previous: boolean;
  }[];
  updated_at: string;
}

const n = (v: number | string) => Number(v);
const nn = (v: number | string | null) => (v == null ? null : Number(v));

function toPlan(r: PricingRow): PricingPlan & { updatedAt: string } {
  const salePrice = n(r.sale_price);
  return {
    currency: r.currency,
    unitCost: n(r.unit_cost),
    avgShippingCost: n(r.avg_shipping_cost),
    purchaseCostLimit: n(r.purchase_cost_limit),
    confirmationRate: n(r.confirmation_rate),
    deliveryRate: n(r.delivery_rate),
    salePrice,
    compareAtPrice: nn(r.compare_at_price),
    extraUnitDiscount: n(r.extra_unit_discount),
    minimumPrice: n(r.minimum_price),
    recommendedPrice: n(r.recommended_price),
    discountPercent: r.compare_at_price == null ? null : Math.round(((n(r.compare_at_price) - salePrice) / n(r.compare_at_price)) * 100),
    profit: n(r.profit),
    margin: salePrice > 0 ? n(r.profit) / salePrice : 0,
    maxCpa: nn(r.max_cpa),
    beroas: nn(r.beroas),
    packs: r.packs.map(
      (p): PackPrice => ({
        units: p.units,
        price: p.price,
        profit: p.profit,
        margin: p.margin,
        perUnitPrice: p.per_unit_price,
        savings: p.savings,
        savingsRate: p.savings_rate,
        earnsMoreThanPrevious: p.earns_more_than_previous,
      }),
    ),
    updatedAt: r.updated_at,
  };
}

export type SavedPricing = ReturnType<typeof toPlan>;

export async function getPricingPlan(userId: string, productId: string): Promise<SavedPricing | null> {
  const { data, error } = await adminClient().from("product_pricing").select("*").eq("user_id", userId).eq("product_id", productId).maybeSingle();
  if (error) throw new Error(`Leer el precio: ${error.message}`);
  return data ? toPlan(data as PricingRow) : null;
}

/**
 * Valores para abrir la calculadora la primera vez: el costo de Shopify, los números del
 * onboarding (envío, CPA, entregas) y, si faltan, los supuestos del curso en CLP. Sin precio: la
 * pantalla propone el recomendado.
 */
export async function pricingDefaults(userId: string, product: Pick<ProductRow, "cost" | "currency">): Promise<Partial<PricingForm>> {
  const { data } = await adminClient().from("onboarding").select("numbers").eq("user_id", userId).maybeSingle();
  const numbers = data?.numbers as { deliveredOf10?: number; shipping?: number; maxCpa?: number } | null | undefined;
  const clp = product.currency === "CLP";
  return {
    unitCost: product.cost != null && Number(product.cost) > 0 ? Number(product.cost) : undefined,
    avgShippingCost: numbers?.shipping ?? (clp ? CLP_DEFAULTS.avgShippingCost : undefined),
    purchaseCostLimit: numbers?.maxCpa ?? (clp ? CLP_DEFAULTS.purchaseCostLimit : undefined),
    confirmationRate: CLP_DEFAULTS.confirmationRate,
    deliveryRate: numbers?.deliveredOf10 ? numbers.deliveredOf10 * 10 : CLP_DEFAULTS.deliveryRate,
    extraUnitDiscount: DEFAULT_EXTRA_UNIT_DISCOUNT,
  };
}

/** Recalcula y guarda. Devuelve null si el formulario no alcanza para un plan (la API responde 400). */
export async function savePricingPlan(userId: string, product: Pick<ProductRow, "id" | "currency">, form: PricingForm): Promise<SavedPricing | null> {
  const plan = buildPricingPlan(form, product.currency);
  if (!plan) return null;
  const { data, error } = await adminClient()
    .from("product_pricing")
    .upsert(
      {
        product_id: product.id,
        user_id: userId,
        currency: plan.currency,
        unit_cost: plan.unitCost,
        avg_shipping_cost: plan.avgShippingCost,
        purchase_cost_limit: plan.purchaseCostLimit,
        confirmation_rate: plan.confirmationRate,
        delivery_rate: plan.deliveryRate,
        sale_price: plan.salePrice,
        compare_at_price: plan.compareAtPrice,
        extra_unit_discount: plan.extraUnitDiscount,
        minimum_price: plan.minimumPrice,
        recommended_price: plan.recommendedPrice,
        profit: plan.profit,
        max_cpa: plan.maxCpa,
        beroas: plan.beroas,
        packs: plan.packs.map((p) => ({
          units: p.units,
          price: p.price,
          profit: p.profit,
          margin: p.margin,
          per_unit_price: p.perUnitPrice,
          savings: p.savings,
          savings_rate: p.savingsRate,
          earns_more_than_previous: p.earnsMoreThanPrevious,
        })),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`Guardar el precio: ${error.message}`);
  return toPlan(data as PricingRow);
}
