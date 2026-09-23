import { describe, expect, it } from "vitest";
import { buildPricingPlan, DEFAULT_EXTRA_UNIT_DISCOUNT, type PricingForm } from "./plan";

// Los números de la captura del comerciante: producto de ~$3.900, 1 unidad casi en equilibrio.
const form: PricingForm = {
  unitCost: 3900,
  avgShippingCost: 8000,
  purchaseCostLimit: 4500, // equilibrio de 1 unidad: $24.600, como en la captura
  confirmationRate: 70,
  deliveryRate: 70,
  salePrice: 24990,
  compareAtPrice: null,
  extraUnitDiscount: DEFAULT_EXTRA_UNIT_DISCOUNT,
};

describe("buildPricingPlan · packs", () => {
  it("con el 50 % por defecto, el pack de 3 queda al precio de 2", () => {
    const plan = buildPricingPlan(form, "CLP")!;
    expect(plan.packs.find((p) => p.units === 3)!.price).toBe(49990);
    expect(plan.packs.find((p) => p.units === 2)!.price).toBe(37990);
  });

  it("recomienda el pack más grande mientras cada uno gane más que el anterior", () => {
    const plan = buildPricingPlan(form, "CLP")!;
    expect(plan.packs.filter((p) => p.recommended).map((p) => p.units)).toEqual([3]);
  });

  it("dice cuántas veces más gana cada pack que 1 unidad", () => {
    const plan = buildPricingPlan(form, "CLP")!;
    const single = plan.packs[0].profit;
    const three = plan.packs[2];
    expect(three.profitMultiple).toBeCloseTo(three.profit / single);
    expect(three.profitMultiple!).toBeGreaterThan(10);
  });

  it("si un pack no gana más que el anterior, recomienda el último que sí", () => {
    // 95 % de descuento: el pack de 3 gana menos que el de 2.
    const plan = buildPricingPlan({ ...form, unitCost: 9000, extraUnitDiscount: 95 }, "CLP")!;
    const rec = plan.packs.find((p) => p.recommended)!;
    expect(rec.units).toBeLessThan(3);
  });
});

describe("buildPricingPlan · la captura", () => {
  it("reproduce los números del comerciante con 35 %", () => {
    const plan = buildPricingPlan({ ...form, extraUnitDiscount: 35 }, "CLP")!;
    expect(plan.minimumPrice).toBe(24600);
    expect(plan.packs.map((p) => [p.price, p.profit])).toEqual([
      [24990, 390],
      [41990, 13490],
      [57990, 25590],
    ]);
  });
});
