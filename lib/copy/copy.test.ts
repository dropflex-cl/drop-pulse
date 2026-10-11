import { buildPricingPlan } from "@/lib/pricing/plan";
import { describe, expect, it } from "vitest";
import { allowedAmounts, amountAllowed, amountsIn } from "./schemas";
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;

describe("montos de la página", () => {
  it("precio, tachado, ahorro y cada pack", () => {
    const amounts = allowedAmounts(pricing);
    expect(amounts).toContain(24990);
    expect(amounts).toContain(32990);
    expect(amounts).toContain(8000);
    expect(amounts).toContain(pricing.packs[1].price);
  });

  it("acepta el redondeo de un monto permitido, no un monto inventado", () => {
    const amounts = allowedAmounts(pricing);
    const pack3 = pricing.packs[2].price;
    expect(amountAllowed(Math.round(pack3 / 1000) * 1000, amounts)).toBe(true);
    expect(amountAllowed(Math.round(pricing.packs[2].perUnitPrice), amounts)).toBe(true);
    expect(amountAllowed(12345, amounts)).toBe(false);
    expect(amounts).toContain(pricing.salePrice - pricing.packs[1].perUnitPrice);
  });

  it("lee los montos con el símbolo de la moneda", () => {
    expect(amountsIn("2 por $39.990 · antes $ 49.990", "CLP")).toEqual([39990, 49990]);
    expect(amountsIn("Llega en 3 días", "CLP")).toEqual([]);
  });
});
