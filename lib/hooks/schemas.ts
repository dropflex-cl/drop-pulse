// Salida estructurada del agente de ganchos (agentes-creativos/hook-cod-latam.md › §8) y sus reglas en
// código. Claves en inglés; lo que se dice y se lee, en el idioma del mercado; el visual y el
// diagnóstico, en español para el comerciante. Puro.

import * as z from "zod/v4";
import { claimProblems, healthProblems } from "@/lib/creatives/schemas";
import { allowedAmounts, amountAllowed } from "@/lib/copy/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import {
  ARCHETYPES,
  DISCARD_SCORE,
  FOLLOW_UP_MAX_WORDS,
  HOOK_PATTERNS,
  HOOKS_PER_ANGLE,
  MASCOT_PATTERNS,
  MIN_MASCOT_HOOKS,
  MIN_MASCOT_PATTERNS,
  OPENING_SHOTS,
  MAX_PER_PATTERN,
  MIN_PATTERNS,
  ON_SCREEN_MAX_WORDS,
  PATTERN_DEFS,
  PATTERN_NAMES,
  RISKS,
  SPOKEN_MAX_WORDS,
  TOP_HOOKS,
  type Archetype,
  type HookPattern,
  type HookRisk,
  type OpeningShot,
} from "./catalog";
import { COD_IN_HOOK, RESULT_TIMELINE, riskyShape, SECOND_PERSON_BODY, studioWord } from "./policy";

/** Bump cuando cambie el prompt o el esquema del agente de ganchos (lib/hooks/prompts.ts). 2: la primera toma (opening_shot) y la versión de mascota. */
export const HOOKS_PROMPT_VERSION = 2;

const text = z.string();

const scores = z.object({
  salience: z.number().int().describe("1 a 5. ¿La primera toma tiene movimiento, cara, mano en acción o texto grande?"),
  relevance: z.number().int().describe("1 a 5. ¿El cliente ideal se reconoce en 2 s o menos?"),
  credibility: z.number().int().describe("1 a 5. ¿Hay algo que lo haga creíble (demo, persona hablando, precio concreto, tienda)?"),
  verifiability: z.number().int().describe("1 a 5. ¿Lo que promete es lo que el cliente va a ver al abrir el paquete?"),
});

const hookOut = z.object({
  pattern: z.enum(HOOK_PATTERNS),
  mechanism: text.describe("El mecanismo psicológico, en pocas palabras («Ciclo abierto», «Aversión a la pérdida»)."),
  text: text.describe("El hablado de 0 a 3 s, en el idioma del mercado y con tuteo."),
  follow_up: text.nullable().describe("La segunda frase, hasta los 6 s, o null."),
  on_screen: text.describe("El texto en pantalla de 0 a 3 s, legible sin sonido. Puede ser distinto del hablado."),
  visual_first_3s: text.describe("La primera toma concreta: qué se ve, el plano y la acción. Nunca un logo ni el producto girando sin contexto."),
  scores,
  risk: z.enum(RISKS).describe("Riesgo de rechazo de Meta o de rechazo en la entrega (COD)."),
  risk_reason: text.describe("La razón del riesgo en 5 palabras."),
  needs_real_material: text.nullable().describe("Qué material real hace falta para usarlo sin inventar nada («Un testimonio real en video», «Grabar la bodega con los pedidos»), o null si se puede hacer con lo que hay."),
  policy_ok: z.boolean().describe("false si roza la política de atributos personales de Meta o promete un resultado de salud."),
  opening_shot: z.enum(OPENING_SHOTS).describe("La primera toma de un video hecho con IA. real_footage si muestra el efecto o el resultado, o si necesita grabar algo real."),
  first_motion: text.describe("Qué ya se está moviendo en el cuadro 0, en una frase."),
  mascot: z
    .object({
      text: text.describe("El mismo gancho dicho por el personaje sobre sí mismo o «mi dueño», en primera persona."),
      on_screen: text.describe("Su texto en pantalla."),
      scene: text.describe("La escena graciosa del cuadro 0: el personaje YA con el problema, haciendo algo que muestra el gancho. La situación, no la forma del personaje."),
      first_motion: text.describe("Qué hace el personaje desde el cuadro 0."),
    })
    .nullable()
    .describe("La versión para el video de mascota, o null si el patrón no encaja (confesión, autoridad, bastidores, comentario, prueba puesta, demostración)."),
});

