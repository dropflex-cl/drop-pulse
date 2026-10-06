import type { ProductBrief } from "@/lib/ai/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { describe, expect, it } from "vitest";
import { tipFactText, tipProblems } from "./tip";
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const brief = {
  product_name: "Corrector de postura",
  category: "dolor y postura",
  what_it_does: "Lleva los hombros hacia atrás mientras trabajas sentado.",
  how_it_works: "Bandas elásticas cruzadas en la espalda.",
  key_facts: [{ label: "Modo de uso", value: "Úsalo sobre una polera, 20 minutos el primer día." }],
  forbidden_claims: ["curar la escoliosis"],
} as unknown as ProductBrief;
const factText = tipFactText(brief, "Se ajusta con velcro.");
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
