import { describe, expect, it } from "vitest";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { customerAvatarSystem, customerAvatarUser, marketBlock, packLabelsSystem, packLabelsUser, productBriefSystem, productBriefUser } from "./prompts";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import { avatarStepSchema, customerAvatarSchema, packLabelsOnlySchema, productBriefSchema, readAvatar, type ProductBrief } from "./schemas";

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

  it("el system prompt es estable por mercado (se cachea)", () => {
    expect(productBriefSystem(CL)).toBe(productBriefSystem({ ...CL }));
    expect(customerAvatarSystem(CL)).toBe(customerAvatarSystem({ ...CL }));
  });

  it("el género no se adivina por la categoría ni por las fotos", () => {
    expect(productBriefSystem(CL)).toContain("Una modelo en las fotos o una categoría como «belleza» no lo deciden");
  });

  it("el cliente ideal es la pregunta de un experto: corto, sin fórmula, nombre ni escenas", () => {
    const sys = customerAvatarSystem(CL);
    expect(sys).not.toContain("[NOMBRE]");
    expect(sys).toContain("sin nombre, sin anécdotas y sin frases inventadas");
    expect(sys.split("\n").length).toBeLessThan(30);
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

  it("la ficha lista las imágenes por id y lleva el precio y los packs del comerciante", () => {
    const u = productBriefUser({ title: "Corrector", price: 24990, pricing, baseInfo: "neopreno", images: [{ id: "img-1", source: "shopify" }] }, CL);
    expect(u).toContain("img-1");
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("Precio de 1 unidad: $24.990");
    expect(u).toContain("Precio tachado: $32.990");
    expect(u).toContain("Precio de compra al proveedor: $3.000");
    expect(u).toMatch(/2 unidades: \$\d/);
    expect(u).not.toContain("Precio publicado hoy en Shopify"); // igual al de la calculadora
  });

  it("avisa si el precio publicado en Shopify es otro", () => {
    const u = productBriefUser({ title: "Corrector", price: 19990, pricing, baseInfo: "", images: [] }, CL);
    expect(u).toContain("Precio publicado hoy en Shopify: $19.990");
  });

  it("con el 50 % el pack de 3 es la oferta principal y se anuncia como «lleva 3, paga 2»", () => {
    const p50 = buildPricingPlan({ ...pricing, compareAtPrice: null, extraUnitDiscount: 50 }, "CLP")!;
    const u = productBriefUser({ title: "Corrector", pricing: p50, baseInfo: "", images: [] }, CL);
    expect(u).toContain("Pack 3 unidades: $49.990");
    expect(u).toContain("«lleva 3, paga 2»");
    expect(u).toContain("OFERTA PRINCIPAL: Pack 3 unidades a $49.990");
  });

  it("etiquetas de los packs: duración solo con datos reales y sin «tratamiento»", () => {
    for (const sys of [customerAvatarSystem(CL), packLabelsSystem(CL)]) {
      expect(sys).toContain("ETIQUETAS DE LOS PACKS");
      expect(sys).toContain("nunca inventes una dosis");
      expect(sys).toContain("nunca «2 meses de tratamiento»");
    }
    expect(productBriefSystem(CL)).toContain("cuánto trae ni cuánto se usa");
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

  it("el cliente ideal también recibe el precio y los packs", () => {
    const u = customerAvatarUser(brief, "neopreno", pricing);
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("Pack 3 unidades");
    expect(u).toContain("OFERTA PRINCIPAL");
  });

  it("el cliente ideal recibe texto corto: los hechos y el texto del proveedor, sin la ficha en JSON", () => {
    const u = customerAvatarUser(brief, "neopreno", pricing);
    expect(u).toMatch(/^PRODUCTO: Corrector de postura/);
    expect(u).toContain("- Talla: Única");
    expect(u).toContain("Lo que dice el proveedor, tal cual:\nneopreno");
    expect(u).not.toMatch(/"(what_it_does|key_facts|proof)"\s*:/);
    expect(u).toMatch(/¿Quién compra este producto, quién lo usa y por qué\?/);
  });
});

describe("esquemas", () => {
  it("se pueden convertir a JSON Schema para structured outputs", async () => {
    const { toJSONSchema } = await import("zod/v4");
    expect(toJSONSchema(productBriefSchema)).toHaveProperty("properties.missing_inputs");
    expect(toJSONSchema(customerAvatarSchema)).toHaveProperty("properties.why_buy");
    expect(toJSONSchema(avatarStepSchema)).toHaveProperty("properties.pack_labels");
    expect(toJSONSchema(packLabelsOnlySchema)).toHaveProperty("properties.pack_labels");
  });
});