export const hooksOutputSchema = z.object({
  diagnosis: z.object({
    archetype: z.enum(ARCHETYPES),
    secondary_archetype: z.enum(ARCHETYPES).nullable(),
    core_pain: text.describe("El dolor o deseo central, con las palabras del cliente."),
    main_objection: text.describe("La objeción principal (casi siempre «¿será estafa?», «¿sí funciona?» o «¿me va a quedar?»)."),
    policy_risk: z.enum(RISKS).describe("Riesgo de política de la categoría."),
  }),
  hooks: z.array(hookOut).describe(`${HOOKS_PER_ANGLE} ganchos en al menos ${MIN_PATTERNS} patrones distintos, como mucho ${MAX_PER_PATTERN} por patrón.`),
  top: z
    .array(
      z.object({
        hook: z.number().int().describe("Índice (desde 0) del gancho en hooks."),
        why: text.describe("Por qué probarlo primero, en una línea."),
        variant: z.object({
          changes: z.enum(["spoken", "on_screen", "visual"]).describe("La única variable que cambia la variante A/B."),
          text: text.describe("El nuevo valor de esa variable."),
        }),
      }),
    )
    .describe(`Los ${TOP_HOOKS} para probar primero, del mejor al tercero.`),
  production_notes: z.array(text).describe("Qué grabar si no sirve el video del proveedor y qué material real falta."),
});
export type HooksOutput = z.infer<typeof hooksOutputSchema>;
export type HookScores = z.infer<typeof scores>;
export type HookDiagnosis = HooksOutput["diagnosis"];
export type HookTop = HooksOutput["top"][number];

/**
 * Un gancho como se guarda en `angle_briefs.payload.hooks`. Los desarrollos de antes (hasta la versión
 * 3 del agente de ángulo) solo traen `text`, `visual_first_3s` y `policy_ok`: lo demás es opcional.
 */
export interface AngleHook {
  text: string;
  visual_first_3s: string;
  policy_ok: boolean;
  pattern?: HookPattern;
  mechanism?: string;
  follow_up?: string | null;
  on_screen?: string;
  scores?: HookScores;
  risk?: HookRisk;
  risk_reason?: string;
  needs_real_material?: string | null;
  /** El comerciante cambió el hablado: el puntaje y el visual eran del texto anterior. */
  edited?: boolean;
  /** Desde la versión 2 del agente. Los de antes valen como `selfie_talk`. */
  opening_shot?: OpeningShot;
  first_motion?: string;
  /** La versión del gancho para la mascota, o null si no encaja. */
  mascot?: MascotHook | null;
}

export type MascotHook = NonNullable<HooksOutput["hooks"][number]["mascot"]>;

