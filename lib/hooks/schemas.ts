// Salida estructurada del agente de ganchos (agentes-creativos/hook-cod-latam.md › §8) y sus reglas en
// código. Claves en inglés; lo que se dice y se lee, en el idioma del mercado; el visual y el
// diagnóstico, en español para el comerciante. Puro.

import * as z from "zod/v4";
import { claimProblems, healthProblems } from "@/lib/creatives/schemas";
import { allowedAmounts, amountAllowed } from "@/lib/copy/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import {
  ARCHETYPE_NAMES,
  ARCHETYPES,
  FOLLOW_UP_MAX_WORDS,
  HOOK_DELIVERIES,
  HOOK_PATTERNS,
  HOOKS_PER_ANGLE,
  ON_SCREEN_MAX_WORDS,
  OPENING_SHOT_DEFS,
  OPENING_SHOTS,
  PATTERN_DEFS,
  PATTERN_NAMES,
  REAL_MATERIAL_NOTE,
  RISKS,
  SPOKEN_MAX_WORDS,
  type Archetype,
  type HookDelivery,
  type HookPattern,
  type HookRisk,
  type OpeningShot,
} from "./catalog";
import { COD_IN_HOOK, RESULT_TIMELINE, SECOND_PERSON_BODY, studioWord } from "./policy";
import { isUsable } from "./select";

/**
 * Bump cuando cambie el prompt o el esquema del agente de ganchos (lib/hooks/prompts.ts). 2: la primera
 * toma (opening_shot) y la versión de mascota. 3: parte del gancho del ángulo (orquestador v7). 4: detener
 * el scroll (tensión, el problema nombrado, MATERIA PRIMA, rank, delivery y el crítico de ganchos, retirado con la estrategia).
 * 5: los montos del ancla de mercado del ángulo (market_anchor) se pueden usar. 6: prompt corto con el
 * contexto de lib/ai/context.ts (docs/spec-prompts-simples.md §4): sin la biblioteca de patrones, sin
 * cuotas, sin la versión de mascota (la escribe el guion de mascota), citas opcionales, sin puntajes ni
 * mecanismo, y lo que es regla (material real, citas, orden) lo arregla el código. 7: sin las frases del cliente ideal
 * ni citas (el chat, sin ellas, escribía mejores ganchos; spec-prompts-simples §14), `delivery` de la lista y el tope
 * de la segunda frase en el prompt (en la 6 eran la mitad de los rechazos).
 */
export const HOOKS_PROMPT_VERSION = 7;

const text = z.string();

const hookOut = z.object({
  text: text.describe("El hablado de 0 a 3 s, en el idioma del mercado y con tuteo. Su primera frase lleva la tensión."),
  follow_up: text.nullable().describe("La segunda frase, hasta los 6 s y tan corta como el hablado, o null."),
  on_screen: text.describe("El texto en pantalla de 0 a 3 s, legible sin sonido: la tensión con el problema adentro, no una etiqueta."),
  silent_read: text.describe("Qué entiende alguien en 1 s SIN sonido, solo con el texto en pantalla y la primera imagen, en una frase."),
  visual_first_3s: text.describe("La primera imagen: qué se ve y qué pasa, como un video de teléfono en una casa."),
  opening_shot: z.enum(OPENING_SHOTS).describe(`Con qué abre: ${OPENING_SHOTS.map((s) => `${s} (${OPENING_SHOT_DEFS[s].name.toLowerCase()})`).join(", ")}.`),
  first_motion: text.describe("Qué ya se está moviendo en la primera imagen, en una frase."),
  delivery: z.enum(HOOK_DELIVERIES).describe("Cómo se dice. Nunca gritado."),
  pattern: z.enum(HOOK_PATTERNS).describe(`El tipo de gancho que escribiste: ${HOOK_PATTERNS.map((p) => `${p} (${PATTERN_NAMES[p].toLowerCase()})`).join(", ")}.`),
  rank: z.number().int().describe(`Su lugar entre los ${HOOKS_PER_ANGLE}, de 1 (el que más detiene el scroll) a ${HOOKS_PER_ANGLE}.`),
  risk: z.enum(RISKS).describe("Riesgo de rechazo de Meta o de rechazo en la entrega."),
  risk_reason: text.describe("La razón del riesgo en 5 palabras."),
  needs_real_material: text.nullable().describe("Qué material real hace falta para usarlo sin inventar nada, o null."),
  policy_ok: z.boolean().describe("false si roza la política de atributos personales de Meta o la salud."),
});

