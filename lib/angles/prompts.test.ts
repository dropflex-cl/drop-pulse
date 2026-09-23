import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { SALES_ANGLES } from "./catalog";
import { angleRouterSystem, angleRouterUser, angleSystem, angleUser } from "./prompts";
import { avatarStepSchema } from "@/lib/ai/schemas";
import { angleBriefSchema, angleRouterSchema, evaluationsFrom, routerProblems } from "./schemas";

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
    expect(sys).toContain("3. real_expert (peso 3)");
    expect(sys).toContain("EN EL ORDEN NUMERADO");
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
  /** Tamaño aproximado de la gramática: campos, objetos y valores de enum, sin descripciones. */
  function size(schema: unknown): number {
    let n = 0;
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      if (o.type === "object") n += 1 + Object.keys((o.properties as object) ?? {}).length;
      if (Array.isArray(o.enum)) n += o.enum.length;
      for (const v of Object.values(o)) walk(v);
    };
    walk(schema);
    return n;
  }

  it("se convierten a JSON schema (salida estructurada)", async () => {
    const { toJSONSchema } = await import("zod/v4");
    expect(toJSONSchema(angleRouterSchema)).toHaveProperty("properties.angles.items.properties.scores");
    for (const a of SALES_ANGLES) expect(toJSONSchema(angleBriefSchema(a))).toHaveProperty("properties.details");
  });

  // La API rechaza gramáticas muy grandes (400 «compiled grammar is too large»). El paso del cliente
  // ideal funciona en producción: ningún esquema de ángulos puede ser más grande que ese.
  it("no son más grandes que el del cliente ideal", async () => {
    const { toJSONSchema } = await import("zod/v4");
    const limit = size(toJSONSchema(avatarStepSchema));
    expect(size(toJSONSchema(angleRouterSchema))).toBeLessThanOrEqual(limit);
    for (const a of SALES_ANGLES) expect(size(toJSONSchema(angleBriefSchema(a))), a).toBeLessThanOrEqual(limit);
  });

  it("la lista del orquestador pasa a criterios por nombre, en el orden del catálogo", () => {
    const evals = evaluationsFrom({ angles: [{ angle: "offer", scores: [5, 4, 3, 2], penalty: true, why: "w", risks: [] }] });
    expect(evals.offer.criteria).toEqual({ low_ticket_bundle: 5, impulse_or_consumable: 4, obvious_result: 3, real_event: 2 });
    expect(evals.offer.penalty_applies).toBe(true);
    // Un ángulo que el modelo omitió cuenta como 0.
    expect(evals.authority.criteria).toEqual({ professional_domain: 0, expert_would_use: 0, real_expert: 0 });
  });

  const complete = () => [
    { angle: "authority" as const, scores: [4, 3, 0], penalty: true, why: "", risks: [] },
    { angle: "common_enemy" as const, scores: [3, 5, 3], penalty: false, why: "", risks: [] },
    { angle: "unique_mechanism" as const, scores: [5, 4, 4], penalty: false, why: "", risks: [] },
    { angle: "age_identity" as const, scores: [2, 2, 3], penalty: false, why: "", risks: [] },
    { angle: "personal_story" as const, scores: [0, 4, 3], penalty: true, why: "", risks: [] },
    { angle: "offer" as const, scores: [4, 3, 4, 0], penalty: false, why: "", risks: [] },
  ];

  it("acepta una lista completa y rechaza puntajes que no calzan con los criterios", () => {
    expect(routerProblems({ angles: complete() })).toEqual([]);
    const short = complete().map((x) => (x.angle === "offer" ? { ...x, scores: [4, 3, 4] } : x));
    expect(routerProblems({ angles: short })).toEqual(["offer trae 3 puntajes y debe traer 4, uno por criterio en orden."]);
    const range = complete().map((x) => (x.angle === "authority" ? { ...x, scores: [4, 7, 0] } : x));
    expect(routerProblems({ angles: range })).toEqual(["authority tiene puntajes fuera de 0 a 5."]);
  });

  it("rechaza ángulos que faltan o se repiten", () => {
    const missing = complete().filter((x) => x.angle !== "age_identity");
    expect(routerProblems({ angles: missing })).toEqual(["Falta el ángulo age_identity."]);
    const dup = [...complete(), complete()[0]];
    expect(routerProblems({ angles: dup })).toEqual(["El ángulo authority viene 2 veces."]);
  });

  it("el reintento le dice al modelo qué falló", () => {
    const u = angleRouterUser(ctx, ["offer trae 3 puntajes y debe traer 4, uno por criterio en orden."]);
    expect(u).toContain("Tu respuesta anterior no se pudo puntuar: offer trae 3 puntajes");
    expect(angleRouterUser(ctx)).not.toContain("respuesta anterior");
  });
});
