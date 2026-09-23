import { describe, expect, it } from "vitest";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { customerAvatarSystem, customerAvatarUser, marketBlock, packLabelsSystem, packLabelsUser, productBriefSystem, productBriefUser } from "./prompts";
import { avatarStepSchema, customerAvatarSchema, packLabelsOnlySchema, productBriefSchema } from "./schemas";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };

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

  it("el avatar recibe la plantilla de la fórmula (en dropflex base se nombraba pero no se enviaba)", () => {
    expect(customerAvatarSystem(CL)).toContain("El nombre de mi cliente ideal es [NOMBRE].");
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
    const u = packLabelsUser("{}", null, pricing, ["2 meses de uso"]);
    expect(u).toContain("No repitas estas: «2 meses de uso»");
    expect(u).toContain("PRECIO Y OFERTA");
  });

  it("las etiquetas aprobadas viajan con el precio", () => {
    const b = pricingBlock(pricing, [{ units: 2, label: "2 meses de uso", support: null, badge: null, basis: "duration", reason: "" }]);
    expect(b).toContain("se presenta como «2 meses de uso»");
  });

  it("el cliente ideal también recibe el precio y los packs", () => {
    const u = customerAvatarUser("{}", "neopreno", pricing);
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("Pack 3 unidades");
    expect(u).toContain("La oferta principal es el pack");
  });
});

describe("esquemas", () => {
  it("se pueden convertir a JSON Schema para structured outputs", async () => {
    const { toJSONSchema } = await import("zod/v4");
    expect(toJSONSchema(productBriefSchema)).toHaveProperty("properties.missing_inputs");
    expect(toJSONSchema(customerAvatarSchema)).toHaveProperty("properties.formula");
    expect(toJSONSchema(avatarStepSchema)).toHaveProperty("properties.pack_labels");
    expect(toJSONSchema(packLabelsOnlySchema)).toHaveProperty("properties.pack_labels");
  });
});
