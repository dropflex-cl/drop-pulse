import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import { avatarStepSchema } from "@/lib/ai/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { ANGLE_HOOK_MAX_WORDS, SALES_ANGLES } from "./catalog";
import { angleStrategyContext, angleStrategySystem, angleStrategyTail, angleStrategyUser, angleSystem, angleUser } from "./prompts";
import { angleBriefSchema, angleStrategySchema, isStrategy, strategyProblems, suggestedFrom, type StrategyAngle } from "./schemas";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const brief = {
  product_name: "Corrector",
  category: "dolor y postura",
  what_it_does: "Lleva los hombros atrás.",
  how_it_works: "Cintas cruzadas.",
  key_facts: [{ label: "Material", value: "Neopreno" }],
  problem_solved: "Espalda cargada",
  alternatives_already_tried: ["Fajas"],
  known_objections: ["¿Se nota?"],
  target_audience: { age_range: "30-45", gender: "any", life_stage_or_role: "Oficinistas", where_they_feel_it: "A las 4 de la tarde" },
  forbidden_claims: ["No decir que corrige la escoliosis"],
  proof: { real_expert: null, real_reviews: [], studies_or_certifications: [], units_sold_or_social_proof: null, guarantee_days: null },
} as unknown as ProductBrief;
const ctx = { brief, avatar: AVATAR, pricing, baseInfo: "neopreno" };

describe("orquestador de ángulos (v7)", () => {
  it("es un experto que piensa en quién compra y quién usa, sin puntuar formas", () => {
    const sys = angleStrategySystem(CL);
    expect(sys).toContain("quién compra y quién usa");
    expect(sys).toContain("Lo que ya vende en esta categoría vale más que ser original");
    expect(sys).toContain("FECHAS");
    expect(sys).toContain("doubts");
    expect(sys).toContain("español neutro con tuteo");
    for (const a of SALES_ANGLES) expect(sys).toContain(`· ${a}: `);
    expect(sys).not.toMatch(/peso \d|penalizaci|c1, c2 y c3|puntaje/i);
  });

  it("el system solo depende del mercado (caché)", () => {
    expect(angleStrategySystem(CL)).toBe(angleStrategySystem(CL));
    expect(angleStrategySystem(CL)).not.toContain("Corrector");
  });

  it("el gancho que pide es un 10 % más corto que el que valida el código", () => {
    expect(angleStrategySystem(CL)).toContain(`hook: máximo ${Math.floor(ANGLE_HOOK_MAX_WORDS * 0.9)} palabras`);
  });

  it("el contexto es texto corto: ficha, cliente ideal, pruebas, precio, competencia, fechas y lo del comerciante", () => {
    const u = angleStrategyContext({
      ...ctx,
      differentiator: { versus: "una faja", claim: "sostiene los hombros", basis: "" },
      reviews: ["Me sirvió para la oficina", "Llegó rápido"],
      events: [{ name: "Navidad", starts_on: "2026-12-25" }],
      today: "2026-10-03",
    });
    expect(u).toContain("HOY: 2026-10-03");
    expect(u).toContain("- Material: Neopreno");
    expect(u).toContain("CLIENTE IDEAL (quien compra según el comerciante)");
    expect(u).toContain(AVATAR.summary);
    expect(u).toContain("Frente a una faja: sostiene los hombros");
    expect(u).toContain("2 reseñas reales");
    expect(u).toContain("«Me sirvió para la oficina»");
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("- Navidad: 25 de diciembre (en 12 semanas)");
    expect(u).toContain("(sin datos)");
    // Sin la fórmula del cliente ideal ni la ficha en JSON.
    expect(u).not.toContain(AVATAR.formula);
    expect(u).not.toContain('"product_name"');
  });

  it("sin reseñas ni fechas lo dice, y recorta el texto largo del proveedor", () => {
    const u = angleStrategyContext({ ...ctx, baseInfo: "x".repeat(4000) });
    expect(u).toContain("- Reseñas reales: ninguna");
    expect(u).toContain("(ninguna en los próximos meses)");
    expect(u).toContain(`${"x".repeat(2500)}…`);
    expect(u).not.toContain("x".repeat(2501));
  });

  it("el reintento cambia solo el cierre: el contexto (con punto de caché) queda igual", () => {
    const problems = ["Ángulo 2: el gancho tiene 30 palabras."];
    expect(angleStrategyContext(ctx)).not.toContain("respuesta anterior");
    expect(angleStrategyTail(problems)).toContain("Tu respuesta anterior tenía estos problemas: Ángulo 2: el gancho tiene 30 palabras.");
    expect(angleStrategyTail()).not.toContain("respuesta anterior");
    expect(angleStrategyUser(ctx, problems)).toBe(`${angleStrategyContext(ctx)}\n\n${angleStrategyTail(problems)}`);
  });
});

