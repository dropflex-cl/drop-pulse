import { describe, expect, it } from "vitest";

import {
  amortizedOrderOverhead,
  charmPrice,
  roundingFor,
  computeBeroasMetrics,
  computeBundleMinimum,
  computeMinimumPrice,
  computeDiscountPercent,
  computeOfferLadder,
  type PricingInputs,
  suggestCompareAtPrice,
} from "./calculator";

/** Builds PricingInputs with course-default rates; override per case. */
function inputs(over: Partial<PricingInputs> = {}): PricingInputs {
  return {
    unitCost: 7000,
    purchaseCostLimit: 5000,
    avgShippingCost: 8000,
    confirmationRate: 70,
    deliveryRate: 70,
    ...over,
  };
}

/**
 * Independent ground-truth P&L, built by accounting over a cohort of generated
 * orders WITHOUT using any closed-form from the module under test. Returns the
 * profit per delivered order. Used to cross-check the formulas algebraically.
 *
 * - Ads are paid on every *generated* order.
 * - Shipping is paid on every *dispatched* (= confirmed) order, even if the
 *   delivery later fails (the courier still charges for the rejected trip).
 * - Product cost and revenue land only on *delivered* orders.
 */
function simulateProfitPerDelivered(args: {
  price: number;
  units: number;
  unitCost: number;
  cpa: number;
  shipping: number;
  confRate: number; // percent
  delivRate: number; // percent
}): number {
  const generated = 1_000_000;
  const conf = args.confRate / 100;
  const deliv = args.delivRate / 100;
  const confirmed = generated * conf;
  const delivered = confirmed * deliv;

  const revenue = delivered * args.price;
  const adSpend = generated * args.cpa;
  const shippingCost = confirmed * args.shipping; // dispatched = confirmed
  const productCost = delivered * args.units * args.unitCost;

  return (revenue - adSpend - shippingCost - productCost) / delivered;
}

describe("amortizedOrderOverhead", () => {
  it("amortizes CPA by both rates and shipping by delivery only", () => {
    // 5000 / (0.7·0.7) + 8000 / 0.7 = 10204.08… + 11428.57… = 21632.65…
    expect(amortizedOrderOverhead(inputs())).toBeCloseTo(21632.65, 1);
  });

  it("returns null when a rate is non-positive", () => {
    expect(amortizedOrderOverhead(inputs({ deliveryRate: 0 }))).toBeNull();
    expect(amortizedOrderOverhead(inputs({ confirmationRate: 0 }))).toBeNull();
  });
});

describe("computeBundleMinimum", () => {
  it("single unit equals computeMinimumPrice (refactor preserves behavior)", () => {
    const single = computeBundleMinimum(inputs(), 1);
    expect(single).toEqual(computeMinimumPrice(inputs()));
  });

  it("only the product cost scales with units; overhead is paid once", () => {
    const one = computeBundleMinimum(inputs(), 1)!;
    const two = computeBundleMinimum(inputs(), 2)!;
    const three = computeBundleMinimum(inputs(), 3)!;
    // Each extra unit adds exactly one unitCost to the raw floor.
    expect(two.raw - one.raw).toBeCloseTo(7000, 6);
    expect(three.raw - two.raw).toBeCloseTo(7000, 6);
  });

  it("matches the documented two-unit example", () => {
    const r = computeBundleMinimum(inputs(), 2)!;
    expect(r.raw).toBeCloseTo(35632.65, 1);
    expect(r.rounded).toBe(35700);
    expect(r.charm).toBe(35990);
  });

  it("returns null for units < 1, no unit cost, or zero rates", () => {
    expect(computeBundleMinimum(inputs(), 0)).toBeNull();
    expect(computeBundleMinimum(inputs({ unitCost: 0 }), 2)).toBeNull();
    expect(computeBundleMinimum(inputs({ deliveryRate: 0 }), 2)).toBeNull();
  });
});

