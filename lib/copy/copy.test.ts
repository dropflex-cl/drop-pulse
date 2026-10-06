import { buildPricingPlan } from "@/lib/pricing/plan";
import { describe, expect, it } from "vitest";
import { WRITTEN, toWrite } from "./page-schema";
import { copyProgress, enabledLabel } from "./progress";
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

describe("qué escribir", () => {
  const ids = WRITTEN.map((c) => c.id);

  it("todo, menos lo que necesita reseñas que no hay", () => {
    const none = toWrite([], 0);
    expect(none[0]).toBe("listing");
    expect(none).not.toContain("review-slider");
    expect(none).not.toContain("review-stars");
    expect(toWrite([], 2)).not.toContain("review-stars");
    // review-wall pide 4: un muro de 2 por fila con menos se ve vacío.
    expect(toWrite([], 3)).toEqual(["listing", ...ids.filter((id) => id !== "review-wall")]);
    expect(toWrite([], 4)).toEqual(["listing", ...ids]);
  });

  it("al reescribir, sin lo aprobado", () => {
    const rows = [
      { component: "listing", status: "approved" },
      { component: "inventory", status: "approved" },
      { component: "faq-and-text", status: "generated" },
    ];
    const write = toWrite(rows, 5);
    expect(write).not.toContain("listing");
    expect(write).not.toContain("inventory");
    expect(write).toContain("faq-and-text");
  });
});

describe("progreso de la página", () => {
  it("la etapa termina con la ficha aprobada; los componentes cuentan en el resumen", () => {
    expect(copyProgress([])).toMatchObject({ listing: "missing", complete: false, total: 0 });
    const items = [
      { component: "listing", status: "generado" as const, enabled: true },
      { component: "inventory", status: "aprobado" as const, enabled: true },
      { component: "faq-and-text", status: "generado" as const, enabled: false },
    ];
    expect(copyProgress(items)).toEqual({ total: 2, enabled: 1, listing: "pending", complete: false });
    expect(copyProgress([{ ...items[0], status: "aprobado" }, ...items.slice(1)]).complete).toBe(true);
    expect(enabledLabel(0)).toBe("Sin componentes en la página");
    expect(enabledLabel(1)).toBe("1 componente en la página");
    expect(enabledLabel(4)).toBe("4 componentes en la página");
  });
});
