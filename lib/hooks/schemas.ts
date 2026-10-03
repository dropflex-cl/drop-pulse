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
  HOOK_DELIVERIES,
  MIN_QUOTED_HOOKS,
  QUOTE_SHARED_WORDS,
  type Archetype,
  type HookDelivery,
  type HookPattern,
  type HookRisk,
  type OpeningShot,
} from "./catalog";
import { COD_IN_HOOK, RESULT_TIMELINE, riskyShape, SECOND_PERSON_BODY, studioWord } from "./policy";
import { isUsable } from "./select";

/**
 * Bump cuando cambie el prompt o el esquema del agente de ganchos (lib/hooks/prompts.ts). 2: la primera
 * toma (opening_shot) y la versión de mascota. 3: parte del gancho del ángulo (orquestador v7). 4: detener
 * el scroll (tensión, el problema nombrado, MATERIA PRIMA, rank, delivery y el crítico de lib/hooks/critic.ts).
 */
export const HOOKS_PROMPT_VERSION = 4;

const text = z.string();

const scores = z.object({
  salience: z.number().int().describe("1 a 5. ¿En medio segundo hay algo que mirar: movimiento, una cara en medio de un gesto, una mano haciendo algo, algo raro o fuera de lugar?"),
  relevance: z.number().int().describe("1 a 5. ¿El cliente ideal se reconoce en 2 s o menos?"),
  tension: z.number().int().describe("1 a 5. ¿Deja una pregunta abierta o algo en juego (un secreto, algo que salió mal, alguien a quien quiere)? Una descripción tranquila o una característica del producto es 1 o 2."),
  credibility: z.number().int().describe("1 a 5. ¿Suena a alguien real y no a un anuncio (una persona hablando, una frase que diría la gente)?"),
});

const hookOut = z.object({
  pattern: z.enum(HOOK_PATTERNS),
  mechanism: text.describe("El mecanismo psicológico, en pocas palabras («Ciclo abierto», «Aversión a la pérdida»)."),
  text: text.describe("El hablado de 0 a 3 s, en el idioma del mercado y con tuteo. Su primera frase lleva la tensión."),
  follow_up: text.nullable().describe("La segunda frase, hasta los 6 s, o null."),
  on_screen: text.describe("El texto en pantalla de 0 a 3 s, legible sin sonido. Nombra el problema o la tensión, no una etiqueta."),
  silent_read: text.describe("Qué entiende alguien en 1 s SIN sonido, solo con el texto en pantalla y la primera toma, en una frase."),
  source_quote: text.nullable().describe("La frase de MATERIA PRIMA de la que parte, copiada textual, o null."),
  delivery: text.describe(`Cómo se dice: ${HOOK_DELIVERIES.join(", ")}.`),
  visual_first_3s: text.describe("La primera toma concreta: qué se ve, el plano y la acción. Nunca un logo ni el producto girando sin contexto."),
  scores,
  promises_only_what_arrives: z.boolean().describe("true si lo que promete es lo que el cliente ve al abrir el paquete. false: reemplázalo."),
  rank: z.number().int().describe(`Su lugar entre los ${HOOKS_PER_ANGLE}, de 1 (el que más detiene el scroll) a ${HOOKS_PER_ANGLE}, sin empates.`),
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
    // Texto validado en código (hookProblems): un enum más agranda la gramática de la salida estructurada.
    secondary_archetype: text.nullable().describe(`Otro arquetipo (${ARCHETYPES.join(", ")}) o null.`),
    core_pain: text.describe("El dolor o deseo central, con las palabras del cliente."),
    main_objection: text.describe("La objeción principal (casi siempre «¿será estafa?», «¿sí funciona?» o «¿me va a quedar?»)."),
    policy_risk: z.enum(RISKS).describe("Riesgo de política de la categoría."),
  }),
  hooks: z.array(hookOut).describe(`${HOOKS_PER_ANGLE} ganchos en al menos ${MIN_PATTERNS} patrones distintos, como mucho ${MAX_PER_PATTERN} por patrón.`),
  production_notes: z.array(text).describe("Qué grabar si no sirve el video del proveedor y qué material real falta."),
});
export type HooksOutput = z.infer<typeof hooksOutputSchema>;
export type HookOut = HooksOutput["hooks"][number];
export type HookScores = z.infer<typeof scores>;
export type HookDiagnosis = HooksOutput["diagnosis"];
/** El top 3 con su variante A/B (hasta la versión 3 del agente; ahora el orden lo da `rank` y el crítico). */
export interface HookTop {
  hook: number;
  why: string;
  variant: { changes: string; text: string };
}

