import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod/v4";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import { PROVEN_GRAMMAR_SIZE } from "@/lib/ai/limits";
import { usableHooks } from "@/lib/hooks/select";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { STRATEGY_EXTRACT_SYSTEM, strategyExtractContext, strategyExtractTail } from "./prompts";
import {
  chosenIndexes,
  strategyAnglesSchema,
  strategyExtractProblems,
  strategyProfileSchema,
  toAngleHook,
  toBriefPayload,
  toProductBrief,
  toTestAngle,
  type ExtractedAngle,
  type ExtractedHook,
  type StrategyProfile,
} from "./schemas";

const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;

const hook = (over: Partial<ExtractedHook> = {}): ExtractedHook => ({
  text: "A las 4 de la tarde ya no sé cómo sentarme.",
  on_screen: "LAS 4 DE LA TARDE",
  visual_first_3s: "Oficinista que se acomoda en la silla y se toca la espalda.",
  opening_shot: "selfie_talk",
  first_motion: "Se endereza y suspira.",
  delivery: "confiding",
  trigger: "Dolor",
  potential: 9,
  ...over,
});

const angle = (over: Partial<ExtractedAngle> = {}): ExtractedAngle => ({
  title: "Las 4 de la tarde",
  hook: "A las 4 de la tarde ya no sé cómo sentarme.",
  frame: "personal_story",
  pain_or_desire: "Llegar al final del día con la espalda molida.",
  segment: "Oficinistas con jornadas largas",
  promise: "Terminar el día sin la espalda molida.",
  trigger_moment: "La tarde frente al computador.",
  speaks_to: "buyer",
  tone: "cercano",
  why: "Prueba el dolor cotidiano con un momento exacto.",
  insight: "El dolor tiene hora.",
  mechanism: "Tira los hombros hacia atrás.",
  objection: "¿Se nota debajo de la ropa?",
  benefit: "Espalda derecha sin pensarlo.",
  cta: "Pídelo y paga al recibir.",
  aida: { attention: "El hook a cámara.", interest: "La tarde que se repite.", desire: "Cómo se siente usarlo.", action: "Pack de 3 y paga al recibir." },
  objection_handling: [{ objection: "¿Se nota?", answer: "Va debajo de la ropa." }],
  offer: "3 por $49.990 · paga al recibir",
  ugc_concepts: ["Problema cotidiano: la silla a las 4 → se lo pone → CTA (oficinista, 30 s)"],
  static_ads: ["Las 4 de la tarde | oficinista encorvado | Paga al recibir"],
  page_block: "Un momento de la tarde y la respuesta a «¿se nota?».",
  compliance_flags: [],
  hooks: [hook(), hook({ text: "No es la silla. Es lo que haces con los hombros." }), hook({ text: "Mi pareja me lo robó a la semana." })],
  ...over,
});

const angles = (n = 5) => Array.from({ length: n }, (_, i) => angle({ title: `Ángulo ${i + 1}` }));

/** Mide el esquema como lo compila la API (lib/video/prompts.test.ts). */
const size = (schema: unknown) => {
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
};

describe("extracción de la estrategia", () => {
  it("cada parte cabe en una gramática que ya funcionó en producción", () => {
    expect(size(toJSONSchema(strategyProfileSchema))).toBeLessThanOrEqual(PROVEN_GRAMMAR_SIZE);
    expect(size(toJSONSchema(strategyAnglesSchema))).toBeLessThanOrEqual(PROVEN_GRAMMAR_SIZE);
  });

  it("pide exactamente los 5 del TOP 5, sin repetir, con 3 a 6 hooks cada uno", () => {
    expect(strategyExtractProblems({ angles: angles() })).toEqual([]);
    expect(strategyExtractProblems({ angles: angles(4) })[0]).toMatch(/trae 4 ángulos/);
    expect(strategyExtractProblems({ angles: [...angles(4), angle({ title: "Ángulo 1" })] }).join(" ")).toMatch(/repetidos/);
    expect(strategyExtractProblems({ angles: [angle({ hooks: [hook()] }), ...angles(4)] })[0]).toMatch(/trae 1 hooks/);
  });

  it("el contexto lleva los datos del producto, el precio y el informe tal cual", () => {
    const c = strategyExtractContext({ name: "Corrector", description: "- Neopreno", pricing, report: "## 🎯 40 hooks\n| Hook |" });
    expect(c).toMatch(/^DATOS DEL PRODUCTO\nProducto: Corrector\n- Neopreno/);
    expect(c).toContain("PRECIO Y OFERTA");
    expect(c).toContain("<informe>\n## 🎯 40 hooks\n| Hook |\n</informe>");
    expect(strategyExtractTail("angles", ["Faltan hooks."])).toMatch(/^Tu respuesta anterior tenía estos problemas: Faltan hooks\./);
    expect(STRATEGY_EXTRACT_SYSTEM).toContain("no mejoras, no reescribes");
    expect(STRATEGY_EXTRACT_SYSTEM).toContain("ETIQUETAS DE LOS PACKS");
  });
});

