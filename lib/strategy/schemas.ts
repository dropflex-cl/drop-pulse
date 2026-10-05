// La estrategia (docs/spec-estrategia.md): el mega prompt escribe un informe en texto y una segunda
// llamada (paso strategy_extract) lo pasa a datos con este esquema. De aquí salen, al confirmar, las
// mismas filas que leen los pasos siguientes (ficha, cliente ideal, ángulos con sus ganchos): Imágenes,
// Página, Creativos y Video no cambian. Puro, con tests.

import * as z from "zod/v4";
import { customerAvatarSchema, packLabelsSchema, type ProductBrief } from "@/lib/ai/schemas";
import { ANGLES, SALES_ANGLES, SPEAKS_TO, type AngleSlot, type TestAngle } from "@/lib/angles/catalog";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { HOOK_DELIVERIES, OPENING_SHOT_DEFS, OPENING_SHOTS } from "@/lib/hooks/catalog";
import { hookTextOk, type AngleHook } from "@/lib/hooks/schemas";
import { money } from "@/lib/format";
import type { PricingPlan } from "@/lib/pricing/plan";

import { MAX_CHOSEN, MAX_HOOKS_PER_ANGLE, MIN_CHOSEN, MIN_HOOKS_PER_ANGLE, STRATEGY_ANGLES } from "./catalog";

export { MAX_CHOSEN, MAX_HOOKS_PER_ANGLE, MIN_CHOSEN, MIN_HOOKS_PER_ANGLE, STRATEGY_ANGLES };

const text = z.string();
const maybe = z.string().nullable();

const extractedHookSchema = z.object({
  text: text.describe("El hook tal cual está en el informe (lo que se dice)."),
  on_screen: text.describe("El texto en pantalla de 0 a 3 s, hasta 6 palabras, sacado del hook."),
  visual_first_3s: text.describe("La primera imagen del video: la escena de apertura del concepto UGC que usa este hook o, si no hay, la que pide el hook."),
  opening_shot: z.enum(OPENING_SHOTS).describe(`Con qué abre: ${OPENING_SHOTS.map((s) => `${s} (${OPENING_SHOT_DEFS[s].name.toLowerCase()})`).join(", ")}.`),
  first_motion: text.describe("Qué ya se está moviendo en la primera imagen, en una frase."),
  delivery: z.enum(HOOK_DELIVERIES).describe("Cómo se dice."),
  trigger: text.describe("El gatillo psicológico que le da el informe."),
  potential: z.number().int().describe("El nivel de potencial (1 a 10) que le da el informe."),
});

const extractedAngleSchema = z.object({
  title: text.describe("El nombre del ángulo, tal cual."),
  hook: text.describe("El hook del ángulo, tal cual."),
  frame: z.enum(SALES_ANGLES).describe(`La forma que más se le parece: ${SALES_ANGLES.map((k) => `${k} (${ANGLES[k].gist})`).join(" ")}`),
  pain_or_desire: text.describe("El problema que ataca y el deseo que activa."),
  segment: text.describe("El perfil de cliente al que le habla, en una línea."),
  promise: text.describe("La promesa central."),
  trigger_moment: text.describe("La situación que dispara la compra en este ángulo."),
  speaks_to: z.enum(SPEAKS_TO).describe("buyer si le habla a quien paga, user si a quien lo usa."),
  tone: text.describe("El tono en pocas palabras."),
  why: text.describe("Por qué → qué hipótesis prueba → qué resultado se espera (FASE 10)."),
  insight: text.describe("El insight psicológico."),
  mechanism: text.describe("El mecanismo de solución."),
  objection: text.describe("La objeción que elimina."),
  benefit: text.describe("El beneficio principal."),
  cta: text.describe("El CTA."),
  aida: z
    .object({ attention: text, interest: text, desire: text, action: text })
    .describe("La estructura AIDA de la FASE 7 si este ángulo la tiene; si no, armada con lo que el informe dice de este ángulo."),
  objection_handling: z.array(z.object({ objection: text, answer: text })).describe("3 a 5 objeciones de la FASE 8 que más tocan a este ángulo, con su respuesta."),
  offer: text.describe("La oferta que va con este ángulo (FASE 9), con los montos exactos de PRECIO Y OFERTA y el pago al recibir."),
  ugc_concepts: z.array(text).describe("Los conceptos UGC de la FASE 6 de este ángulo, uno por línea: «formato: escena de apertura → demostración → CTA (quién lo protagoniza, duración)»."),
  static_ads: z.array(text).describe("2 ideas de anuncio de imagen para este ángulo: «titular | imagen | texto»."),
  page_block: text.describe("Qué tiene que encontrar en la página quien llega desde este anuncio, en una o dos frases."),
  compliance_flags: z.array(text).describe("Restricciones publicitarias o claims sensibles que el informe señala para este ángulo."),
  hooks: z.array(extractedHookSchema).describe(`${MIN_HOOKS_PER_ANGLE} a ${MAX_HOOKS_PER_ANGLE} hooks del informe que sirven para este ángulo, el del ángulo primero, del más fuerte al más débil.`),
});

