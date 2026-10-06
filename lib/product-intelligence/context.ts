import { z } from "zod";
import { CLP_DEFAULTS, DEFAULT_EXTRA_UNIT_DISCOUNT, type PricingForm, type PricingPlan } from "@/lib/pricing/plan";
import { pricingPlanFromRow } from "@/lib/pricing/rows";
import { deliveryDays, fromRow } from "@/lib/settings/policies";
import { labelsStale } from "@/lib/pricing/labels";
import { canonicalHash } from "./concurrency";
import { invalidField, invalidReference, ProductIntelligenceError } from "./errors";
import { checkRevision } from "./policy";
import { calculateProductPricing, pricingSnapshot, toMinor, currencyScale, storedDecimal } from "./pricing";
import { basicRecordSchema, type JsonValue, type ToolInputs, type ToolOutputs } from "./schemas";

const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());
const pricingRowSchema = z.object({
  currency: z.string(), unit_cost: numeric, avg_shipping_cost: numeric, purchase_cost_limit: numeric,
  confirmation_rate: numeric, delivery_rate: numeric, sale_price: numeric, compare_at_price: numeric.nullable(), extra_unit_discount: numeric,
  minimum_price: numeric, recommended_price: numeric, profit: numeric, max_cpa: numeric.nullable(), beroas: numeric.nullable(),
  packs: z.array(z.object({ units: numeric, price: numeric, profit: numeric, margin: numeric, per_unit_price: numeric, savings: numeric,
    savings_rate: numeric, earns_more_than_previous: z.boolean(), recommended: z.boolean().optional() })),
});
export const storedContextSchema = z.object({
  catalog: z.object({ id: z.uuid(), title: z.string(), shopify_product_id: z.string(), currency: z.string(), is_upsell: z.boolean() }),
  context: basicRecordSchema.nullable(), pricing: pricingRowSchema.nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(), numbers: z.record(z.string(), z.unknown()).nullable(),
  pack_labels: z.object({ status: z.string(), payload: z.array(z.object({ units: z.number().int(), label: z.string().max(160) })),
    prices: z.array(z.object({ units: z.number().int(), price: numeric })) }).nullable().optional(),
  images: z.array(z.object({ id: z.uuid(), is_base: z.boolean(), is_cover: z.boolean(), excluded: z.boolean(), position: z.number() })),
});
export type StoredContext = z.infer<typeof storedContextSchema>;
export interface ContextRead { revision: number; current_revision: number; snapshot: StoredContext; stamp: string }
export function parseContextRead(raw: unknown): ContextRead {
  const parsed = z.object({ revision: z.number().int().nonnegative().safe(), current_revision: z.number().int().nonnegative().safe(), snapshot: storedContextSchema, stamp: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(raw);
  if (!parsed.success) throw new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer el contexto guardado.");
  return parsed.data;
}

export function storedPricingPlan(row: StoredContext["pricing"]): PricingPlan | null {
  if (!row) return null;
  return pricingPlanFromRow(row);
}

function approvedLabels(state: StoredContext, plan: PricingPlan | null): Map<number, string> {
  const labels = state.pack_labels;
  return !plan || !labels || labels.status !== "approved" || labelsStale(labels.prices, plan) ? new Map() : new Map(labels.payload.map((item) => [item.units, item.label]));
}
export function contextPricing(state: StoredContext) {
  const plan = storedPricingPlan(state.pricing);
  return plan ? pricingSnapshot(plan, approvedLabels(state, plan)) : null;
}

/** Mismo formato físico que lee la UI. Solo se construye desde buildPricingPlan. */
export function pricingPersistence(plan: PricingPlan) {
  // Evitar que numeric(14,2)/numeric(5,2) altere silenciosamente los inputs aceptados por MCP.
  for (const field of ["unitCost", "avgShippingCost", "purchaseCostLimit", "salePrice", "compareAtPrice"] as const) {
    const value = plan[field];
    if (value !== null && value >= 1e12) invalidField("pricing", "El monto supera el rango de la calculadora guardada.");
  }
  for (const field of ["confirmationRate", "deliveryRate", "extraUnitDiscount"] as const) toMinor(plan[field], 2);
  if ([plan.minimumPrice, plan.recommendedPrice, plan.profit, plan.maxCpa ?? 0].some((value) => Math.abs(value) >= 1e12) || Math.abs(plan.beroas ?? 0) >= 1e6) invalidField("pricing", "El resultado supera el rango de la calculadora guardada.");
  return {
    currency: plan.currency, unit_cost: plan.unitCost, avg_shipping_cost: plan.avgShippingCost, purchase_cost_limit: plan.purchaseCostLimit,
    confirmation_rate: plan.confirmationRate, delivery_rate: plan.deliveryRate, sale_price: plan.salePrice, compare_at_price: plan.compareAtPrice,
    extra_unit_discount: plan.extraUnitDiscount, minimum_price: plan.minimumPrice, recommended_price: plan.recommendedPrice,
    profit: storedDecimal(plan.profit, 2), max_cpa: plan.maxCpa === null ? null : storedDecimal(plan.maxCpa, 2), beroas: plan.beroas === null ? null : storedDecimal(plan.beroas, 4),
    packs: plan.packs.map((p) => ({ units: p.units, price: p.price, profit: p.profit, margin: p.margin, per_unit_price: p.perUnitPrice,
      savings: p.savings, savings_rate: p.savingsRate, earns_more_than_previous: p.earnsMoreThanPrevious, recommended: p.recommended })),
  };
}

function defaults(state: StoredContext): Partial<PricingForm> {
  const numbers = state.numbers;
  const clp = state.catalog.currency === "CLP";
  const number = (key: string) => typeof numbers?.[key] === "number" ? numbers[key] : undefined;
  return { avgShippingCost: number("shipping") ?? (clp ? CLP_DEFAULTS.avgShippingCost : undefined),
    purchaseCostLimit: number("maxCpa") ?? (clp ? CLP_DEFAULTS.purchaseCostLimit : undefined),
    confirmationRate: CLP_DEFAULTS.confirmationRate, deliveryRate: number("deliveredOf10") ? number("deliveredOf10")! * 10 : CLP_DEFAULTS.deliveryRate,
    extraUnitDiscount: DEFAULT_EXTRA_UNIT_DISCOUNT };
}

export function prepareProductContext(read: ContextRead, input: ToolInputs["save_product_context"], requestId: string) {
  checkRevision(input.expected_revision, read.current_revision);
  const state = read.snapshot, previous = state.context;
  const storedPlan = storedPricingPlan(state.pricing);
  // Cambiar de moneda exige ingresar de nuevo costo/supuestos; no convertirlos implícitamente.
  const previousPlan = storedPlan?.currency === state.catalog.currency ? storedPlan : null;
  if (!previousPlan && !input.pricing) invalidField("pricing.unit_cost_minor", "Ingresa el costo del proveedor para calcular Precio y packs.");
  const pricingDefaults = storedPlan && !previousPlan ? { confirmationRate: CLP_DEFAULTS.confirmationRate, deliveryRate: CLP_DEFAULTS.deliveryRate, extraUnitDiscount: DEFAULT_EXTRA_UNIT_DISCOUNT } : defaults(state);
  const calculated = input.pricing ? calculateProductPricing(input.pricing, state.catalog.currency, previousPlan, pricingDefaults) : null;
  // Lo devuelto coincide con la precisión física guardada y el lector histórico compartido.
  const plan = calculated ? pricingPlanFromRow(pricingPersistence(calculated.plan)) : previousPlan;
  const pricing = plan ? pricingSnapshot(plan, approvedLabels(state, plan)) : null;
  const pricingChanged = calculated !== null && canonicalHash(pricing as JsonValue) !== canonicalHash(previousPlan ? pricingSnapshot(previousPlan, approvedLabels(state, previousPlan)) as JsonValue : null);
  const baseImage = input.context?.base_reference_image_id;
  if (baseImage && !state.images.some((image) => image.id === baseImage)) invalidReference();
  const baseChanged = baseImage === undefined ? false : baseImage === null ? state.images.some((image) => image.is_base) : !state.images.some((image) => image.id === baseImage && image.is_base && !image.excluded);
  let context = previous;
  if (input.context) {
    const { base_reference_image_id: ignored, ...fields } = input.context;
    void ignored;
    const parsed = basicRecordSchema.safeParse({ category: null, supplier_text: null, base_reference_image_id: null, ...previous, ...fields, last_revision: read.current_revision + 1 });
    if (!parsed.success) invalidField("context", "Define el nombre y la descripción del producto en el primer contexto.");
    context = parsed.data;
  }
  const content = (value: StoredContext["context"]) => value ? { display_name: value.display_name, category: value.category, description: value.description, supplier_text: value.supplier_text } : null;
  const contextChanged = canonicalHash(content(context)) !== canonicalHash(content(previous));
  const changed = contextChanged || pricingChanged || baseChanged;
  const result: ToolOutputs["save_product_context"] = {
    ok: true, product_id: input.product_id, revision: read.current_revision + (changed && !input.dry_run ? 1 : 0), request_id: requestId,
    data: { applied: changed && !input.dry_run, dry_run: input.dry_run, no_op: !changed, base_revision: read.current_revision, id_map: {},
      diff: [
        ...(contextChanged || baseChanged ? [{ entity: "context" as const, action: previous ? "update" as const : "create" as const, id: null, client_ref: null,
          changed_fields: [...Object.keys(input.context ?? {}).filter((key) => key !== "base_reference_image_id" && content(context)?.[key as keyof NonNullable<ReturnType<typeof content>>] !== content(previous)?.[key as keyof NonNullable<ReturnType<typeof content>>]), ...(baseChanged ? ["base_reference_image_id"] : [])] }] : []),
        ...(pricingChanged ? [{ entity: "pricing" as const, action: previousPlan ? "update" as const : "create" as const, id: null, client_ref: null, changed_fields: Object.keys(input.pricing ?? {}).filter((key) => key !== "mode") }] : []),
      ], diff_truncated: false, pricing },
    warnings: (calculated?.defaultedFields ?? []).map((field) => ({ code: "PRICING_DEFAULT_APPLIED", field: `pricing.${field}`, message: "Se usó el supuesto vigente de la calculadora. Revísalo para tu producto." })),
  };
  return { result, context: contextChanged || baseChanged ? context : null, pricing: pricingChanged && plan ? pricingPersistence(plan) : null,
    baseImage: baseChanged ? baseImage : undefined };
}

/** El conocimiento todavía vacío se distingue de PDP/assets/métricas aún no conectados. */
export function productContextResponse(read: ContextRead, input: ToolInputs["get_product_context"], requestId: string): ToolOutputs["get_product_context"] {
  if (input.cursor) throw new ProductIntelligenceError("CURSOR_INVALID", "El cursor no corresponde a esta lectura.");
  const state = read.snapshot, settings = state.settings;
  if (!settings || !["es", "pt-BR"].includes(String(settings.language))) invalidField("market", "Confirma el mercado de la tienda antes de recuperar su contexto.");
  const plan = storedPricingPlan(state.pricing);
  const policy = fromRow(settings), days = deliveryDays(policy);
  const policies = { cod: true, free_shipping: policy.freeShipping && policy.freeShippingThreshold === null ? true : false,
    delivery: days ? `${days.min}–${days.max} días ${policy.businessDaysOnly ? "hábiles" : "calendario"}` : null,
    returns: policy.returnDays ? `${policy.returnDays} días` : null, warranty: policy.warrantyMonths ? `${policy.warrantyMonths} meses` : null,
    restrictions: policy.freeShipping && policy.freeShippingThreshold !== null ? [`Envío gratis desde ${policy.freeShippingThreshold} ${String(settings.currency).trim()}`] : [], policies_stamp: canonicalHash(settings as JsonValue) };
  const include = input.include ?? ["facts", "research", "personas", "jtbd", "pains", "desires", "objections", "angles", "customer_language", "offer", "strategy"];
  const auxiliary = new Set(["pdp", "assets", "performance"]);
  const currencyMismatch = plan !== null && plan.currency !== state.catalog.currency;
  return { ok: true, product_id: input.product_id, revision: read.revision, request_id: requestId,
    warnings: currencyMismatch ? [{ code: "PRICING_CURRENCY_CHANGED", field: "pricing", message: "La moneda del catálogo cambió. Ingresa de nuevo el costo y los supuestos del precio." }] : [], data: {
    schema_version: "1.0", current_revision: read.current_revision,
    product: { id: state.catalog.id, catalog_title: state.catalog.title, shopify_product_id: state.catalog.shopify_product_id,
      currency: state.catalog.currency.trim(), is_upsell: state.catalog.is_upsell, context: state.context, pricing: plan ? pricingSnapshot(plan, approvedLabels(state, plan)) : null,
      market: { country_code: String(settings.country_code).trim(), currency: String(settings.currency).trim(), language: settings.language as "es" | "pt-BR",
        timezone: typeof settings.timezone === "string" ? settings.timezone : null, confirmed: settings.market_confirmed_at !== null && settings.market_confirmed_at !== undefined }, policies },
    blocks: include.map((name) => ({ name, items: [], summary: null, count: 0, as_of: null, availability: auxiliary.has(name) ? "unknown" : "snapshot", strategy: null })),
    active_strategy_id: null, readiness: { ready_for_execution: false, stale: false, needs_review: false,
      missing_fields: [...(!state.context ? ["context"] : []), ...(!plan || currencyMismatch ? ["pricing.unit_cost_minor"] : []), "strategy"] },
    next_cursor: null, truncated: false, current_usage_restrictions: [],
  } };
}

/** UI → contrato canónico; dinero exacto, derivados excluidos del input. */
export function pricingFormInput(form: PricingForm, currency: string): NonNullable<ToolInputs["save_product_context"]["pricing"]> {
  const minor = (value: number) => toMinor(value, currencyScale(currency));
  return { mode: "manual", unit_cost_minor: minor(form.unitCost), avg_shipping_cost_minor: minor(form.avgShippingCost),
    purchase_cost_limit_minor: minor(form.purchaseCostLimit), confirmation_rate: form.confirmationRate, delivery_rate: form.deliveryRate,
    sale_price_minor: minor(form.salePrice), compare_at_price_minor: form.compareAtPrice === null ? null : minor(form.compareAtPrice), extra_unit_discount: form.extraUnitDiscount };
}