describe("validación del orquestador", () => {
  const facts = { pricing, hasRealReviews: false, hasRealExpert: false };
  const angle = (i: number, patch: Partial<StrategyAngle> = {}): StrategyAngle => ({
    title: `Ángulo ${i}`,
    hook: "Cambié la silla dos veces y a las 4 me seguían pesando los hombros.",
    speaks_to: "user",
    tone: "Confesión",
    aida: { attention: "La escena de las 4.", interest: "No es la silla.", desire: "Hombros atrás.", action: "Paga al recibir." },
    why: "Es el dolor más común.",
    pain_or_desire: "Espalda cargada",
    segment: "Oficinistas",
    promise: "Hombros atrás",
    trigger_moment: "A las 4 de la tarde",
    frame: "unique_mechanism",
    ...patch,
  });
  const five = () => [0, 1, 2, 3, 4].map((i) => angle(i));

  it("acepta una propuesta completa", () => {
    expect(strategyProblems({ angles: five() }, facts)).toEqual([]);
  });

  // El gancho que motivó el orquestador v7 (un chat simple lo propuso; la versión de antes no podía).
  it("acepta un gancho con forma de frase que habla de un tercero", () => {
    const hook = "Si la tele de tu papá se escucha desde la calle, esto es para ustedes.";
    expect(strategyProblems({ angles: [angle(0, { hook, speaks_to: "buyer", tone: "Humor cotidiano" }), ...five().slice(1)] }, facts)).toEqual([]);
  });

  it("pide los ángulos completos y sin repetir", () => {
    expect(strategyProblems({ angles: five().slice(0, 3) }, facts)[0]).toMatch(/Vienen 3 ángulos/);
    expect(strategyProblems({ angles: [...five().slice(0, 4), angle(0)] }, facts)).toEqual(["Ángulo 5 («Ángulo 0»): repite el título de otro ángulo."]);
    expect(strategyProblems({ angles: [angle(0, { hook: " " }), ...five().slice(1)] }, facts)[0]).toMatch(/le falta el título, el gancho/);
  });

  it("el gancho tiene un tope de palabras", () => {
    const long = Array.from({ length: ANGLE_HOOK_MAX_WORDS + 1 }, () => "palabra").join(" ");
    expect(strategyProblems({ angles: [angle(0, { hook: long }), ...five().slice(1)] }, facts)[0]).toMatch(/el gancho tiene 25 palabras/);
  });

  it("Autoridad e Historia personal piden la prueba real", () => {
    const angles = [angle(0, { frame: "authority" }), angle(1, { frame: "personal_story" }), ...five().slice(2)];
    expect(strategyProblems({ angles }, facts)).toHaveLength(2);
    expect(strategyProblems({ angles }, { ...facts, hasRealExpert: true, hasRealReviews: true })).toEqual([]);
  });

  it("el gancho y el AIDA pasan las reglas de Meta y del precio", () => {
    const second = strategyProblems({ angles: [angle(0, { hook: "Si tu espalda duele a las 4, mira esto." }), ...five().slice(1)] }, facts);
    expect(second[0]).toMatch(/le atribuye a quien mira/);
    const amount = strategyProblems({ angles: [angle(0, { aida: { ...angle(0).aida, action: "Llévalo a $9.990 y paga al recibir." } }), ...five().slice(1)] }, facts);
    expect(amount[0]).toMatch(/monto que no está en PRECIO Y OFERTA/);
    const ok = strategyProblems({ angles: [angle(0, { aida: { ...angle(0).aida, action: `Pide 1 a $${pricing.packs[0].price.toLocaleString("es-CL")} y paga al recibir.` } }), ...five().slice(1)] }, facts);
    expect(ok).toEqual([]);
  });

  it("los sugeridos son los que eligió el modelo o, si no sirven, los primeros", () => {
    expect(suggestedFrom([3, 0], 5)).toEqual([3, 0]);
    expect(suggestedFrom([4, 4, 1, 2, 3], 5)).toEqual([4, 1, 2]);
    expect(suggestedFrom([7, -1, 2], 5)).toEqual([0, 1, 2]);
    expect(suggestedFrom([], 2)).toEqual([0, 1]);
  });

  it("distingue la propuesta nueva de las evaluaciones de antes", () => {
    expect(isStrategy({ buyer_and_user: "", angles: five(), test_first: [0, 1], test_first_reason: "", doubts: [], watch_out: [] })).toBe(true);
    expect(isStrategy({ test_angles: [] })).toBe(false);
    expect(isStrategy(null)).toBe(false);
  });
});