const extractedBriefSchema = z.object({
  product_name: text,
  category: text.describe("Categoría comercial («hogar», «belleza», «mascotas»…)."),
  what_it_does: text.describe("Qué hace, en una frase."),
  problem_solved: text.describe("El problema que resuelve."),
  how_it_works: maybe.describe("Cómo funciona, si el informe o los datos lo dicen; si no, null."),
  key_facts: z.array(z.object({ label: text, value: text })).describe("Los datos duros de DATOS DEL PRODUCTO (medidas, materiales, qué incluye, modo de uso). Nada inventado."),
  target_audience: z.object({
    age_range: maybe,
    gender: z.enum(["female", "male", "any"]).nullable(),
    life_stage_or_role: maybe,
    where_they_feel_it: maybe,
  }),
  alternatives_already_tried: z.array(text).describe("Lo que el comprador usa hoy o ya probó (categorías o prácticas, nunca marcas)."),
  differentiator: z
    .object({ versus: text.describe("Contra qué (lo que usa hoy)."), claim: text.describe("La diferencia en una frase."), basis: text.describe("De qué dato sale.") })
    .nullable()
    .describe("Qué lo diferencia de las alternativas tradicionales (FASE 1), o null si el informe no lo sostiene."),
  known_objections: z.array(text).describe("Las objeciones de la FASE 8, en una línea cada una."),
  forbidden_claims: z.array(text).describe("Promesas que no se pueden hacer: restricciones publicitarias y claims sensibles que señala el informe."),
  missing_inputs: z.array(text).describe("Los datos críticos que el informe dice que faltan."),
});

// La extracción va en dos llamadas en paralelo, cada una con su esquema: juntas pasaban el tamaño de
// gramática probado en producción (PROVEN_GRAMMAR_SIZE) y la API las rechaza («grammar is too large»).

/** El producto, el cliente y las ofertas. */
export const strategyProfileSchema = z.object({
  brief: extractedBriefSchema,
  avatar: customerAvatarSchema.describe("El cliente número 1 del TOP 3 CLIENTES (FASE 10)."),
  pack_labels: packLabelsSchema,
  first_dollar: z.array(text).describe("Los 3 conceptos de «Si tuviera que gastar mi primer dólar…», en orden."),
});

/** Los TOP 5 ángulos con sus hooks. */
export const strategyAnglesSchema = z.object({
  angles: z.array(extractedAngleSchema).describe(`Los ${STRATEGY_ANGLES} ángulos del TOP 5 ÁNGULOS (FASE 10), en su orden.`),
});

export type StrategyProfile = z.infer<typeof strategyProfileSchema>;
export type StrategyAngles = z.infer<typeof strategyAnglesSchema>;
/** Lo que se guarda en strategy_runs.extraction: las dos partes juntas. */
export type StrategyExtraction = StrategyProfile & StrategyAngles;
export type ExtractedAngle = StrategyExtraction["angles"][number];
export type ExtractedHook = ExtractedAngle["hooks"][number];

/** Lo que el código revisa de los ángulos extraídos: si falla, se pide otra vez con estos problemas. */
export function strategyExtractProblems(x: StrategyAngles): string[] {
  const problems: string[] = [];
  if (x.angles.length !== STRATEGY_ANGLES) problems.push(`angles trae ${x.angles.length} ángulos; tienen que ser los ${STRATEGY_ANGLES} del TOP 5 ÁNGULOS.`);
  x.angles.forEach((a, i) => {
    const n = a.hooks.length;
    if (n < MIN_HOOKS_PER_ANGLE || n > MAX_HOOKS_PER_ANGLE) problems.push(`angles[${i}] («${a.title}») trae ${n} hooks; tienen que ser de ${MIN_HOOKS_PER_ANGLE} a ${MAX_HOOKS_PER_ANGLE}.`);
    if (!a.title.trim() || !a.hook.trim()) problems.push(`angles[${i}] no trae nombre o hook.`);
  });
  const titles = x.angles.map((a) => a.title.trim().toLowerCase());
  if (new Set(titles).size !== titles.length) problems.push("Hay ángulos repetidos: cada uno del TOP 5 va una sola vez.");
  return problems;
}

/** Normaliza los slots elegidos: 2 o 3 índices distintos del TOP 5 (0..4). Null si no sirven. */
export function chosenIndexes(raw: unknown, available = STRATEGY_ANGLES): number[] | null {
  if (!Array.isArray(raw)) return null;
  const idx = [...new Set(raw.map(Number))];
  if (idx.length < MIN_CHOSEN || idx.length > MAX_CHOSEN) return null;
  if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= available)) return null;
  return idx;
}