describe("computeOfferLadder", () => {
  it("tier 1 sells at the single price; extra units carry the discount", () => {
    const ladder = computeOfferLadder(inputs(), 28990, {
      extraUnitDiscount: 0.35,
    })!;
    expect(ladder).toHaveLength(3);
    expect(ladder[0].units).toBe(1);
    expect(ladder[0].suggestedPrice).toBe(28990);
    // Unit 2 priced at 28990·0.65 = 18843.5 added → 47833.5 → charm 47990.
    expect(ladder[1].suggestedPrice).toBe(47990);
  });

  it("margin rises across tiers and each tier earns strictly more", () => {
    const ladder = computeOfferLadder(inputs(), 28990, {
      extraUnitDiscount: 0.35,
    })!;
    expect(ladder[0].margin).toBeLessThan(ladder[1].margin);
    expect(ladder[1].margin).toBeLessThan(ladder[2].margin);
    expect(ladder[0].earnsMoreThanPrevious).toBe(true); // first tier
    expect(ladder[1].earnsMoreThanPrevious).toBe(true);
    expect(ladder[2].earnsMoreThanPrevious).toBe(true);
  });

  it("reports what the customer saves against buying the units separately", () => {
    const ladder = computeOfferLadder(inputs(), 28990, {
      extraUnitDiscount: 0.35,
    })!;
    // Tier 1 is the reference itself: nothing to save.
    expect(ladder[0].referencePrice).toBe(28990);
    expect(ladder[0].savings).toBe(0);
    expect(ladder[0].savingsRate).toBe(0);
    // Tier 2: 2 × 28990 = 57980 vs the 47990 bundle → 9990 saved.
    expect(ladder[1].referencePrice).toBe(57980);
    expect(ladder[1].savings).toBe(9990);
    expect(ladder[1].savingsRate).toBeCloseTo(9990 / 57980, 6);
    // The savings rate equals the per-unit discount vs the single price.
    expect(ladder[1].savingsRate).toBeCloseTo(
      1 - ladder[1].perUnitPrice / ladder[0].suggestedPrice,
      6,
    );
    // Savings grow with the tier.
    expect(ladder[2].savings).toBeGreaterThan(ladder[1].savings);
  });

  it("reports zero savings when the bundle costs as much as buying singles", () => {
    const ladder = computeOfferLadder(inputs(), 28990, {
      extraUnitDiscount: 0,
    })!;
    // No discount: charm rounding can push the bundle *above* the reference,
    // which is never reported as negative savings.
    expect(ladder[1].savings).toBe(0);
    expect(ladder[1].savingsRate).toBe(0);
  });

  it("flags a tier that earns less when the discount is too aggressive", () => {
    // A near-total discount makes extra units sell below their marginal cost,
    // so the bundle earns less in absolute terms than the single.
    const ladder = computeOfferLadder(inputs(), 28990, {
      extraUnitDiscount: 0.95,
    })!;
    expect(ladder[1].earnsMoreThanPrevious).toBe(false);
  });

  it("returns null for a non-positive price or unpriceable inputs", () => {
    expect(
      computeOfferLadder(inputs(), 0, { extraUnitDiscount: 0.3 }),
    ).toBeNull();
    expect(
      computeOfferLadder(inputs({ unitCost: 0 }), 28990, {
        extraUnitDiscount: 0.3,
      }),
    ).toBeNull();
  });
});

