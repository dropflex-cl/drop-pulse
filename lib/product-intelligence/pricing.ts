import { CURRENCIES } from "@/lib/market";
import { buildPricingPlan, suggestPrices, validatePricingForm, type PricingForm, type PricingPlan } from "@/lib/pricing/plan";
import { canonicalHash } from "./concurrency";
import { invalidField, ProductIntelligenceError } from "./errors";
import type { FinancialSnapshot, ToolInputs } from "./schemas";

export function currencyScale(currency: string): number {
  if (!CURRENCIES.some((item) => item.code === currency)) invalidField("currency", "La moneda no está configurada para esta tienda.");
  const scale = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  if (scale === undefined) invalidField("currency", "No pudimos determinar la escala de esta moneda.");
  return scale;
}

/** Numeric/decimal → minor exacto; no Math.round que oculte precisión inválida. */
export function toMinor(value: string | number, scale: number): number {
  if (!Number.isInteger(scale) || scale < 0 || scale > 4) invalidField("currency_scale", "La escala monetaria no es válida.");
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?$/.exec(String(value));
  if (!match) invalidField("money", "El monto debe ser un decimal finito.");
  const fraction = match[3] ?? "";
  if (fraction.slice(scale).replace(/0/g, "").length) invalidField("money", "El monto tiene más precisión que la moneda.");
  const minor = BigInt(`${match[1]}${match[2]}${fraction.slice(0, scale).padEnd(scale, "0")}`);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)) invalidField("money", "El monto supera el rango monetario permitido.");
  return Number(minor);
}

export function toMajor(minor: number, scale: number): number {
  if (!Number.isSafeInteger(minor)) invalidField("money", "El monto en unidad menor debe ser entero.");
  const major = minor / 10 ** scale;
  if (toMinor(major, scale) !== minor) invalidField("money", "El monto pierde precisión en la calculadora actual.");
  return major;
}