/** Lo que el paso de ganchos deja en el desarrollo (además de `hooks` y `recommended_hook`). */
export interface HooksMeta {
  hook_diagnosis?: HookDiagnosis;
  hook_top?: HookTop[];
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

function spokenAmounts(t: string): number[] {
  return [...t.matchAll(SPOKEN_AMOUNT)]
    .map((m) => Number(m[1].replace(/[.,]/g, "")) * (m[2] ? 1000 : 1) + (m[3] ? Number(m[3]) : 0))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Lo que está mal en un texto de gancho (del modelo o editado): segunda persona sobre el cuerpo,
 * promesas de salud, plazos y montos fuera de PRECIO Y OFERTA. `pricing` null: sin revisar montos.
 */
export function hookTextProblems(t: string, pricing: PricingPlan | null, at = ""): string[] {
  const problems: string[] = [];
  if (SECOND_PERSON_BODY.test(t)) problems.push(`${at}«${t}» le atribuye a quien mira una condición del cuerpo, la edad o la salud: usa primera persona («me pasaba…») o tercera («quienes…»).`);
  if (RESULT_TIMELINE.test(t)) problems.push(`${at}«${t}» promete un plazo de resultado: quítalo.`);
  if (pricing) {
    problems.push(...claimProblems(t, pricing, at));
    const allowed = allowedAmounts(pricing);
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
}

/** Qué está mal en la respuesta del agente de ganchos. Vacío si se puede guardar. */
export function hookProblems(out: HooksOutput, facts: HookFacts): string[] {
  const problems: string[] = [];
  const hooks = out.hooks;
  if (hooks.length !== HOOKS_PER_ANGLE) problems.push(`Trae ${hooks.length} ganchos; deben ser ${HOOKS_PER_ANGLE}.`);

  const byPattern = new Map<HookPattern, number>();
  for (const h of hooks) byPattern.set(h.pattern, (byPattern.get(h.pattern) ?? 0) + 1);
  if (byPattern.size < MIN_PATTERNS) problems.push(`Los ganchos usan ${byPattern.size} patrones; deben ser al menos ${MIN_PATTERNS} distintos.`);
  for (const [p, n] of byPattern) if (n > MAX_PER_PATTERN) problems.push(`Hay ${n} ganchos de ${PATTERN_NAMES[p]} (${p}); el máximo es ${MAX_PER_PATTERN} por patrón.`);

  const seen = new Set<string>();
  hooks.forEach((h, i) => {
    const at = `El gancho ${i + 1}: `;
    const key = h.text.trim().toLowerCase();
    if (seen.has(key)) problems.push(`${at}repite el hablado de otro gancho.`);
    seen.add(key);
    if (!h.text.trim()) problems.push(`${at}no trae el hablado.`);
    if (!h.on_screen.trim()) problems.push(`${at}no trae el texto en pantalla.`);
    if (!h.visual_first_3s.trim()) problems.push(`${at}no trae el visual de 0 a 3 s.`);
    const spoken = wordCount(h.text);
    if (spoken > SPOKEN_MAX_WORDS) problems.push(`${at}el hablado tiene ${spoken} palabras; el máximo es ${SPOKEN_MAX_WORDS} (3 s).`);
    if (h.follow_up && wordCount(h.follow_up) > FOLLOW_UP_MAX_WORDS) problems.push(`${at}la segunda frase tiene ${wordCount(h.follow_up)} palabras; el máximo es ${FOLLOW_UP_MAX_WORDS}.`);
    const screen = wordCount(h.on_screen);
    if (screen > ON_SCREEN_MAX_WORDS) problems.push(`${at}el texto en pantalla tiene ${screen} palabras; el máximo es ${ON_SCREEN_MAX_WORDS}.`);
    for (const [k, v] of Object.entries(h.scores)) {
      if (!Number.isInteger(v) || v < 1 || v > 5) problems.push(`${at}el puntaje ${k} es ${v}; va de 1 a 5.`);
      else if (v <= DISCARD_SCORE) problems.push(`${at}tiene ${v} en ${k}: descártalo y escribe otro en su lugar.`);
    }
    for (const t of [h.text, h.follow_up ?? "", h.on_screen]) if (t) problems.push(...hookTextProblems(t, facts.pricing, at));
    if (COD_IN_HOOK.test(`${h.text} ${h.on_screen}`)) problems.push(`${at}el pago contra entrega y el envío gratis van en el título y el texto del anuncio, no en los primeros 3 s.`);
    const need = PATTERN_DEFS[h.pattern].needsReal;
    const missing = need === "always" || (need === "reviews" && !facts.hasRealReviews) || (need === "expert" && !facts.hasRealExpert);
    if (missing && !h.needs_real_material?.trim())
      problems.push(`${at}es de ${PATTERN_NAMES[h.pattern]} y la ficha no trae ese material real: dilo en needs_real_material (nunca lo inventes).`);
    // La primera toma (docs/spec-video-detener-scroll.md §3.3).
    if (h.needs_real_material?.trim() && h.opening_shot !== "real_footage") problems.push(`${at}pide material real: su opening_shot es real_footage.`);
    if (need === "always" && h.opening_shot !== "real_footage") problems.push(`${at}es de ${PATTERN_NAMES[h.pattern]}: se graba de verdad, su opening_shot es real_footage.`);
    if (!h.first_motion.trim()) problems.push(`${at}no dice qué se mueve en el cuadro 0 (first_motion).`);
    const studio = studioWord(`${h.visual_first_3s} ${h.first_motion}`);
    if (studio) problems.push(`${at}la primera toma usa lenguaje de estudio («${studio}»): descríbela como un video de teléfono en una casa.`);
    problems.push(...mascotProblems(h, facts.pricing, at));
  });

  const mascots = hooks.filter((h) => h.mascot);
  const mascotPatterns = new Set(mascots.map((h) => h.pattern));
  if (mascots.length < MIN_MASCOT_HOOKS || mascotPatterns.size < MIN_MASCOT_PATTERNS)
    problems.push(`Trae ${mascots.length} ganchos con versión de mascota en ${mascotPatterns.size} patrones; deben ser al menos ${MIN_MASCOT_HOOKS} en ${MIN_MASCOT_PATTERNS} patrones distintos.`);

  if (out.top.length !== TOP_HOOKS) problems.push(`top trae ${out.top.length}; deben ser ${TOP_HOOKS}.`);
  const tops = new Set<number>();
  out.top.forEach((t, i) => {
    const h = hooks[t.hook];
    if (!h) return problems.push(`top ${i + 1} apunta al gancho ${t.hook}, que no existe (los índices van de 0 a ${hooks.length - 1}).`);
    if (tops.has(t.hook)) problems.push(`top ${i + 1} repite el gancho ${t.hook + 1}.`);
    tops.add(t.hook);
    if (!h.policy_ok || h.risk === "high") problems.push(`top ${i + 1} es el gancho ${t.hook + 1}, que tiene riesgo alto o roza la política: elige otro para probar primero.`);
    if (!t.variant.text.trim()) problems.push(`top ${i + 1} no trae su variante A/B.`);
    else if (t.variant.changes !== "visual") problems.push(...hookTextProblems(t.variant.text, facts.pricing, `La variante del top ${i + 1}: `));
  });
  return problems;
}

/** La versión de mascota de un gancho: solo en los patrones que encajan, con sus largos y reglas. */
function mascotProblems(h: HooksOutput["hooks"][number], pricing: PricingPlan, at: string): string[] {
  const m = h.mascot;
  if (!m) return [];
  const problems: string[] = [];
  const where = `${at}la versión de mascota `;
  if (!MASCOT_PATTERNS.includes(h.pattern) || h.opening_shot === "real_footage") return [`${at}es de ${PATTERN_NAMES[h.pattern]}: no encaja en la mascota, mascot es null.`];
  if (!m.text.trim() || !m.on_screen.trim() || !m.scene.trim() || !m.first_motion.trim()) problems.push(`${where}tiene campos vacíos.`);
  if (wordCount(m.text) > SPOKEN_MAX_WORDS) problems.push(`${where}tiene ${wordCount(m.text)} palabras habladas; el máximo es ${SPOKEN_MAX_WORDS}.`);
  if (wordCount(m.on_screen) > ON_SCREEN_MAX_WORDS) problems.push(`${where}tiene ${wordCount(m.on_screen)} palabras en pantalla; el máximo es ${ON_SCREEN_MAX_WORDS}.`);
  for (const t of [m.text, m.on_screen]) problems.push(...hookTextProblems(t, pricing, where));
  if (COD_IN_HOOK.test(`${m.text} ${m.on_screen}`)) problems.push(`${where}habla del pago contra entrega: va al final, no en el gancho.`);
  const shape = riskyShape(m.scene);
  if (shape) problems.push(`${where}describe una forma que puede leerse como algo sexual («${shape}»): la escena cuenta la situación, no la forma del personaje.`);
  return problems;
}

/** Lo que se guarda en el desarrollo: los ganchos y su recomendado (el primero del top). */
export function hooksToPayload(out: HooksOutput): { hooks: AngleHook[]; recommended_hook: number } & HooksMeta {
  return {
    hooks: out.hooks.map((h) => ({ ...h })),
    recommended_hook: out.top[0]?.hook ?? 0,
    hook_diagnosis: out.diagnosis,
    hook_top: out.top,
    hook_notes: out.production_notes,
    hooks_version: HOOKS_PROMPT_VERSION,
    hooks_error: null,
  };
}

export type { Archetype };
