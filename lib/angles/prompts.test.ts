import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { modelCriteria, SALES_ANGLES } from "./catalog";
import { angleRouterContext, angleRouterSystem, angleRouterTail, angleRouterUser, angleSystem, angleUser } from "./prompts";
import { avatarStepSchema } from "@/lib/ai/schemas";
import { angleBriefSchema, angleRouterSchema, evaluationsFrom, routerProblems, SCORE_KEYS } from "./schemas";

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
    expect(sys).toContain("c3. real_expert (peso 3)");
    expect(sys).toContain("en c1, c2 y c3");
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

  it("el desarrollo recibe su ángulo, que es uno de varios, y los otros para no repetirlos", () => {
    const angle = { slot: 2 as const, frame: "unique_mechanism" as const, title: "La crema sella", pain_or_desire: "Cara tirante", segment: "Usa crema", promise: "El paso previo", trigger_moment: "7 AM", competition: "Nadie lo dice" };
    const u = angleUser("unique_mechanism", { ...ctx, differentiator: { versus: "su crema", claim: "va antes", basis: "" } }, {
      angle,
      others: [{ ...angle, slot: 1, frame: "age_identity", title: "Tengo 38" }],
      why: "Encaja.",
      risks: [],
      aidaEmphasis: "Interés",
      complianceFlags: [],
    });
    expect(u).toContain("Este es el ángulo 2 de 2");
    expect(u).toContain("100 % este ángulo");
    expect(u).toContain("«La crema sella»");
    expect(u).toContain("«Tengo 38» (Edad e identidad)");
    expect(u).toContain("Frente a su crema: va antes");
    expect(u).not.toMatch(/principal|secundario/);
  });

  it("el orquestador ve el diferenciador y la competencia", () => {
    const u = angleRouterUser({
      ...ctx,
      differentiator: { versus: "su crema", claim: "va antes", basis: "" },
      competitors: [{ url: "https://tienda.cl/p", store_name: "Tienda", price: 19990, compare_at: null, offer: "2x1", main_angle: { pain_or_desire: "arrugas", segment: "40+", promise: "rejuvenece" }, frame: "offer", proof_used: [], tone: "gritón" }],
    });
    expect(u).toContain("DIFERENCIADOR");
    expect(u).toContain("COMPETENCIA (1 tiendas analizadas)");
    expect(u).toContain("ángulo: arrugas → rejuvenece");
    expect(angleRouterUser(ctx)).toContain("sin datos de competencia");
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

  it("todos los ángulos tienen tantos criterios del modelo como campos de scores", () => {
    for (const a of SALES_ANGLES) expect(modelCriteria(a).length, a).toBe(SCORE_KEYS.length);
  });

  it("scores son campos fijos: la gramática impide mandar otra cantidad", async () => {
    const { toJSONSchema } = await import("zod/v4");
    expect(toJSONSchema(angleRouterSchema)).toHaveProperty("properties.angles.items.properties.scores.required", ["c1", "c2", "c3"]);
  });

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

  it("c1, c2 y c3 pasan a criterios por nombre, en el orden del catálogo", () => {
    const evals = evaluationsFrom({ angles: [{ angle: "offer", scores: { c1: 5, c2: 4, c3: 3 }, penalty: true, why: "w", risks: [] }] });
    // real_event lo decide el sistema con la ficha (lib/angles/score.ts), no el modelo.
    expect(evals.offer.criteria).toEqual({ low_ticket_bundle: 5, impulse_or_consumable: 4, obvious_result: 3 });
    expect(evals.offer.penalty_applies).toBe(true);
    // Un ángulo que el modelo omitió cuenta como 0.
    expect(evals.authority.criteria).toEqual({ professional_domain: 0, expert_would_use: 0, real_expert: 0 });
  });

  const candidates = () =>
    [0, 1, 2, 3, 4].map((i) => ({ title: `Ángulo ${i}`, pain_or_desire: "dolor", segment: "seg", promise: "promesa", frame: "offer" as const, trigger_moment: "m", competition: "c", competitors_using: 0 }));
  const complete = () => [
    { angle: "authority" as const, scores: { c1: 4, c2: 3, c3: 0 }, penalty: true, why: "", risks: [] },
    { angle: "common_enemy" as const, scores: { c1: 3, c2: 5, c3: 3 }, penalty: false, why: "", risks: [] },
    { angle: "unique_mechanism" as const, scores: { c1: 5, c2: 4, c3: 4 }, penalty: false, why: "", risks: [] },
    { angle: "age_identity" as const, scores: { c1: 2, c2: 2, c3: 3 }, penalty: false, why: "", risks: [] },
    { angle: "personal_story" as const, scores: { c1: 0, c2: 4, c3: 3 }, penalty: true, why: "", risks: [] },
    { angle: "offer" as const, scores: { c1: 4, c2: 3, c3: 4 }, penalty: false, why: "", risks: [] },
  ];

  it("acepta una lista completa y rechaza puntajes fuera de 0 a 5", () => {
    expect(routerProblems({ angles: complete(), test_angles: candidates() })).toEqual([]);
    const range = complete().map((x) => (x.angle === "authority" ? { ...x, scores: { c1: 4, c2: 7, c3: 0 } } : x));
    expect(routerProblems({ angles: range, test_angles: candidates() })).toEqual(["authority tiene puntajes fuera de 0 a 5."]);
  });

  it("rechaza ángulos que faltan o se repiten", () => {
    const missing = complete().filter((x) => x.angle !== "age_identity");
    expect(routerProblems({ angles: missing, test_angles: candidates() })).toEqual(["Falta el ángulo age_identity."]);
    const dup = [...complete(), complete()[0]];
    expect(routerProblems({ angles: dup, test_angles: candidates() })).toEqual(["El ángulo authority viene 2 veces."]);
  });

  it("pide los ángulos candidatos completos", () => {
    expect(routerProblems({ angles: complete(), test_angles: candidates().slice(0, 2) })[0]).toMatch(/Faltan ángulos candidatos/);
    expect(routerProblems({ angles: complete(), test_angles: candidates().map((c, i) => (i ? c : { ...c, promise: " " })) })).toEqual(["Hay candidatos sin título, dolor o promesa."]);
  });

  it("el reintento le dice al modelo qué falló", () => {
    const u = angleRouterUser(ctx, ["offer trae 2 puntajes y debe traer 3, uno por criterio en orden."]);
    expect(u).toContain("Tu respuesta anterior no se pudo puntuar: offer trae 2 puntajes");
    expect(angleRouterUser(ctx)).not.toContain("respuesta anterior");
  });

  it("el reintento cambia solo el cierre: el contexto (con punto de caché) queda igual", () => {
    const problems = ["offer trae 2 puntajes y debe traer 3, uno por criterio en orden."];
    expect(angleRouterContext(ctx)).not.toContain("respuesta anterior");
    expect(angleRouterTail(problems)).toContain("Tu respuesta anterior no se pudo puntuar: offer trae 2 puntajes");
    expect(angleRouterUser(ctx, problems)).toBe(`${angleRouterContext(ctx)}\n\n${angleRouterTail(problems)}`);
  });
});
