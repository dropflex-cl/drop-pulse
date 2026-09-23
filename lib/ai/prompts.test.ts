import { describe, expect, it } from "vitest";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { customerAvatarSystem, customerAvatarUser, marketBlock, productBriefSystem, productBriefUser } from "./prompts";
import { customerAvatarSchema, productBriefSchema } from "./schemas";

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
    expect(u).toContain("Precio de venta: $24.990");
    expect(u).toContain("Precio tachado: $32.990");
    expect(u).toContain("Precio de compra al proveedor: $3.000");
    expect(u).toMatch(/2 unidades: \$\d/);
    expect(u).not.toContain("Precio publicado hoy en Shopify"); // igual al de la calculadora
  });

  it("avisa si el precio publicado en Shopify es otro", () => {
    const u = productBriefUser({ title: "Corrector", price: 19990, pricing, baseInfo: "", images: [] }, CL);
    expect(u).toContain("Precio publicado hoy en Shopify: $19.990");
  });

  it("el cliente ideal también recibe el precio y los packs", () => {
    const u = customerAvatarUser("{}", "neopreno", pricing);
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("3 unidades");
  });
});

describe("esquemas", () => {
  it("se pueden convertir a JSON Schema para structured outputs", async () => {
    const { toJSONSchema } = await import("zod/v4");
    expect(toJSONSchema(productBriefSchema)).toHaveProperty("properties.missing_inputs");
    expect(toJSONSchema(customerAvatarSchema)).toHaveProperty("properties.formula");
  });
});