/** Lo que dijo el crítico de un gancho (lib/hooks/critic.ts). */
export interface HookReview {
  stops: boolean;
  understood_muted: string;
  why: string;
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
  mechanism?: string;
  follow_up?: string | null;
  on_screen?: string;
  /** Los criterios cambiaron entre versiones (antes: verifiability; desde la 4: tension). */
  scores?: Partial<Record<keyof HookScores | "verifiability", number>>;
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
  /** Desde la versión 4: lo que se entiende sin sonido, la cita de la que parte, cómo se dice y su lugar. */
  silent_read?: string;
  source_quote?: string | null;
  delivery?: HookDelivery;
  promises_only_what_arrives?: boolean;
  rank?: number;
  /** El crítico (versión 4), o nada si no corrió. */
  review?: HookReview;
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
  /** MATERIA PRIMA (rawMaterial en lib/hooks/prompts.ts): de donde salen las citas del comprador. */
  rawMaterial: string[];
}

/** Sin tildes, en minúscula y sin signos: para comparar una cita con su fuente. */
function plain(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Las palabras con contenido (4 letras o más) de un texto. */
const contentWords = (t: string) => new Set(plain(t).split(" ").filter((w) => w.length >= 4));

/** ¿La cita está textual en MATERIA PRIMA? (sin contar tildes, mayúsculas ni signos). */
export function quoteFound(quote: string, raw: string[]): boolean {
  const q = plain(quote);
  return q.length > 0 && raw.some((r) => plain(r).includes(q));
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
    if (!h.silent_read.trim()) problems.push(`${at}no dice qué se entiende sin sonido (silent_read).`);
    if (!(HOOK_DELIVERIES as readonly string[]).includes(h.delivery)) problems.push(`${at}delivery es «${h.delivery}»: usa uno de ${HOOK_DELIVERIES.join(", ")}.`);
    if (!h.promises_only_what_arrives) problems.push(`${at}promete algo que el cliente no ve al abrir el paquete: reemplázalo por otro.`);
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

  // El orden: un lugar por gancho, sin empates (ordenar obliga a comparar; un puntaje suelto, no).
  const ranks = hooks.map((h) => h.rank).sort((a, b) => a - b);
  if (ranks.some((r, i) => r !== i + 1)) problems.push(`rank tiene que ir de 1 a ${hooks.length}, un lugar por gancho y sin empates; vino ${hooks.map((h) => h.rank).join(", ")}.`);

  // Las citas del comprador: textuales y usadas de verdad.
  let quoted = 0;
  hooks.forEach((h, i) => {
    const q = h.source_quote?.trim();
    if (!q) return;
    const at = `El gancho ${i + 1}: `;
    if (!quoteFound(q, facts.rawMaterial)) return problems.push(`${at}source_quote «${q}» no está en MATERIA PRIMA: cópiala textual o pon null.`);
    const said = contentWords(`${h.text} ${h.follow_up ?? ""} ${h.on_screen}`);
    const shared = [...contentWords(q)].filter((w) => said.has(w)).length;
    if (shared < QUOTE_SHARED_WORDS) return problems.push(`${at}dice partir de «${q}», pero no usa sus palabras: tómalas casi textuales o pon null.`);
    quoted++;
  });
  if (facts.rawMaterial.length && quoted < MIN_QUOTED_HOOKS) problems.push(`Solo ${quoted} ganchos parten de una frase de MATERIA PRIMA; deben ser al menos ${MIN_QUOTED_HOOKS}, con su source_quote textual.`);

  const mascots = hooks.filter((h) => h.mascot);
  const mascotPatterns = new Set(mascots.map((h) => h.pattern));
  if (mascots.length < MIN_MASCOT_HOOKS || mascotPatterns.size < MIN_MASCOT_PATTERNS)
    problems.push(`Trae ${mascots.length} ganchos con versión de mascota en ${mascotPatterns.size} patrones; deben ser al menos ${MIN_MASCOT_HOOKS} en ${MIN_MASCOT_PATTERNS} patrones distintos.`);

  const second = out.diagnosis.secondary_archetype;
  if (second != null && !(ARCHETYPES as readonly string[]).includes(second)) problems.push(`secondary_archetype es «${second}»: usa uno de ${ARCHETYPES.join(", ")} o null.`);
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
    return { ...h, delivery: h.delivery as HookDelivery, rank: k + 1, ...(r ? { review: r } : {}) };
  });
  const usable = hooks.findIndex(isUsable);
  return {
    hooks,
    recommended_hook: Math.max(0, usable),
    hook_diagnosis: out.diagnosis,
    hook_notes: out.production_notes,
    hooks_version: HOOKS_PROMPT_VERSION,
    hooks_error: null,
  };
}

export type { Archetype };
