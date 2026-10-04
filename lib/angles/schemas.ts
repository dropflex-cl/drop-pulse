// Salida estructurada del orquestador de ángulos y de los agentes de ángulo (agentes-creativos/*.md,
// adaptados a LATAM con pago contra entrega). Una sola definición para el modelo (JSON schema), la
// validación y los tipos. Claves en inglés; textos para el comerciante en español con tuteo.

import * as z from "zod/v4";
import { allowedAmounts, amountAllowed, amountsIn } from "@/lib/copy/schemas";
import { hookTextProblems, spokenAmounts, type AngleHook, type HooksMeta } from "@/lib/hooks/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import { ANGLE_CANDIDATES, ANGLE_HOOK_MAX_WORDS, ANGLE_TITLE_MAX_WORDS, MIN_TEST_ANGLES, SPEAKS_TO, TEST_ANGLES, type SalesAngle } from "./catalog";

/** Con menos ángulos que estos, la respuesta se pide otra vez. */
const MIN_STRATEGY_ANGLES = 4;

/** Bump cuando cambie el prompt o el esquema del orquestador. 7: un experto que propone ángulos con su gancho y AIDA, sin puntuar formas. 8: el gancho dicho y con tensión (14 palabras), la escena en aida.attention, el título con tope. 9: la pregunta del chat con poco contexto; la forma la pone una segunda llamada; anclas de mercado marcadas; ve lo que ya propuso. */
export const ANGLE_ROUTER_PROMPT_VERSION = 9;
/** Bump cuando cambie el prompt o el esquema de los agentes de ángulo. 4: las dramatizaciones van sin rótulo. 5: los ganchos los escribe su propio agente (lib/hooks). 6: reciben el gancho, el AIDA y el tono del ángulo. */
export const ANGLE_BRIEF_PROMPT_VERSION = 6;

const text = z.string();
const maybe = z.string().nullable();

// ---------------------------------------------------------------- Orquestador (v9)
// Dos llamadas. La primera es la pregunta que el comerciante le haría a un experto en un chat («dime
// los ángulos de venta más efectivos»), con poco contexto y sin formas que llenar: cada ángulo es un
// motivo de compra con su gancho y su AIDA. La segunda, barata (effort low), solo clasifica cada ángulo
// en una forma (qué especialista lo desarrolla) y anota el dolor, el segmento, la promesa y el momento
// que leen los pasos siguientes. Lo que se guarda (`StrategyAngle`) es la unión de las dos.

const idea = z.object({
  title: text.describe("Nombre corto del ángulo, 2 a 5 palabras."),
  hook: text.describe("La primera frase del anuncio: la que detiene el scroll."),
  speaks_to: z.enum(SPEAKS_TO).describe("A quién le habla: buyer (quien paga) o user (quien lo usa)."),
  tone: text.describe("El tono en 1 a 3 palabras."),
  aida: z.object({ attention: text, interest: text, desire: text, action: text }),
  why: text.describe("Por qué va a vender, en 1 o 2 frases para el comerciante."),
});
export type AngleIdea = z.infer<typeof idea>;

export const angleIdeasSchema = z.object({
  buyer_and_user: text.describe("Quién compra y quién usa el producto, en una frase."),
  angles: z.array(idea).describe(`${ANGLE_CANDIDATES} ángulos, del más efectivo al menos.`),
  test_first: z.array(z.number().int()).describe("Las posiciones (desde 0) de los 2 o 3 que testearías primero."),
  test_first_reason: text,
  doubts: z.array(text).describe("Datos del producto que no son creíbles o no se deben usar, y por qué."),
  watch_out: z.array(text).describe("Hasta 4 cuidados antes de lanzar (Meta, la ley, el pedido en la puerta)."),
});
export type AngleIdeasOutput = z.infer<typeof angleIdeasSchema>;

/** La clasificación de un ángulo: con qué forma se desarrolla y lo que leen los pasos siguientes. */
const framing = (frames: readonly [SalesAngle, ...SalesAngle[]]) =>
  z.object({
    frame: z.enum(frames),
    pain_or_desire: text,
    segment: text,
    promise: text,
    trigger_moment: text,
  });
export type AngleFraming = z.infer<ReturnType<typeof framing>>;

/** Solo las formas que se pueden usar con lo que hay (Autoridad pide un experto real; Historia personal, reseñas). */
export const angleFramesSchema = (frames: readonly [SalesAngle, ...SalesAngle[]]) => z.object({ angles: z.array(framing(frames)) });

