import { describe, expect, it } from "vitest";
import { canVisit, pendingStep, saveSelection, skipMeta, suggestedNumbers } from "./service";
import type { OnboardingState } from "./types";

const base: OnboardingState = { version: 1, userId: "u1", selected: [], checklistHidden: false };
const shop = { status: "importing" as const, domain: "a.myshopify.com", imported: 10, total: 50, currency: "CLP" };

describe("paso pendiente", () => {
  it("Shopify es obligatorio; la importación no bloquea", () => {
    expect(pendingStep(base)).toBe("shopify");
    expect(pendingStep({ ...base, shop: { ...shop, status: "error" } })).toBe("shopify");
    expect(pendingStep({ ...base, shop })).toBe("productos");
  });

  it("Meta se puede saltar", () => {
    const withNumbers = { ...base, shop, selected: ["1"], numbers: { deliveredOf10: 8, shipping: 3500, maxCpa: 6000, suggested: true } };
    expect(pendingStep(withNumbers)).toBe("meta");
    const skipped = skipMeta(withNumbers, 1);
    expect(pendingStep(skipped)).toBe("listo");
    expect(canVisit(skipped, "listo")).toBe(true);
  });
});

describe("selección", () => {
  it("solo productos del catálogo, hasta el límite del plan", () => {
    expect(saveSelection(base, ["1", "x"], new Set(["1"])).selected).toEqual(["1"]);
    expect(() => saveSelection(base, ["x"], new Set(["1"]))).toThrow("Elige al menos un producto");
    const ids = Array.from({ length: 11 }, (_, i) => String(i));
    expect(() => saveSelection(base, ids, new Set(ids))).toThrow("Quita 1");
  });
});

describe("números sugeridos", () => {
  it("en CLP, los del design system", () => {
    expect(suggestedNumbers("CLP", [1000])).toEqual({ deliveredOf10: 8, shipping: 9000, maxCpa: 6000 });
  });
  it("en otra moneda, proporcionales a la mediana de precios", () => {
    expect(suggestedNumbers("USD", [10, 25, 40])).toEqual({ deliveredOf10: 8, shipping: 3.5, maxCpa: 6 });
  });
});
