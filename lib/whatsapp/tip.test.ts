import { buildPricingPlan } from "@/lib/pricing/plan";
import { describe, expect, it } from "vitest";
import { tipProblems } from "./tip";
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const factText = "Lleva los hombros hacia atrás. Úsalo sobre una polera, 20 minutos el primer día. Se ajusta con velcro.";
const problems = (tip: string) => tipProblems(tip, { pricing, factText });

describe("consejo de uso", () => {
  it("acepta un consejo concreto con los números de la ficha", () => {
    expect(problems("Úsalo sobre una polera y empieza con 20 minutos el primer día.")).toEqual([]);
  });

  it("rechaza números inventados, promesas de salud, montos, emojis, formato y largos", () => {
    expect(problems("Úsalo 45 minutos cada mañana.").join()).toMatch(/números que no están/);
    expect(problems("Úsalo a diario y cura el dolor de espalda.").join()).toMatch(/salud/);
    expect(problems("Aprovecha el pack de 2 por $19.990.").join()).toMatch(/monto/);
    expect(problems("Úsalo sobre una polera 💪").join()).toMatch(/emojis/);
    expect(problems("Úsalo *siempre* sobre una polera.").join()).toMatch(/formato/);
    expect(problems(`Úsalo ${"sobre una polera ".repeat(10)}`).join()).toMatch(/pasa de 140/);
    expect(problems("Un consejo: úsalo sobre una polera.").join()).toMatch(/repite/);
    expect(problems("Según la ficha, úsalo sobre una polera.").join()).toMatch(/internas/);
    expect(problems("   ")).toHaveLength(1);
  });
});