describe("elegir y confirmar", () => {
  it("se eligen 2 o 3 índices distintos del TOP 5", () => {
    expect(chosenIndexes([0, 2])).toEqual([0, 2]);
    expect(chosenIndexes([4, 1, 0])).toEqual([4, 1, 0]);
    expect(chosenIndexes([1, 1])).toBeNull();
    expect(chosenIndexes([0])).toBeNull();
    expect(chosenIndexes([0, 1, 2, 3])).toBeNull();
    expect(chosenIndexes([0, 5])).toBeNull();
    expect(chosenIndexes("0,1")).toBeNull();
  });

  it("el ángulo elegido se guarda como los de siempre, en su slot", () => {
    const t = toTestAngle(angle(), 2);
    expect(t).toMatchObject({ slot: 2, frame: "personal_story", title: "Las 4 de la tarde", hook: "A las 4 de la tarde ya no sé cómo sentarme.", speaks_to: "buyer", competition: "" });
  });

  it("el desarrollo trae sus hooks en orden y los pasos siguientes los pueden usar", () => {
    const p = toBriefPayload(angle(), pricing, ["¿Cuánto pesa?"]);
    expect(p.hooks.map((h) => h.rank)).toEqual([1, 2, 3]);
    expect(p.recommended_hook).toBe(0);
    expect(p.offer_layer).toBe("3 por $49.990 · paga al recibir");
    expect(p.body_beats[0]).toMatch(/^Atención: /);
    expect(p.missing_inputs).toEqual(["¿Cuánto pesa?"]);
    expect(usableHooks(p, "ai_video")).toHaveLength(3);
  });

  it("un hook que roza la política o pide grabación real queda fuera de los videos con IA", () => {
    const risky = toAngleHook(hook({ text: "Si tu espalda duele a las 4, mira esto." }), 1, pricing);
    expect(risky).toMatchObject({ policy_ok: false, risk: "high" });
    const real = toAngleHook(hook({ opening_shot: "real_footage" }), 2, pricing);
    expect(real.needs_real_material).toBeTruthy();
    expect(usableHooks({ hooks: [risky, real], recommended_hook: 0 }, "ai_video")).toHaveLength(0);
  });

  it("la ficha toma el precio y las reseñas del código, no del modelo", () => {
    const profile: StrategyProfile["brief"] = {
      product_name: "Corrector",
      category: "postura",
      what_it_does: "Lleva los hombros atrás.",
      problem_solved: "Espalda encorvada.",
      how_it_works: null,
      key_facts: [{ label: "Material", value: "Neopreno" }],
      target_audience: { age_range: "30-45", gender: "any", life_stage_or_role: "oficinista", where_they_feel_it: null },
      alternatives_already_tried: ["Fajas"],
      differentiator: { versus: "las fajas", claim: "Se usa debajo de la ropa todo el día.", basis: "modo de uso" },
      known_objections: ["¿Se nota?"],
      forbidden_claims: ["cura"],
      missing_inputs: ["¿Cuánto pesa?"],
    };
    const b = toProductBrief(profile, pricing, ["Me sirvió"]);
    expect(b.price).toBe(24990);
    expect(b.unit_cost).toBe(3000);
    expect(b.bundle_options[0]).toMatch(/^2 unidades: \$/);
    expect(b.proof.real_reviews).toEqual(["Me sirvió"]);
    expect(b.missing_inputs).toEqual([{ field: "estrategia", question: "¿Cuánto pesa?" }]);
    expect(b.differentiator?.versus).toBe("las fajas");
    expect(AVATAR.summary).toBeTruthy();
  });
});