/** Un ángulo como se guarda: la idea del experto más su clasificación. */
export type StrategyAngle = AngleIdea & AngleFraming;
export type AngleStrategyOutput = Omit<AngleIdeasOutput, "angles"> & { angles: StrategyAngle[] };

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/**
 * Qué está mal en la respuesta del experto. Vacío si se puede guardar. Con problemas se pide otra una
 * vez, diciendo cuáles. Los montos no se revisan aquí: un precio de mercado (lo que cuesta la
 * alternativa) puede ser un buen ancla y pasa marcado para que el comerciante lo verifique
 * (marketAmounts); los de la tienda los cuidan los pasos siguientes.
 */
export function strategyProblems(out: Pick<AngleIdeasOutput, "angles">): string[] {
  const problems: string[] = [];
  if (out.angles.length < MIN_STRATEGY_ANGLES) problems.push(`Vienen ${out.angles.length} ángulos y se piden ${ANGLE_CANDIDATES}.`);
  const titles = new Set<string>();
  out.angles.forEach((a, i) => {
    const at = `Ángulo ${i + 1} («${a.title.trim() || "sin título"}»): `;
    if (!a.title.trim() || !a.hook.trim()) problems.push(`${at}le falta el título o el gancho.`);
    const key = a.title.trim().toLowerCase();
    if (key && titles.has(key)) problems.push(`${at}repite el título de otro ángulo.`);
    titles.add(key);
    if (words(a.hook) > ANGLE_HOOK_MAX_WORDS) problems.push(`${at}el gancho tiene ${words(a.hook)} palabras; el máximo es ${ANGLE_HOOK_MAX_WORDS}.`);
    if (words(a.title) > ANGLE_TITLE_MAX_WORDS) problems.push(`${at}el título tiene ${words(a.title)} palabras; es un nombre de 2 a 5.`);
    for (const t of [a.hook, a.aida.attention, a.aida.interest, a.aida.desire, a.aida.action]) problems.push(...hookTextProblems(t, null, at));
  });
  return problems;
}

/** Los montos de un ángulo que no son de PRECIO Y OFERTA: anclas de mercado que el comerciante tiene que verificar. */
export function marketAmounts(a: Pick<AngleIdea, "hook" | "aida">, pricing: PricingPlan): number[] {
  const allowed = allowedAmounts(pricing);
  const found = [a.hook, a.aida.attention, a.aida.interest, a.aida.desire, a.aida.action].flatMap((t) => [...amountsIn(t, pricing.currency), ...spokenAmounts(t)]);
  return [...new Set(found.filter((n) => !amountAllowed(n, allowed)))];
}

/**
 * Los sugeridos: las posiciones válidas que eligió el modelo (2 o 3, sin repetir). Si no sirven, los
 * primeros de la lista, que viene ordenada del que más vende al que menos.
 */
export function suggestedFrom(testFirst: number[], count: number): number[] {
  const picked = [...new Set(testFirst.filter((i) => Number.isInteger(i) && i >= 0 && i < count))].slice(0, TEST_ANGLES);
  if (picked.length >= MIN_TEST_ANGLES) return picked;
  return Array.from({ length: Math.min(TEST_ANGLES, count) }, (_, i) => i);
}

/**
 * Lo que guardaban las evaluaciones de antes del orquestador v7 (6 formas puntuadas y candidatos con
 * su competencia). Solo se lee: la pantalla las muestra hasta que se vuelva a evaluar.
 */
export interface LegacyCandidate {
  title: string;
  pain_or_desire: string;
  segment: string;
  promise: string;
  frame: SalesAngle;
  trigger_moment: string;
  competition: string;
}
export interface LegacyRouterPayload {
  test_angles?: LegacyCandidate[];
  missing_inputs?: (string | { text: string; gain?: string })[];
  aida_emphasis?: string;
  compliance_flags?: string[];
}
/** El puntaje de una forma en las evaluaciones de antes (angle_rankings.scores). */
export interface LegacyScoredAngle {
  angle: SalesAngle;
  why: string;
  risks: { text: string; fix?: "reviews" | "expert" }[];
}

export type RankingPayload = AngleStrategyOutput | LegacyRouterPayload;
/**
 * ¿Es una propuesta del orquestador v7 o posterior? Las evaluaciones de antes también traen `angles`
 * (las 6 formas puntuadas): lo que distingue a la nueva es `test_first`, que antes no existía.
 */
export const isStrategy = (p: RankingPayload | null | undefined): p is AngleStrategyOutput =>
  Boolean(p && Array.isArray((p as AngleStrategyOutput).test_first) && Array.isArray((p as AngleStrategyOutput).angles));

// ---------------------------------------------------------------- Agentes de ángulo

export const AIDA_STAGES = ["attention", "interest", "desire", "action"] as const;
export type AidaStage = (typeof AIDA_STAGES)[number];