// ---------------------------------------------------------------- Al confirmar: las filas de siempre

/** El ángulo elegido como lo guarda angle_rankings.chosen_angles. */
export function toTestAngle(a: ExtractedAngle, slot: AngleSlot): TestAngle {
  return {
    slot,
    frame: a.frame,
    title: a.title.trim(),
    pain_or_desire: a.pain_or_desire.trim(),
    segment: a.segment.trim(),
    promise: a.promise.trim(),
    trigger_moment: a.trigger_moment.trim(),
    competition: "",
    hook: a.hook.trim(),
    aida: a.aida,
    speaks_to: a.speaks_to,
    tone: a.tone.trim(),
    why: a.why.trim(),
  };
}

function policy(h: ExtractedHook, pricing: PricingPlan): Pick<AngleHook, "policy_ok" | "risk" | "risk_reason"> {
  const ok = hookTextOk(h.text, pricing) && hookTextOk(h.on_screen, pricing);
  return ok ? { policy_ok: true, risk: "low", risk_reason: `Gatillo: ${h.trigger.trim()}` } : { policy_ok: false, risk: "high", risk_reason: "Roza la política de Meta" };
}

/** Un hook del informe como gancho guardado (lo que leen Creativos y Video con usableHooks). */
export function toAngleHook(h: ExtractedHook, rank: number, pricing: PricingPlan): AngleHook {
  return {
    text: h.text.trim(),
    on_screen: h.on_screen.trim(),
    visual_first_3s: h.visual_first_3s.trim(),
    opening_shot: h.opening_shot,
    first_motion: h.first_motion.trim(),
    needs_real_material: h.opening_shot === "real_footage" ? "Grabación real del producto" : null,
    delivery: h.delivery,
    rank,
    // Lo comprobable lo decide el código, como en los ganchos de siempre: los que rozan la política
    // quedan fuera de usableHooks, sin reescribir el informe.
    ...policy(h, pricing),
  };
}

/** El desarrollo del ángulo como lo guarda angle_briefs.payload. */
export function toBriefPayload(a: ExtractedAngle, pricing: PricingPlan, missing: string[]): AngleBriefPayload {
  const hooks = a.hooks.map((h, i) => toAngleHook(h, i + 1, pricing));
  return {
    psychological_lever: a.insight.trim(),
    core_message: a.promise.trim(),
    aida_summary: a.aida,
    body_beats: [
      `Atención: ${a.aida.attention}`,
      `Interés: ${a.aida.interest}`,
      `Deseo: ${a.aida.desire} Mecanismo: ${a.mechanism}`,
      `Acción: ${a.aida.action}`,
    ],
    proof_to_show: [],
    objection_handling: a.objection_handling,
    offer_layer: a.offer.trim(),
    visual_concepts: a.ugc_concepts,
    static_ad_concepts: a.static_ads,
    page_block: a.page_block.trim(),
    compliance_flags: a.compliance_flags,
    missing_inputs: missing,
    handoff_to_ugc: [a.ugc_concepts[0], `Tono: ${a.tone}.`, `Beneficio principal: ${a.benefit}. CTA: ${a.cta}.`].filter(Boolean).join(" "),
    details: { source: "strategy", benefit: a.benefit, mechanism: a.mechanism, objection: a.objection, cta: a.cta },
    hooks,
    recommended_hook: 0,
  };
}

/** La ficha que leen los pasos siguientes: lo extraído más lo que pone el código (precio y reseñas reales). */
export function toProductBrief(b: StrategyExtraction["brief"], pricing: PricingPlan, reviews: string[]): ProductBrief {
  return {
    product_name: b.product_name.trim(),
    category: b.category.trim(),
    what_it_does: b.what_it_does.trim(),
    problem_solved: b.problem_solved.trim(),
    how_it_works: b.how_it_works?.trim() || null,
    key_facts: b.key_facts,
    target_audience: b.target_audience,
    alternatives_already_tried: b.alternatives_already_tried,
    differentiator: b.differentiator,
    price: pricing.salePrice,
    unit_cost: pricing.unitCost,
    bundle_options: pricing.packs.filter((k) => k.units > 1).map((k) => `${k.units} unidades: ${money(k.price, pricing.currency)}`),
    real_deadline_or_event: null,
    proof: { real_reviews: reviews, real_expert: null, studies_or_certifications: [], units_sold_or_social_proof: null, guarantee_days: null },
    images: [],
    known_objections: b.known_objections,
    forbidden_claims: b.forbidden_claims,
    inferred_fields: [],
    missing_inputs: b.missing_inputs.map((q) => ({ field: "estrategia", question: q })),
  };
}
