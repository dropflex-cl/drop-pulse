/**
 * Pricing calculator for COD (cash-on-delivery) dropshipping.
 * Portada de dropflex v1 (lib/pricing/calculator.ts), sin los upsells. Lo usan la sección
 * "Precio y packs" de Información base (UI, en vivo) y el servidor (lib/pricing/store.ts), que
 * recalcula todo antes de guardar: los números que lee la IA nunca vienen del navegador.
 *
 * Two related answers for a merchant selling under a confirm-then-deliver
 * funnel, where revenue is only collected on *delivered* orders:
 *
 * 1. The minimum sale price that breaks even once the cost of unconfirmed and
 *    undelivered orders is amortized over the ones that actually pay.
 * 2. The break-even ROAS (BEROAS) and maximum CPA for a given sale price.
 *
 * The minimum price is reverse-engineered so that, at that price, the maximum
 * affordable CPA equals the merchant's target acquisition cost
 * (`purchaseCostLimit`). Selling above the minimum yields positive profit.
 */

/** Raw inputs as collected from the form (rates expressed as percentages). */
export interface PricingInputs {
  /** Product acquisition cost. Required to compute anything. */
  unitCost: number;
  /** Target/maximum acquisition cost (CPA) per delivered order. */
  purchaseCostLimit: number;
  /** Average shipping cost per dispatched order. */
  avgShippingCost: number;
  /** Call-center confirmation rate, as a percentage (0–100). */
  confirmationRate: number;
  /** Delivery rate over confirmed orders, as a percentage (0–100). */
  deliveryRate: number;
}

/** Rounding step applied (upwards) to the suggested minimum price. */
export const PRICE_ROUNDING_STEP = 100;

/**
 * Redondeo por moneda. v1 era solo CLP (mínimo al 100, precios en …990); las monedas de montos
 * chicos (MXN, PEN, BRL, USD…) redondean a la unidad y terminan en 9 (349, 89).
 */
export interface RoundingRules {
  step: number;
  charmStep: number;
  charmEnding: number;
}

export const CLP_ROUNDING: RoundingRules = { step: 100, charmStep: 1000, charmEnding: 990 };
const SMALL_UNIT_ROUNDING: RoundingRules = { step: 1, charmStep: 10, charmEnding: 9 };
/** Monedas de montos grandes, donde un precio se lee en miles. */
const LARGE_UNIT_CURRENCIES = new Set(["CLP", "COP", "PYG", "ARS", "CRC"]);

export function roundingFor(currency: string): RoundingRules {
  return LARGE_UNIT_CURRENCIES.has(currency) ? CLP_ROUNDING : SMALL_UNIT_ROUNDING;
}

/** Charm-pricing block (CLP): prices are bumped up to end in `…990`. */
export const CHARM_PRICE_STEP = 1000;
export const CHARM_PRICE_ENDING = 990;

/**
 * Round a value up to the nearest multiple of `step`.
 *
 * Note: the reference UI labels this "nearest multiple", but the observed
 * behavior is a ceiling — a price below the rounded value would not break even.
 */
export function ceilToStep(value: number, step = PRICE_ROUNDING_STEP): number {
  return Math.ceil(value / step) * step;
}

/**
 * Smallest charm price (`…990`) greater than or equal to `value`.
 *
 * The course computes the break-even minimum and then manually bumps it to a
 * psychological `…990` figure (e.g. 24.700 → 24.990). This is always ≥ the
 * minimum, so it never breaks the break-even guarantee.
 *
 * @example charmPrice(24700) // → 24990
 * @example charmPrice(24990) // → 24990  (already charm)
 * @example charmPrice(25010) // → 25990
 */
export function charmPrice(value: number, rules: RoundingRules = CLP_ROUNDING): number {
  const base = Math.floor(value / rules.charmStep) * rules.charmStep;
  const candidate = base + rules.charmEnding;
  return candidate >= value ? candidate : candidate + rules.charmStep;
}

