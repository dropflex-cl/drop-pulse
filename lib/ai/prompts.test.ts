import { describe, expect, it } from "vitest";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { marketBlock, packLabelsSystem, packLabelsUser } from "./prompts";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import { customerAvatarSchema, packLabelsOnlySchema, readAvatar, type ProductBrief } from "./schemas";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };
const brief = {
  product_name: "Corrector de postura",
  what_it_does: "Lleva los hombros atrás.",
  how_it_works: null,
  key_facts: [{ label: "Talla", value: "Única" }],
  alternatives_already_tried: ["Fajas"],
  proof: { real_expert: null, real_reviews: [], studies_or_certifications: [], units_sold_or_social_proof: null, guarantee_days: null },
} as unknown as ProductBrief;

describe("prompts", () => {
  it("el mercado fija idioma neutro con tuteo, moneda, pago contra entrega y la ley local", () => {
    const m = marketBlock(CL);
    expect(m).toContain("español neutro con tuteo");
    expect(m).toContain("CLP");
    expect(m).toContain("pago contra entrega");
    expect(m).toContain("SERNAC");
  });

  it("Brasil escribe en portugués", () => {
    expect(marketBlock({ countryCode: "BR", currency: "BRL", language: "pt-BR" })).toContain("portugués de Brasil");
  });

  it("los clientes ideales de antes (con fórmula, momentos y frases) se leen con lo que sirve", () => {
    const legacy = {
      name: "Andrés",
      summary: "Andrés, 38, oficinista",
      demographics: { age_range: "30-45", gender: "male" },
      emotions: { core_motivation: "Recuperar el control de su cuerpo" },
      objections: { main_objection: "Son incómodos", critical_question: "¿Se nota?", cash_on_delivery_concerns: "Pagar al recibir lo calma" },
      voice_of_customer: ["Llego con la espalda molida"],
      formula: "El nombre de mi cliente ideal es Andrés.",
    };
    expect(readAvatar(legacy)).toEqual({
      summary: "Andrés, 38, oficinista",
      buyer: "Andrés, 38, oficinista",
      user: "",
      age_range: "30-45",
      why_buy: "Recuperar el control de su cuerpo",
      doubts: ["Son incómodos", "¿Se nota?"],
      cash_on_delivery: "Pagar al recibir lo calma",
      more_than_one: "",
    });
    expect(readAvatar(AVATAR)).toEqual(AVATAR);
  });

  const pricing = buildPricingPlan(
    { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 35 },
    "CLP",
  )!;

  it("etiquetas de los packs: duración solo con datos reales y sin «tratamiento»", () => {
    const sys = packLabelsSystem(CL);
    expect(sys).toContain("ETIQUETAS DE LOS PACKS");
    expect(sys).toContain("nunca inventes una dosis");
    expect(sys).toContain("nunca «2 meses de tratamiento»");
  });

  it("«otras etiquetas» no repite las anteriores", () => {
    const u = packLabelsUser(brief, AVATAR, pricing, ["2 meses de uso"]);
    expect(u).toContain("No repitas estas: «2 meses de uso»");
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain(`Por qué llevaría más de uno: ${AVATAR.more_than_one}`);
    expect(u).not.toMatch(/^\s*[{[]/m);
  });

  it("las etiquetas aprobadas viajan con el precio", () => {
    const b = pricingBlock(pricing, [{ units: 2, label: "2 meses de uso", support: null, badge: null, basis: "duration", reason: "" }]);
    expect(b).toContain("se presenta como «2 meses de uso»");
  });

});

describe("esquemas", () => {
  it("se pueden convertir a JSON Schema para structured outputs", async () => {
    const { toJSONSchema } = await import("zod/v4");
    expect(toJSONSchema(customerAvatarSchema)).toHaveProperty("properties.why_buy");
    expect(toJSONSchema(packLabelsOnlySchema)).toHaveProperty("properties.pack_labels");
  });
});