/** Conserva la representación del número calculado, incluidas fracciones analíticas. */
function decimal(value: number): string {
  if (!Number.isFinite(value)) invalidField("pricing", "La calculadora devolvió un valor no finito.");
  const original = String(value);
  if (!/[eE]/.test(original)) return original;
  const [base, exponent] = original.toLowerCase().split("e");
  const sign = base.startsWith("-") ? "-" : "";
  const unsigned = base.replace(/^-/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = whole + fraction;
  const position = whole.length + Number(exponent);
  return sign + (position <= 0 ? `0.${"0".repeat(-position)}${digits}` : position >= digits.length ? digits + "0".repeat(position - digits.length) : `${digits.slice(0, position)}.${digits.slice(position)}`);
}

/** Representación exacta de numeric(scale), con el mismo redondeo decimal de PostgreSQL. */
export function storedDecimal(value: number, scale: number): number {
  const raw = decimal(value), negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  let digits = BigInt(whole + fraction.slice(0, scale).padEnd(scale, "0"));
  if (Number(fraction[scale] ?? "0") >= 5) digits++;
  return Number(negative ? -digits : digits) / 10 ** scale;
}

export function pricingSnapshot(plan: PricingPlan, approvedLabels: ReadonlyMap<number, string> = new Map()): FinancialSnapshot {
  const scale = currencyScale(plan.currency);
  const minor = (value: number) => toMinor(value, scale);
  const stamp = canonicalHash({ currency: plan.currency, unit_cost: plan.unitCost, avg_shipping_cost: plan.avgShippingCost, purchase_cost_limit: plan.purchaseCostLimit, confirmation_rate: plan.confirmationRate, delivery_rate: plan.deliveryRate, sale_price: plan.salePrice, compare_at_price: plan.compareAtPrice, extra_unit_discount: plan.extraUnitDiscount });
  return {
    currency: plan.currency, currency_scale: scale, pricing_stamp: stamp,
    unit_cost_minor: minor(plan.unitCost), avg_shipping_cost_minor: minor(plan.avgShippingCost), purchase_cost_limit_minor: minor(plan.purchaseCostLimit), confirmation_rate: plan.confirmationRate, delivery_rate: plan.deliveryRate, extra_unit_discount: plan.extraUnitDiscount,
    sale_price_minor: minor(plan.salePrice), compare_at_price_minor: plan.compareAtPrice === null ? null : minor(plan.compareAtPrice), minimum_price_minor: minor(plan.minimumPrice), recommended_price_minor: minor(plan.recommendedPrice), profit_decimal: decimal(plan.profit), margin: plan.margin, max_cpa_decimal: plan.maxCpa === null ? null : decimal(plan.maxCpa), beroas: plan.beroas,
    packs: plan.packs.map((pack) => ({ units: pack.units, price_minor: minor(pack.price), profit_decimal: decimal(pack.profit), per_unit_price_decimal: decimal(pack.perUnitPrice), savings_minor: minor(pack.savings), recommended: pack.recommended, approved_label: approvedLabels.get(pack.units) ?? null })),
  };
}

export function calculateProductPricing(input: NonNullable<ToolInputs["save_product_context"]["pricing"]>, currency: string, previous: PricingForm | null, defaults: Partial<PricingForm>): { plan: PricingPlan; snapshot: FinancialSnapshot; defaultedFields: string[] } {
  const scale = currencyScale(currency);
  const form: Partial<PricingForm> = { ...defaults, ...(previous ?? {}) };
  const defaultedFields: string[] = [];
  const moneyFields = { unit_cost_minor: "unitCost", avg_shipping_cost_minor: "avgShippingCost", purchase_cost_limit_minor: "purchaseCostLimit" } as const;
  for (const [dtoField, formField] of Object.entries(moneyFields) as [keyof typeof moneyFields, (typeof moneyFields)[keyof typeof moneyFields]][]) {
    if (input[dtoField] !== undefined) form[formField] = toMajor(input[dtoField], scale);
    else if (!previous && defaults[formField] !== undefined) defaultedFields.push(dtoField);
  }
  const rateFields = { confirmation_rate: "confirmationRate", delivery_rate: "deliveryRate", extra_unit_discount: "extraUnitDiscount" } as const;
  for (const [dtoField, formField] of Object.entries(rateFields) as [keyof typeof rateFields, (typeof rateFields)[keyof typeof rateFields]][]) {
    if (input[dtoField] !== undefined) form[formField] = input[dtoField];
    else if (!previous && defaults[formField] !== undefined) defaultedFields.push(dtoField);
  }
  // El costo de Shopify/default no sustituye el ingreso explícito del proveedor en primer setup.
  if (!previous && input.unit_cost_minor === undefined) form.unitCost = undefined;
  const needed = ["unitCost", "avgShippingCost", "purchaseCostLimit", "confirmationRate", "deliveryRate", "extraUnitDiscount"] as const;
  const missing = needed.filter((field) => form[field] === undefined);
  if (missing.length) throw new ProductIntelligenceError("VALIDATION_ERROR", "Completa el costo del proveedor y los supuestos que faltan.", { missing_fields: missing });
  if (input.mode === "recommended") {
    const suggested = suggestPrices(form as PricingForm, currency);
    if (!suggested) invalidField("pricing", "Revisa los costos y tasas antes de calcular el precio.");
    form.salePrice = suggested.recommendedPrice;
    form.compareAtPrice = suggested.compareAtPrice;
  } else {
    form.salePrice = toMajor(input.sale_price_minor, scale);
    form.compareAtPrice = input.compare_at_price_minor === null ? null : toMajor(input.compare_at_price_minor, scale);
  }
  const errors = validatePricingForm(form as PricingForm);
  if (Object.keys(errors).length) throw new ProductIntelligenceError("VALIDATION_ERROR", "Revisa los datos de Precio y packs.", { fields: Object.keys(errors) });
  const plan = buildPricingPlan(form as PricingForm, currency);
  if (!plan) invalidField("pricing", "No pudimos calcular un plan válido con estos datos.");
  return { plan, snapshot: pricingSnapshot(plan), defaultedFields };
}
