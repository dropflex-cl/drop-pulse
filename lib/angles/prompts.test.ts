import { describe, expect, it } from "vitest";
import { PROVEN_GRAMMAR_SIZE } from "@/lib/ai/limits";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import { marketAnchorLine } from "@/lib/ai/context";
import type { ProductBrief } from "@/lib/ai/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { ANGLE_HOOK_MAX_WORDS, SALES_ANGLES } from "./catalog";
import { ANGLE_FRAMES_SYSTEM, angleFramesUser, angleIdeasContext, angleIdeasSystem, angleIdeasTail, angleIdeasUser, angleSystem, angleUser } from "./prompts";
import { angleBriefSchema, angleFramesSchema, angleIdeasSchema, isStrategy, marketAmounts, strategyProblems, suggestedFrom, type AngleIdea } from "./schemas";

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

describe("orquestador de ángulos (v9)", () => {
  it("es la pregunta del chat: corta, sin formas ni puntajes", () => {
    const sys = angleIdeasSystem(CL);
    expect(sys).toContain("experto en ventas en formato AIDA");
    expect(sys).toContain("quién compra y quién usa");
    expect(sys).toContain("doubts");
    expect(sys).toContain("ancla de precio");
    expect(sys).toContain("Hablarle de un ser querido");
    expect(sys).toContain("español neutro con tuteo");
    for (const a of SALES_ANGLES) expect(sys).not.toContain(a);
    expect(sys).not.toMatch(/escena|puntaje|penalizaci/i);
    expect(sys.split("\n").length).toBeLessThan(25);
    expect(angleIdeasTail()).toBe("Dime los 5 ángulos de venta más efectivos para este producto.");
  });

  it("el system solo depende del mercado (caché) y pide el gancho un 10 % más corto que el tope", () => {
    expect(angleIdeasSystem(CL)).toBe(angleIdeasSystem(CL));
    expect(angleIdeasSystem(CL)).not.toContain("Corrector");
    expect(angleIdeasSystem(CL)).toContain(`máximo ${Math.floor(ANGLE_HOOK_MAX_WORDS * 0.9)} palabras`);
  });

  it("el contexto es mínimo: el proveedor tal cual, lo comprobado, quién compra, precio, fechas y lo ya propuesto", () => {
    const u = angleIdeasContext({
      ...ctx,
      baseInfo: "Audífono digital inteligente, origen Japón, 0.076 kg",
      differentiator: { versus: "una faja", claim: "sostiene los hombros", basis: "" },
      reviews: ["Me sirvió para la oficina", "Llegó rápido"],
      events: [{ name: "Navidad", starts_on: "2026-12-25" }],
      today: "2026-10-03",
      previous: [{ title: "Callado en la mesa", hook: "Mi papá se ríe medio segundo tarde." }],
    });
    expect(u).toContain("HOY: 2026-10-03");
    expect(u).toContain("Audífono digital inteligente, origen Japón, 0.076 kg");
    expect(u).toContain("- Material: Neopreno");
    expect(u).toContain(`QUIÉN COMPRA, SEGÚN EL COMERCIANTE: ${AVATAR.summary}`);
    expect(u).toContain("frente a una faja, sostiene los hombros");
    expect(u).toContain("2 reseñas de compradores del mismo producto");
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("- Navidad: 25 de diciembre (en 12 semanas)");
    expect(u).toContain("YA LE PROPUSISTE AL COMERCIANTE");
    expect(u).toContain("- Callado en la mesa: «Mi papá se ríe medio segundo tarde.»");
    // Sin el porqué ni las dudas de quien compra (son de los agentes de cada ángulo), ni las reseñas textuales.
    expect(u).not.toContain(AVATAR.why_buy);
    for (const d of AVATAR.doubts) expect(u).not.toContain(d);
    expect(u).not.toContain("Me sirvió para la oficina");
    expect(u).not.toContain("COMPETENCIA");
  });

  it("sin fechas ni evaluación anterior no los nombra, y recorta el texto largo del proveedor", () => {
    const u = angleIdeasContext({ ...ctx, baseInfo: "x".repeat(4000) });
    expect(u).toContain("(ninguna en los próximos meses)");
    expect(u).not.toContain("YA LE PROPUSISTE");
    expect(u).toContain(`${"x".repeat(2500)}…`);
    expect(u).not.toContain("x".repeat(2501));
  });

  it("el reintento cambia solo el cierre: el contexto (con punto de caché) queda igual", () => {
    const problems = ["Ángulo 2: el gancho tiene 30 palabras."];
    expect(angleIdeasTail(problems)).toContain("Tu respuesta anterior tenía estos problemas: Ángulo 2: el gancho tiene 30 palabras.");
    expect(angleIdeasUser(ctx, problems)).toBe(`${angleIdeasContext(ctx)}\n\n${angleIdeasTail(problems)}`);
  });

  it("la clasificación solo ofrece las formas que se pueden usar", () => {
    const u = angleFramesUser([angle(0)], ["common_enemy", "offer"], ctx);
    expect(u).toContain("- common_enemy: ");
    expect(u).toContain("- offer: ");
    expect(u).not.toContain("authority");
    expect(u).toContain(angle(0).hook);
    expect(ANGLE_FRAMES_SYSTEM).toContain("sin cambiarlos");
  });
});