/** Result of {@link computeMinimumPrice}. */
export interface MinimumPriceResult {
  /** Unrounded break-even price per delivered order. */
  raw: number;
  /** `raw` rounded up to {@link PRICE_ROUNDING_STEP}; the suggested minimum. */
  rounded: number;
  /** `raw` bumped up to the next charm price (`…990`); the suggested sale price. */
  charm: number;
}

/**
 * Per-order overhead amortized by the funnel: the acquisition + shipping cost a
 * single order must carry regardless of how many units it delivers.
 *
 * `overhead = purchaseCostLimit / (conf × delivery) + shipping / delivery`
 *
 * The CPA is paid before confirming and before delivering, so it is amortized by
 * both rates; shipping is paid on dispatch (even when undelivered), so it is
 * amortized by the delivery rate only. Returns `null` when rates are
 * non-positive (the amortization would divide by zero).
 */
export function amortizedOrderOverhead(inputs: PricingInputs): number | null {
  const conf = inputs.confirmationRate / 100;
  const delivery = inputs.deliveryRate / 100;

  if (conf <= 0 || delivery <= 0) return null;

  return (
    inputs.purchaseCostLimit / (conf * delivery) +
    inputs.avgShippingCost / delivery
  );
}

/**
 * Break-even floor for an order that delivers `units` units, sold as ONE order.
 *
 * Acquisition and shipping are paid per *order*, not per unit, so they are
 * counted once via {@link amortizedOrderOverhead}; only the product cost scales
 * with `units`. This is exactly why bundles carry a higher margin than singles:
 * the fixed order overhead is spread over more units of product.
 *
 * `min = units × unitCost + overhead`
 *
 * Returns `null` when `units < 1`, `unitCost` is non-positive, or rates are
 * non-positive.
 *
 * @example
 * computeBundleMinimum({ unitCost: 7000, purchaseCostLimit: 5000,
 *   avgShippingCost: 8000, confirmationRate: 70, deliveryRate: 70 }, 2)
 * // → { raw: 35632.65…, rounded: 35700, charm: 35990 }
 */
export function computeBundleMinimum(
  inputs: PricingInputs,
  units: number,
  rules: RoundingRules = CLP_ROUNDING,
): MinimumPriceResult | null {
  if (units < 1 || inputs.unitCost <= 0) return null;

  const overhead = amortizedOrderOverhead(inputs);
  if (overhead === null) return null;

  const raw = units * inputs.unitCost + overhead;
  return { raw, rounded: ceilToStep(raw, rules.step), charm: charmPrice(raw, rules) };
}

/**
 * Suggested minimum sale price per delivered order (single unit).
 *
 * `min = unitCost + purchaseCostLimit / (conf × delivery) + shipping / delivery`
 *
 * The single-unit case of {@link computeBundleMinimum}. Returns `null` when
 * rates are non-positive or `unitCost` is non-positive — i.e. there is nothing
 * to price yet.
 *
 * @example
 * computeMinimumPrice({ unitCost: 15000, purchaseCostLimit: 5000,
 *   avgShippingCost: 8000, confirmationRate: 70, deliveryRate: 70 })
 * // → { raw: 36632.65…, rounded: 36700, charm: 36990 }
 */
export function computeMinimumPrice(
  inputs: PricingInputs,
  rules: RoundingRules = CLP_ROUNDING,
): MinimumPriceResult | null {
  return computeBundleMinimum(inputs, 1, rules);
}

/** Result of {@link computeBeroasMetrics}. */
export interface BeroasMetrics {
  /** Expected revenue per generated order: `price × conf × delivery`. */
  realRevenue: number;
  /** Expected cost per generated order. */
  realCost: number;
  /** Maximum affordable CPA per received order: `realRevenue − realCost`. */
  maxCpa: number;
  /**
   * Break-even ROAS: `price / maxCpa`. `null` when `maxCpa <= 0`, i.e. the
   * price leaves no room for acquisition spend (no break-even point exists).
   */
  beroas: number | null;
}