// Compactos por la misma razón que el orquestador: lo que no se muestra ni se valida va como texto.
// Los ganchos no van aquí: los escribe el agente de ganchos (lib/hooks) justo después, con sus reglas
// en código, y se guardan en el mismo payload.
const briefBase = {
  go: z.boolean().describe("false si este ángulo no se puede sostener con lo que hay (explica por qué en fit_reason)."),
  fit_reason: text,
  psychological_lever: text.describe("Qué palanca concreta usas y por qué."),
  core_message: text.describe("El mensaje central en una frase."),
  aida_summary: z
    .object({ attention: text, interest: text, desire: text, action: text })
    .describe("Una frase por etapa: qué hace el anuncio en cada una (lo que ve el comerciante)."),
  body_beats: z.array(text).describe("Los beats del cuerpo en orden, cada uno empezando por su etapa: «Interés: …»."),
  aida_emphasis: text.describe("Qué etapa pesa más para este producto según su nivel de consciencia, y por qué."),
  proof_to_show: z.array(text).describe("Solo pruebas reales de la ficha."),
  objection_handling: z.array(z.object({ objection: text, answer: text })).describe("3 a 5, incluida al menos una del pago contra entrega o de comprar online."),
  offer_layer: text.describe("La oferta en una línea, con los números de PRECIO Y OFERTA y el cierre del mercado («Paga al recibir»)."),
  visual_concepts: z.array(text).describe("3 conceptos: «formato: qué se ve (referencia)»."),
  static_ad_concepts: z.array(text).describe("2 estáticos (3 en Oferta): «titular | imagen | texto»."),
  page_block: text.describe("Qué tiene que encontrar en la página quien llega desde este anuncio (un momento, un beneficio o una respuesta), en una o dos frases. La página es común a todos los ángulos: no propongas una página entera."),
  compliance_flags: z.array(text),
  missing_inputs: z.array(text),
  handoff_to_ugc: text.describe("Para el guionista: vocero, tono y lo que se debe evitar."),
};

// Lo propio de cada ángulo, en pocas claves de texto.
const DETAILS: Record<SalesAngle, z.ZodType> = {
  authority: z.object({
    expert: text.describe("El experto real de la ficha o el perfil a contratar (nunca una identidad inventada), su credencial y dónde se graba."),
    expert_is_real: z.boolean(),
    why_they_use_it: text,
  }),
  common_enemy: z.object({ enemy: text.describe("Práctica, categoría o creencia; nunca una marca."), why_it_fails: text, factual_basis: text }),
  unique_mechanism: z.object({ assumed_cause: text, real_cause: text, one_line: text, metaphor: text, factual_basis: text }),
  age_identity: z.object({ segment: text.describe("El grupo y cómo se nombra a sí mismo."), trigger_moment: text, other_segments: z.array(text) }),
  personal_story: z.object({
    story_is_real: z.boolean().describe("true solo si sale de reseñas reales de la ficha."),
    story: text.describe("Protagonista, peor momento, escalada, giro y resolución, en pocas frases."),
    interview_questions: z.array(text),
  }),
  offer: z.object({
    as_layer: z.boolean().describe("true si la oferta va como capa de otro ángulo."),
    structure: text.describe("Uno de los packs de PRECIO Y OFERTA y por qué."),
    anchor: text,
    urgency: maybe.describe("Plazo real o null."),
  }),
};

export function angleBriefSchema(a: SalesAngle) {
  return z.object({ ...briefBase, details: DETAILS[a] });
}

/** Lo común a los 6 briefs, como lo entrega el agente de ángulo. */
export const angleBriefBaseSchema = z.object({ ...briefBase, details: z.record(z.string(), z.unknown()) });
/**
 * El desarrollo como se guarda (lo que leen la pantalla y los pasos siguientes): lo del agente de
 * ángulo más los ganchos de su agente. `hooks` vacío: el paso de ganchos falló (`hooks_error`).
 */
export type AngleBriefPayload = z.infer<typeof angleBriefBaseSchema> & { hooks: AngleHook[]; recommended_hook: number } & HooksMeta;

/** Lo que el comerciante puede editar de un desarrollo. */
export const angleBriefEditSchema = z.object({
  hooks: z.array(z.string().trim().min(1)).max(12),
  recommended_hook: z.number().int().min(0),
  aida_summary: z.object({ attention: z.string().trim().min(1), interest: z.string().trim().min(1), desire: z.string().trim().min(1), action: z.string().trim().min(1) }),
  objection_handling: z.array(z.object({ objection: z.string().trim().min(1), answer: z.string().trim().min(1) })).max(8),
  offer_layer: z.string().trim().min(1),
});
export type AngleBriefEdit = z.infer<typeof angleBriefEditSchema>;