const angle = (i: number, patch: Partial<AngleIdea> = {}): AngleIdea => ({
  title: `Ángulo ${i}`,
  hook: "Cambié la silla dos veces y a las 4 me seguían pesando los hombros.",
  speaks_to: "user",
  tone: "Confesión",
  aida: { attention: "La escena de las 4.", interest: "No es la silla.", desire: "Hombros atrás.", action: "Paga al recibir." },
  why: "Es el dolor más común.",
  ...patch,
});
const five = () => [0, 1, 2, 3, 4].map((i) => angle(i));

describe("validación del orquestador", () => {
  it("acepta una propuesta completa", () => {
    expect(strategyProblems({ angles: five() })).toEqual([]);
  });

  // Los ganchos del chat que motivaron la v9: le hablan a quien mira de un ser querido, o anclan contra el mercado.
  it("acepta los ganchos del chat", () => {
    for (const hook of [
      "Si la tele de tu papá se escucha desde la calle, esto es para ustedes.",
      "Tu mamá ya no te pregunta «¿qué?»… porque dejó de preguntar.",
      "Un audífono en un centro auditivo cuesta entre $400.000 y $1.500.000. Este no.",
      "No es que la gente hable bajito.",
    ])
      expect(strategyProblems({ angles: [angle(0, { hook }), ...five().slice(1)] }), hook).toEqual([]);
  });

  it("pide los ángulos completos y sin repetir", () => {
    expect(strategyProblems({ angles: five().slice(0, 3) })[0]).toMatch(/Vienen 3 ángulos/);
    expect(strategyProblems({ angles: [...five().slice(0, 4), angle(0)] })).toEqual(["Ángulo 5 («Ángulo 0»): repite el título de otro ángulo."]);
    expect(strategyProblems({ angles: [angle(0, { hook: " " }), ...five().slice(1)] })[0]).toMatch(/le falta el título o el gancho/);
  });

  it("el gancho y el título tienen tope de palabras", () => {
    const long = Array.from({ length: ANGLE_HOOK_MAX_WORDS + 1 }, () => "palabra").join(" ");
    expect(strategyProblems({ angles: [angle(0, { hook: long }), ...five().slice(1)] })[0]).toMatch(`el gancho tiene ${ANGLE_HOOK_MAX_WORDS + 1} palabras`);
    expect(strategyProblems({ angles: [angle(0, { title: "Un título que es en realidad una frase entera" }), ...five().slice(1)] })[0]).toMatch(/el título tiene 9 palabras/);
  });

  it("el gancho y el AIDA pasan las reglas de Meta y de salud", () => {
    expect(strategyProblems({ angles: [angle(0, { hook: "Si tu espalda duele a las 4, mira esto." }), ...five().slice(1)] })[0]).toMatch(/le atribuye a quien mira/);
    expect(strategyProblems({ angles: [angle(0, { aida: { ...angle(0).aida, desire: "Cura la sordera." } }), ...five().slice(1)] })[0]).toMatch(/promete un resultado de salud/);
  });

  it("los montos que no son de la tienda pasan, marcados como ancla de mercado", () => {
    const anchor = angle(0, { hook: "Un audífono en un centro auditivo cuesta entre $400.000 y $1.500.000. Este no." });
    expect(marketAmounts(anchor, pricing)).toEqual([400000, 1500000]);
    const store = angle(0, { aida: { ...angle(0).aida, action: `Pide 1 a $${pricing.salePrice.toLocaleString("es-CL")} y paga al recibir.` } });
    expect(marketAmounts(store, pricing)).toEqual([]);
    expect(marketAmounts(angle(0, { hook: "Gasté 300 mil pesos en la consulta." }), pricing)).toEqual([300000]);
  });

  it("los sugeridos son los que eligió el modelo o, si no sirven, los primeros", () => {
    expect(suggestedFrom([3, 0], 5)).toEqual([3, 0]);
    expect(suggestedFrom([4, 4, 1, 2, 3], 5)).toEqual([4, 1, 2]);
    expect(suggestedFrom([7, -1, 2], 5)).toEqual([0, 1, 2]);
    expect(suggestedFrom([], 2)).toEqual([0, 1]);
  });

  it("distingue la propuesta nueva de las evaluaciones de antes", () => {
    expect(isStrategy({ buyer_and_user: "", angles: [], test_first: [0, 1], test_first_reason: "", doubts: [], watch_out: [] })).toBe(true);
    expect(isStrategy({ test_angles: [] })).toBe(false);
    // Las de antes también traen `angles` (las 6 formas puntuadas): producción, 2026-10-03.
    const v6 = { angles: [{ angle: "offer", scores: { c1: 4, c2: 3, c3: 4 }, penalty: false, why: "", risks: [] }], test_angles: [], aida_emphasis: "", compliance_flags: [] };
    expect(isStrategy(v6 as never)).toBe(false);
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

  it("el contexto del desarrollo es texto corto: sin la ficha ni el cliente ideal en JSON (v7)", () => {
    const u = angleUser("personal_story", { ...ctx, reviews: ["Me cambió la tarde", "Llegó rápido", "Lo uso todos los días", "Una cuarta"] }, { angle: { ...base, frame: "personal_story" }, others: [], why: "", risks: [], complianceFlags: [] });
    expect(u).not.toMatch(/"(what_it_does|voice_of_customer|trigger_moments|summary|proof)"\s*:/);
    expect(u).not.toMatch(/^\s*[{[]/m);
    expect(u).toContain("PRODUCTO: Corrector");
    expect(u).toContain("Lo que el comprador usa hoy y le falla: Fajas");
    expect(u).toContain("Promesas que no se pueden hacer: No decir que corrige la escoliosis");
    expect(u).toContain("PRUEBAS REALES: sin experto; 4 reseñas");
    expect(u).toContain("- «Lo uso todos los días»");
    expect(u).not.toContain("Una cuarta");
    expect(u).toContain("GARANTÍA: ninguna");
    expect(u).toContain(`- Por qué compra: ${AVATAR.why_buy}`);
    expect(u).toContain(`- Duda: ${AVATAR.doubts[0]}`);
    expect(u).toContain(`- El pago contra entrega: ${AVATAR.cash_on_delivery}`);
    expect(angleSystem("personal_story", CL)).not.toMatch(/\bgo = false|fit_reason|proof\.real_reviews|real_deadline_or_event|cash_on_delivery_concerns/);
  });

  it("el ancla de mercado que verificó el comerciante llega al desarrollo", () => {
    expect(handoff({ ...base, market_amounts: [400000] } as never)).toContain(marketAnchorLine([400000], "CLP"));
    expect(marketAnchorLine([400000, 1500000], "CLP")).toContain("$400.000, $1.500.000");
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
    expect(toJSONSchema(angleIdeasSchema)).toHaveProperty("properties.angles.items.properties.hook");
    expect(toJSONSchema(angleFramesSchema(["offer", "common_enemy"]))).toHaveProperty("properties.angles.items.properties.frame.enum", ["offer", "common_enemy"]);
    for (const a of SALES_ANGLES) expect(toJSONSchema(angleBriefSchema(a))).toHaveProperty("properties.details");
  });

  it("no son más grandes que uno que ya funcionó en producción", async () => {
    const { toJSONSchema } = await import("zod/v4");
    const limit = PROVEN_GRAMMAR_SIZE;
    expect(size(toJSONSchema(angleIdeasSchema))).toBeLessThanOrEqual(limit);
    for (const a of SALES_ANGLES) expect(size(toJSONSchema(angleBriefSchema(a))), a).toBeLessThanOrEqual(limit);
  });
});
