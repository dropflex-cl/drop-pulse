import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import type { ProductRow } from "@/lib/products/store";
import { buildPricingPlan, CLP_DEFAULTS, DEFAULT_EXTRA_UNIT_DISCOUNT, type PricingForm } from "./plan";
import { pricingPlanFromRow as toPlan, type PricingRow } from "./rows";
import { randomUUID } from "node:crypto";
import { pricingFormInput, parseContextRead, storedPricingPlan } from "@/lib/product-intelligence/context";
import { pricingSnapshot } from "@/lib/product-intelligence/pricing";
import { ProductIntelligenceError } from "@/lib/product-intelligence/errors";
import { PRICE_CHANGED } from "./copy";
import { createContextRepository, contextAccess } from "@/lib/product-intelligence/repository";
import { createContextExecutor } from "@/lib/product-intelligence/service";
import { PI_SCOPES, type Principal } from "@/lib/product-intelligence/policy";

// product_pricing: el plan de precios guardado. Escrituras solo desde el servidor (service_role),
// siempre recalculadas con la calculadora: nunca se guarda un número derivado que mande el navegador.

export type SavedPricing = ReturnType<typeof toPlan> & { pricingStamp: string };

export async function getPricingPlan(userId: string, productId: string): Promise<SavedPricing | null> {
  const { data, error } = await adminClient().from("product_pricing").select("*").eq("user_id", userId).eq("product_id", productId).maybeSingle();
  if (error) throw new Error(`Leer el precio: ${error.message}`);
  if (!data) return null;
  const plan = toPlan(data as PricingRow);
  return { ...plan, pricingStamp: pricingSnapshot(plan).pricing_stamp };
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
export async function savePricingPlan(userId: string, product: Pick<ProductRow, "id" | "currency">, form: PricingForm, expectedPricingStamp: string | null): Promise<SavedPricing | null> {
  const plan = buildPricingPlan(form, product.currency);
  if (!plan) return null;
  const principal: Principal = { userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES };
  const repository = createContextRepository();
  const signal = AbortSignal.timeout(10000);
  const read = parseContextRead(await repository.load({ p_access: contextAccess(principal), p_product_id: product.id }, signal));
  const previous = storedPricingPlan(read.snapshot.pricing);
  const currentStamp = previous && previous.currency === product.currency ? pricingSnapshot(previous).pricing_stamp : null;
  if (read.snapshot.catalog.currency !== product.currency || expectedPricingStamp !== currentStamp) throw new ProductIntelligenceError("REVISION_CONFLICT", PRICE_CHANGED);
  try {
    await createContextExecutor(repository)(principal, { tool: "save_product_context", input: {
      product_id: product.id, schema_version: "1.0", expected_revision: read.current_revision,
      idempotency_key: `ui-pricing:${randomUUID()}`, dry_run: false, pricing: pricingFormInput(form, product.currency),
    } }, signal);
  } catch (error) {
    if (error instanceof ProductIntelligenceError && error.code === "REVISION_CONFLICT") throw new ProductIntelligenceError("REVISION_CONFLICT", PRICE_CHANGED);
    throw error;
  }
  return getPricingPlan(userId, product.id);
}

/** Los productos (de los dados) que ya tienen el precio guardado: la ruta de etapas lo pide. */
export async function pricedProducts(userId: string, productIds: string[]): Promise<Set<string>> {
  if (!productIds.length) return new Set();
  const { data, error } = await adminClient().from("product_pricing").select("product_id").eq("user_id", userId).in("product_id", productIds);
  if (error) throw new Error(`Leer los precios: ${error.message}`);
  return new Set((data ?? []).map((r) => r.product_id as string));
}