export const hooksOutputSchema = z.object({
  diagnosis: z.object({
    archetype: z.enum(ARCHETYPES).describe(`El tipo de producto: ${ARCHETYPES.map((a) => `${a} (${ARCHETYPE_NAMES[a].toLowerCase()})`).join(", ")}.`),
    main_objection: text.describe("La duda que más frena la compra («¿será estafa?», «¿sí funciona?»)."),
    policy_risk: z.enum(RISKS).describe("Riesgo de política de la categoría."),
  }),
  hooks: z.array(hookOut).describe(`${HOOKS_PER_ANGLE} ganchos.`),
});
export type HooksOutput = z.infer<typeof hooksOutputSchema>;
export type HookOut = HooksOutput["hooks"][number];
export type HookDiagnosis = HooksOutput["diagnosis"];
/** El top 3 con su variante A/B (hasta la versión 3 del agente; ahora el orden lo da `rank` y el crítico). */
export interface HookTop {
  hook: number;
  why: string;
  variant: { changes: string; text: string };
}

/** Lo que dijo el crítico de un gancho (hasta la estrategia de 2026-10-05; se sigue leyendo en lo guardado). */
export interface HookReview {
  stops: boolean;
  understood_muted: string;
  why: string;
}

/** La versión de mascota que escribía el agente hasta la versión 5 (ahora la escribe el guion de mascota). */
export interface MascotHook {
  text: string;
  on_screen: string;
  scene: string;
  first_motion: string;
}

/**
 * Un gancho como se guarda en `angle_briefs.payload.hooks`. Los desarrollos de antes (hasta la versión
 * 3 del agente de ángulo) solo traen `text`, `visual_first_3s` y `policy_ok`: lo demás es opcional.
 * Desde la versión 4 del agente de ganchos se guardan en su orden (`rank`): el primero detiene más.
 */
export interface AngleHook {
  text: string;
  visual_first_3s: string;
  policy_ok: boolean;
  pattern?: HookPattern;
  follow_up?: string | null;
  on_screen?: string;
  risk?: HookRisk;
  risk_reason?: string;
  needs_real_material?: string | null;
  /** El comerciante cambió el hablado: el visual era del texto anterior. */
  edited?: boolean;
  /** Desde la versión 2 del agente. Los de antes valen como `selfie_talk`. */
  opening_shot?: OpeningShot;
  first_motion?: string;
  /** Desde la versión 4: lo que se entiende sin sonido, la cita de la que parte (hasta la 6), cómo se dice y su lugar. */
  silent_read?: string;
  source_quote?: string | null;
  delivery?: HookDelivery;
  rank?: number;
  /** El crítico (versión 4), o nada si no corrió. */
  review?: HookReview;
  // Hasta la versión 5: se siguen leyendo en lo guardado.
  mechanism?: string;
  /** Los criterios cambiaron entre versiones (antes: verifiability; desde la 4: tension). */
  scores?: Partial<Record<"salience" | "relevance" | "tension" | "credibility" | "verifiability", number>>;
  mascot?: MascotHook | null;
  promises_only_what_arrives?: boolean;
}

/** Lo que el paso de ganchos deja en el desarrollo (además de `hooks` y `recommended_hook`). */
export interface HooksMeta {
  hook_diagnosis?: HookDiagnosis;
  hook_top?: HookTop[];
  /** Hasta la versión 5 (production_notes). */
  hook_notes?: string[];
  hooks_version?: number;
  /** El paso de ganchos falló: el desarrollo quedó sin ganchos y se piden con «Otros ganchos». */
  hooks_error?: string | null;
}

