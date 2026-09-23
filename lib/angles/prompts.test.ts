import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { SALES_ANGLES } from "./catalog";
import { angleRouterSystem, angleRouterUser, angleSystem, angleUser } from "./prompts";
import { angleBriefSchema, angleRouterSchema } from "./schemas";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const ctx = { brief: { product_name: "Corrector" } as unknown as ProductBrief, avatar: AVATAR, pricing, baseInfo: "neopreno" };

describe("prompts de ángulos", () => {
  it("el orquestador lista los 6 ángulos con sus criterios y no calcula el total", () => {
    const sys = angleRouterSystem(CL);
    for (const a of SALES_ANGLES) expect(sys).toContain(`${a} — `);
    expect(sys).toContain("real_expert (peso 3)");
    expect(sys).toContain("NO calcules puntajes totales");
    expect(sys).toContain("español neutro con tuteo");
  });

  it("los agentes escriben para LATAM con pago contra entrega, no para EE. UU.", () => {
    for (const a of SALES_ANGLES) {
      const sys = angleSystem(a, CL);
      expect(sys).toContain("Paga al recibir");
      expect(sys).toContain("idioma del mercado");
      expect(sys).not.toMatch(/inglés de EE\. UU\./);
      expect(sys).not.toContain("USD");
    }
  });

  it("el system solo depende del ángulo y del mercado (caché); el producto va en el usuario", () => {
    expect(angleSystem("offer", CL)).toBe(angleSystem("offer", CL));
    const u = angleRouterUser(ctx);
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("CLIENTE IDEAL");
  });

  it("el desarrollo recibe el papel, el otro ángulo y cómo se combinan", () => {
    const u = angleUser("unique_mechanism", ctx, {
      role: "secondary",
      partner: "age_identity",
      combo: "El gancho filtra por oficinistas.",
      why: "Encaja.",
      risks: [],
      aidaEmphasis: "Interés",
      complianceFlags: [],
    });
    expect(u).toContain("Este desarrollo es el secundario");
    expect(u).toContain("El principal es Edad e identidad. Cómo se combinan: El gancho filtra por oficinistas.");
  });
});

describe("esquemas de ángulos", () => {
  it("se convierten a JSON schema (salida estructurada)", async () => {
    const { toJSONSchema } = await import("zod/v4");
    expect(toJSONSchema(angleRouterSchema)).toHaveProperty("properties.angles.properties.authority.properties.criteria.properties.real_expert");
    for (const a of SALES_ANGLES) expect(toJSONSchema(angleBriefSchema(a))).toHaveProperty("properties.details");
  });
});
