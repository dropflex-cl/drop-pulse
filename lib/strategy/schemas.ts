// Contrato histórico de extracción para leer estrategias guardadas. Sin writer ni proyección automática.

import { customerAvatarSchema, packLabelsSchema } from "@/lib/ai/schemas";
import { ANGLES, SALES_ANGLES, SPEAKS_TO } from "@/lib/angles/catalog";
import { HOOK_DELIVERIES, OPENING_SHOT_DEFS, OPENING_SHOTS } from "@/lib/hooks/catalog";
import * as z from "zod/v4";

import { MAX_CHOSEN, MAX_HOOKS_PER_ANGLE, MIN_CHOSEN, MIN_HOOKS_PER_ANGLE, STRATEGY_ANGLES } from "./catalog";

export { MAX_CHOSEN,MAX_HOOKS_PER_ANGLE,MIN_CHOSEN,MIN_HOOKS_PER_ANGLE,STRATEGY_ANGLES };

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