describe("agentes de ángulo", () => {
  it("escriben para LATAM con pago contra entrega, no para EE. UU.", () => {
    for (const a of SALES_ANGLES) {
      const sys = angleSystem(a, CL);
      expect(sys).toContain("Paga al recibir");
      expect(sys).toContain("idioma del mercado");
      expect(sys).not.toMatch(/inglés de EE\. UU\./);
      expect(sys).not.toContain("USD");
    }
    expect(angleSystem("offer", CL)).toBe(angleSystem("offer", CL));
  });

  const base = { slot: 2 as const, frame: "unique_mechanism" as const, title: "La crema sella", pain_or_desire: "Cara tirante", segment: "Usa crema", promise: "El paso previo", trigger_moment: "7 AM", competition: "" };
  const handoff = (angle: typeof base & { hook?: string; tone?: string; speaks_to?: "buyer" | "user" }) =>
    angleUser("unique_mechanism", { ...ctx, differentiator: { versus: "su crema", claim: "va antes", basis: "" } }, {
      angle,
      others: [{ ...base, slot: 1, frame: "age_identity", title: "Tengo 38" }],
      why: "Encaja.",
      risks: [],
      complianceFlags: [],
    });

  it("el desarrollo recibe su ángulo, que es uno de varios, y los otros para no repetirlos", () => {
    const u = handoff(base);
    expect(u).toContain("Este es el ángulo 2 de 2");
    expect(u).toContain("100 % este ángulo");
    expect(u).toContain("«La crema sella»");
    expect(u).toContain("«Tengo 38» (Edad e identidad)");
    expect(u).toContain("Frente a su crema: va antes");
    expect(u).not.toMatch(/principal|secundario|Énfasis AIDA/);
  });

  it("con el gancho del orquestador v7, mandan el gancho y el tono sobre la forma", () => {
    const u = handoff({ ...base, hook: "Me ponía crema y amanecía tirante igual.", tone: "Confesión", speaks_to: "user" });
    expect(u).toContain("«Me ponía crema y amanecía tirante igual.»");
    expect(u).toContain("Tono: Confesión.");
    expect(u).toContain("Le habla a: quien usa el producto.");
    expect(u).toContain("mandan el gancho y el tono");
    expect(handoff(base)).not.toContain("mandan el gancho");
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
    expect(toJSONSchema(angleStrategySchema)).toHaveProperty("properties.angles.items.properties.hook");
    for (const a of SALES_ANGLES) expect(toJSONSchema(angleBriefSchema(a))).toHaveProperty("properties.details");
  });

  // La API rechaza gramáticas muy grandes (400 «compiled grammar is too large»). El paso del cliente
  // ideal funciona en producción: ningún esquema de ángulos puede ser más grande que ese.
  it("no son más grandes que el del cliente ideal", async () => {
    const { toJSONSchema } = await import("zod/v4");
    const limit = size(toJSONSchema(avatarStepSchema));
    expect(size(toJSONSchema(angleStrategySchema))).toBeLessThanOrEqual(limit);
    for (const a of SALES_ANGLES) expect(size(toJSONSchema(angleBriefSchema(a))), a).toBeLessThanOrEqual(limit);
  });
});