// ---------------------------------------------------------------- Reglas

/** Las palabras de un texto (sin signos). */
export function wordCount(t: string): number {
  return t.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Un monto hablado sin símbolo («190 mil pesos», «24 mil 990 pesos», «100 soles»). */
const SPOKEN_AMOUNT = /(\d[\d.,]*)(\s*mil(?:\s+(\d{1,3}))?)?\s*(pesos|soles|quetzales|colones|d[oó]lares|reales|bol[ií]vares|guaran[ií]es)\b/gi;

export function spokenAmounts(t: string): number[] {
  return [...t.matchAll(SPOKEN_AMOUNT)]
    .map((m) => Number(m[1].replace(/[.,]/g, "")) * (m[2] ? 1000 : 1) + (m[3] ? Number(m[3]) : 0))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Lo que está mal en un texto de gancho (del modelo o editado): segunda persona sobre el cuerpo,
 * promesas de salud, plazos y montos fuera de PRECIO Y OFERTA. `pricing` null: sin revisar montos.
 */
export function hookTextProblems(t: string, pricing: PricingPlan | null, at = "", extra: number[] = []): string[] {
  const problems: string[] = [];
  if (SECOND_PERSON_BODY.test(t)) problems.push(`${at}«${t}» le atribuye a quien mira una condición del cuerpo, la edad o la salud: usa primera persona («me pasaba…») o tercera («quienes…»).`);
  if (RESULT_TIMELINE.test(t)) problems.push(`${at}«${t}» promete un plazo de resultado: quítalo.`);
  if (pricing) {
    problems.push(...claimProblems(t, pricing, at, extra));
    const allowed = [...allowedAmounts(pricing), ...extra];
    for (const n of spokenAmounts(t)) if (!amountAllowed(n, allowed)) problems.push(`${at}«${t}» trae un monto que no está en PRECIO Y OFERTA.`);
  } else problems.push(...healthProblems(t, at));
  return problems;
}

/** ¿Pasa las reglas de código? Lo que se usa para un gancho que editó el comerciante. */
export const hookTextOk = (t: string, pricing: PricingPlan | null = null) => hookTextProblems(t, pricing).length === 0;

export interface HookFacts {
  pricing: PricingPlan;
  hasRealReviews: boolean;
  hasRealExpert: boolean;
  /** El ancla de mercado del ángulo que verificó el comerciante (TestAngle.market_amounts). */
  marketAmounts?: number[];
}

/**
 * Lo que es regla y no creación lo arregla el código en vez de pagar otra respuesta (spec-prompts-simples
 * P3): en producción, el material real y las citas eran 13 de los ~37 problemas. Un patrón que necesita
 * material real que no hay lo dice; lo que pide material real abre con grabación real; el orden se numera
 * de 1 a 10 sin empates.
 */
export function normalizeHooks(out: HooksOutput, facts: HookFacts): HooksOutput {
  const hooks = out.hooks.map((h) => {
    const need = PATTERN_DEFS[h.pattern].needsReal;
    const missing = need === "always" || (need === "reviews" && !facts.hasRealReviews) || (need === "expert" && !facts.hasRealExpert);
    const needs = h.needs_real_material?.trim() || (missing && need ? REAL_MATERIAL_NOTE[need] : null);
    return { ...h, needs_real_material: needs, opening_shot: needs ? ("real_footage" as const) : h.opening_shot };
  });
  const order = hooks.map((_, i) => i).sort((a, b) => hooks[a].rank - hooks[b].rank || a - b);
  order.forEach((i, k) => (hooks[i] = { ...hooks[i], rank: k + 1 }));
  return { ...out, hooks };
}

/**
 * Qué está mal en la respuesta del agente de ganchos (ya normalizada). Vacío si se puede guardar. Solo
 * lo que hay que volver a escribir: los largos, la política, los montos y lo que falta.
 */
export function hookProblems(out: HooksOutput, facts: HookFacts): string[] {
  const problems: string[] = [];
  const hooks = out.hooks;
  if (hooks.length !== HOOKS_PER_ANGLE) problems.push(`Trae ${hooks.length} ganchos; deben ser ${HOOKS_PER_ANGLE}.`);

  const seen = new Set<string>();
  hooks.forEach((h, i) => {
    const at = `El gancho ${i + 1}: `;
    const key = h.text.trim().toLowerCase();
    if (seen.has(key)) problems.push(`${at}repite el hablado de otro gancho.`);
    seen.add(key);
    if (!h.text.trim()) problems.push(`${at}no trae el hablado.`);
    if (!h.on_screen.trim()) problems.push(`${at}no trae el texto en pantalla.`);
    if (!h.visual_first_3s.trim()) problems.push(`${at}no trae la primera imagen.`);
    if (!h.silent_read.trim()) problems.push(`${at}no dice qué se entiende sin sonido (silent_read).`);
    if (!h.first_motion.trim()) problems.push(`${at}no dice qué se mueve en la primera imagen (first_motion).`);
    const spoken = wordCount(h.text);
    if (spoken > SPOKEN_MAX_WORDS) problems.push(`${at}el hablado tiene ${spoken} palabras; el máximo es ${SPOKEN_MAX_WORDS} (3 s).`);
    if (h.follow_up && wordCount(h.follow_up) > FOLLOW_UP_MAX_WORDS) problems.push(`${at}la segunda frase tiene ${wordCount(h.follow_up)} palabras; el máximo es ${FOLLOW_UP_MAX_WORDS}.`);
    const screen = wordCount(h.on_screen);
    if (screen > ON_SCREEN_MAX_WORDS) problems.push(`${at}el texto en pantalla tiene ${screen} palabras; el máximo es ${ON_SCREEN_MAX_WORDS}.`);
    for (const t of [h.text, h.follow_up ?? "", h.on_screen]) if (t) problems.push(...hookTextProblems(t, facts.pricing, at, facts.marketAmounts));
    if (COD_IN_HOOK.test(`${h.text} ${h.on_screen}`)) problems.push(`${at}el pago contra entrega y el envío gratis van en el título y el texto del anuncio, no en los primeros 3 s.`);
    const studio = studioWord(`${h.visual_first_3s} ${h.first_motion}`);
    if (studio) problems.push(`${at}la primera imagen usa lenguaje de estudio («${studio}»): descríbela como un video de teléfono en una casa.`);
  });
  return problems;
}

/** Lo que el crítico ordenó y dijo de cada gancho (índices de `out.hooks`). */
export interface HooksReview {
  order: number[];
  reviews: (HookReview & { hook: number })[];
}

/**
 * Lo que se guarda en el desarrollo: los ganchos en su orden (el del crítico o, si no corrió, `rank`),
 * con su lugar y lo que dijo el crítico, y el recomendado: el primero que se puede usar.
 */
export function hooksToPayload(out: HooksOutput, review?: HooksReview | null): { hooks: AngleHook[]; recommended_hook: number } & HooksMeta {
  const order = review?.order.length === out.hooks.length ? review.order : out.hooks.map((_, i) => i).sort((a, b) => out.hooks[a].rank - out.hooks[b].rank || a - b);
  const byHook = new Map(review?.reviews.map(({ hook, ...r }) => [hook, r]) ?? []);
  const hooks: AngleHook[] = order.map((i, k) => {
    const h = out.hooks[i];
    const r = byHook.get(i);
    return { ...h, rank: k + 1, ...(r ? { review: r } : {}) };
  });
  const usable = hooks.findIndex(isUsable);
  return {
    hooks,
    recommended_hook: Math.max(0, usable),
    hook_diagnosis: out.diagnosis,
    hooks_version: HOOKS_PROMPT_VERSION,
    hooks_error: null,
  };
}

export type { Archetype };