/**
 * Break-even ROAS metrics for a given sale price.
 *
 * Both revenue and cost are expressed per *generated* order (probability
 * weighted by the funnel rates), so `maxCpa` is the gross margin left to spend
 * on acquisition per order.
 *
 * Returns `null` when rates are non-positive or `salePrice` is non-positive.
 */
export function computeBeroasMetrics(
  inputs: PricingInputs,
  salePrice: number,
): BeroasMetrics | null {
  const { unitCost, avgShippingCost } = inputs;
  const conf = inputs.confirmationRate / 100;
  const delivery = inputs.deliveryRate / 100;

  if (salePrice <= 0 || conf <= 0 || delivery <= 0) return null;

  const realRevenue = salePrice * conf * delivery;
  const realCost = unitCost * conf * delivery + avgShippingCost * conf;
  const maxCpa = realRevenue - realCost;
  const beroas = maxCpa > 0 ? salePrice / maxCpa : null;

  return { realRevenue, realCost, maxCpa, beroas };
}

/** Result of {@link computeExpectedProfit}. */
export interface ProfitResult {
  /** Expected profit per delivered order: `salePrice − minimumPrice`. */
  amount: number;
  /** Profit as a fraction of the sale price (0–1). */
  margin: number;
}

/**
 * Expected profit and margin for a sale price, relative to the (already
 * rounded) suggested minimum price.
 *
 * Because the minimum price already bakes in the amortized cost of failed
 * orders, any amount above it is profit per delivered order — no extra
 * probability weighting is applied.
 *
 * Returns `null` when the minimum price cannot be computed or `salePrice` is
 * non-positive.
 */
export function computeExpectedProfit(
  inputs: PricingInputs,
  salePrice: number,
  rules: RoundingRules = CLP_ROUNDING,
): ProfitResult | null {
  const minimum = computeMinimumPrice(inputs, rules);
  if (!minimum || salePrice <= 0) return null;

  const amount = salePrice - minimum.rounded;
  return { amount, margin: amount / salePrice };
}