describe("ground-truth cross-check (independent simulation)", () => {
  const cases: Array<Partial<PricingInputs>> = [
    {}, // 7000 / 5000 / 8000 / 70 / 70
    {
      unitCost: 3000,
      purchaseCostLimit: 5000,
      confirmationRate: 75,
      deliveryRate: 75,
    },
    {
      unitCost: 12000,
      purchaseCostLimit: 2000,
      avgShippingCost: 6500,
      confirmationRate: 80,
      deliveryRate: 65,
    },
  ];

  for (const over of cases) {
    const i = inputs(over);
    for (const units of [1, 2, 3]) {
      it(`break-even floor → 0 profit (units=${units}, ${i.unitCost}/${i.confirmationRate}/${i.deliveryRate})`, () => {
        const floor = computeBundleMinimum(i, units)!;
        const simulated = simulateProfitPerDelivered({
          price: floor.raw, // price exactly at the computed break-even
          units,
          unitCost: i.unitCost,
          cpa: i.purchaseCostLimit, // floor assumes actual CPA = the limit
          shipping: i.avgShippingCost,
          confRate: i.confirmationRate,
          delivRate: i.deliveryRate,
        });
        expect(simulated).toBeCloseTo(0, 4);
      });
    }

    it(`maxCpa → 0 profit at that CPA (${i.unitCost}/${i.confirmationRate}/${i.deliveryRate})`, () => {
      const price = computeBundleMinimum(i, 1)!.charm;
      const maxCpa = computeBeroasMetrics(i, price)!.maxCpa;
      const simulated = simulateProfitPerDelivered({
        price,
        units: 1,
        unitCost: i.unitCost,
        cpa: maxCpa, // spend exactly the max affordable CPA
        shipping: i.avgShippingCost,
        confRate: i.confirmationRate,
        delivRate: i.deliveryRate,
      });
      expect(simulated).toBeCloseTo(0, 4);
    });
  }
});

describe("suggestCompareAtPrice", () => {
  it("marks the sale price up 30% and lands on a charm figure", () => {
    // 19.990 × 1.3 = 25.987 → the next …990 above it.
    expect(suggestCompareAtPrice(19990)).toBe(25990);
  });

  it("always suggests an anchor strictly above the sale price", () => {
    for (const sale of [990, 4990, 12500, 19990, 34990, 129990]) {
      expect(suggestCompareAtPrice(sale)!).toBeGreaterThan(sale);
    }
  });

  it("honors a custom markup", () => {
    // 20.000 × 1.75 = 35.000 → 35.990.
    expect(suggestCompareAtPrice(20000, 0.75)).toBe(35990);
  });

  it("returns null without a usable sale price", () => {
    expect(suggestCompareAtPrice(0)).toBeNull();
    expect(suggestCompareAtPrice(-1)).toBeNull();
  });
});

describe("computeDiscountPercent", () => {
  it("reports the discount off the anchor, rounded", () => {
    // The reference design: 19.990 struck from 34.990 reads "AHORRA 43%".
    expect(computeDiscountPercent(19990, 34990)).toBe(43);
  });

  it("is null when there is no real discount to announce", () => {
    expect(computeDiscountPercent(19990, null)).toBeNull();
    expect(computeDiscountPercent(19990, undefined)).toBeNull();
    expect(computeDiscountPercent(19990, 19990)).toBeNull();
    expect(computeDiscountPercent(19990, 15990)).toBeNull();
    expect(computeDiscountPercent(0, 25990)).toBeNull();
  });

  it("agrees with the default markup: +30% anchors a 23% discount", () => {
    const sale = 19990;
    const anchor = suggestCompareAtPrice(sale)!;
    expect(computeDiscountPercent(sale, anchor)).toBe(23);
  });
});

describe("roundingFor (monedas de montos chicos)", () => {
  it("CLP y COP terminan en 990; MXN y PEN en 9", () => {
    expect(charmPrice(24700, roundingFor("CLP"))).toBe(24990);
    expect(charmPrice(24700, roundingFor("COP"))).toBe(24990);
    expect(charmPrice(341.2, roundingFor("MXN"))).toBe(349);
    expect(charmPrice(89, roundingFor("PEN"))).toBe(89);
    expect(charmPrice(89.5, roundingFor("PEN"))).toBe(99);
  });
  it("el mínimo en MXN se redondea a la unidad", () => {
    const m = computeMinimumPrice({ unitCost: 120, purchaseCostLimit: 80, avgShippingCost: 90, confirmationRate: 70, deliveryRate: 70 }, roundingFor("MXN"))!;
    expect(m.rounded).toBe(Math.ceil(m.raw));
    expect(m.charm % 10).toBe(9);
  });
});