/** Clamp a value to the inclusive `[0, 1]` range (NaN → 0). */
function clampFraction(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** A single tier of a quantity-offer ladder (a bundle of `units` units). */
export interface BundleTier {
  /** Units the customer receives in this offer. */
  units: number;
  /** Break-even floor for this tier (per delivered order). */
  minimum: MinimumPriceResult;
  /** Suggested sale price for the bundle (charm `…990` for `units > 1`). */
  suggestedPrice: number;
  /** Expected profit per delivered order: `suggestedPrice − minimum.rounded`. */
  profit: number;
  /** Profit as a fraction of the suggested price (0–1). */
  margin: number;
  /** Suggested price divided across the units (per-unit price, for display). */
  perUnitPrice: number;
  /**
   * What the same units would cost bought one by one (`units × single price`).
   * The reference the customer compares the bundle against.
   */
  referencePrice: number;
  /**
   * Customer savings versus buying the units separately:
   * `referencePrice − suggestedPrice`. Never negative (a tier priced above the
   * reference reports `0`).
   */
  savings: number;
  /** Savings as a fraction of `referencePrice` (0–1). */
  savingsRate: number;
  /**
   * Whether this tier yields strictly more absolute profit than the previous
   * one — the merchant rule "every extra unit must add profit, not just
   * volume". Always `true` for the first tier.
   */
  earnsMoreThanPrevious: boolean;
}

/** Options for {@link computeOfferLadder}. */
export interface OfferLadderOptions {
  /**
   * Discount applied to each *additional* unit relative to the single-unit
   * price, as a fraction (0–1). e.g. `0.35` → extra units cost 35% less than the
   * first. The first unit always sells at `singlePrice`.
   */
  extraUnitDiscount: number;
  /** Units-delivered tiers to generate. Defaults to `[1, 2, 3]`. */
  tiers?: number[];
  /** Redondeo de la moneda (CLP por defecto). */
  rules?: RoundingRules;
}

/**
 * Build a quantity-offer ladder ("Compra 1 / 2 / 3", BOGO, etc.) from a
 * single-unit sale price.
 *
 * Each tier prices the first unit at `singlePrice` and every additional unit at
 * `singlePrice × (1 − extraUnitDiscount)`, then bumps the multi-unit total to a
 * charm price. Each tier also reports what the customer saves against buying
 * the same units one by one ({@link BundleTier.savings}).
 *
 * Profit and margin use the honest amortized floor
 * ({@link computeBundleMinimum}), so the reported margin already accounts for
 * unconfirmed/undelivered orders — unlike a flat cost-stack, which overstates
 * it. Margins rise across tiers because the fixed order overhead is paid once.
 *
 * Returns `null` when the inputs cannot produce a floor (no unit cost or
 * non-positive rates) or `singlePrice` is non-positive.
 */
export function computeOfferLadder(
  inputs: PricingInputs,
  singlePrice: number,
  options: OfferLadderOptions,
): BundleTier[] | null {
  const rules = options.rules ?? CLP_ROUNDING;
  if (singlePrice <= 0 || computeBundleMinimum(inputs, 1, rules) === null) return null;

  const tiers = options.tiers ?? [1, 2, 3];
  const discount = clampFraction(options.extraUnitDiscount);
  // Price the customer pays for one unit; the reference every tier is compared
  // against when reporting savings.
  const singleTierPrice = Math.round(singlePrice);

  const result: BundleTier[] = [];
  let previousProfit: number | null = null;
  for (const units of tiers) {
    const minimum = computeBundleMinimum(inputs, units, rules);
    if (!minimum) continue;

    // The first unit sells at the single price; extras get the bundle discount.
    const rawPrice = singlePrice + (units - 1) * singlePrice * (1 - discount);
    const suggestedPrice = units === 1 ? singleTierPrice : charmPrice(rawPrice, rules);
    const profit = suggestedPrice - minimum.rounded;
    const referencePrice = units * singleTierPrice;
    const savings = Math.max(0, referencePrice - suggestedPrice);

    result.push({
      units,
      minimum,
      suggestedPrice,
      profit,
      margin: profit / suggestedPrice,
      perUnitPrice: suggestedPrice / units,
      referencePrice,
      savings,
      savingsRate: referencePrice > 0 ? savings / referencePrice : 0,
      earnsMoreThanPrevious:
        previousProfit === null ? true : profit > previousProfit,
    });
    previousProfit = profit;
  }

  return result.length ? result : null;
}

// ---------------------------------------------------------------------------
// Compare-at price (the struck-through "original" shown next to the sale price)
// ---------------------------------------------------------------------------

/**
 * Markup applied over the sale price to suggest the compare-at ("original")
 * price: +30%. It is an ANCHOR, not a price the product was ever sold at, so it
 * is derived from the sale price rather than from the cost structure — the
 * discount the shopper reads must stay believable at any margin.
 */
export const COMPARE_AT_MARKUP = 0.3;

/**
 * Suggested compare-at price for a sale price: `sale × (1 + markup)`, bumped to
 * a charm `…990` figure so the anchor reads like a price and not like a
 * calculation. Returns `null` for a non-positive sale price.
 *
 * @example suggestCompareAtPrice(19990) // → 25990
 */
export function suggestCompareAtPrice(
  salePrice: number,
  markup = COMPARE_AT_MARKUP,
  rules: RoundingRules = CLP_ROUNDING,
): number | null {
  if (salePrice <= 0 || markup < 0) return null;
  return charmPrice(salePrice * (1 + markup), rules);
}

/**
 * Discount percentage the storefront badge announces, rounded to an integer:
 * `(compareAt − sale) / compareAt`. Returns `null` when there is no real
 * discount to show (missing values, or an anchor at or below the sale price),
 * which is also when the theme hides the badge.
 *
 * @example computeDiscountPercent(19990, 34990) // → 43
 */
export function computeDiscountPercent(
  salePrice: number,
  compareAtPrice: number | null | undefined,
): number | null {
  if (compareAtPrice == null) return null;
  if (salePrice <= 0 || compareAtPrice <= salePrice) return null;
  return Math.round(((compareAtPrice - salePrice) / compareAtPrice) * 100);
}
