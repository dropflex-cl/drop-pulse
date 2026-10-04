// Salida estructurada del guionista UGC y sus reglas (docs/spec-video-ugc.md §3). Claves en inglés;
// lo que dice la persona y lo que se lee en pantalla, en el idioma del mercado; lo que va a los
// modelos de imagen y video, en inglés. Puro.

import * as z from "zod/v4";
import { claimProblems } from "@/lib/creatives/schemas";
import { ON_SCREEN_MAX_WORDS, SPOKEN_MAX_WORDS } from "@/lib/hooks/catalog";
import { COD_IN_HOOK, RESULT_TIMELINE, riskyShape, SECOND_PERSON_BODY, studioWord } from "@/lib/hooks/policy";
export { riskyShape };
import { wordCount } from "@/lib/hooks/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import {
  A_ROLL_SECONDS_MAX,
  CAMERAS,
  FORMAT_LIMITS,
  HOOK_BEAT_MAX_WORD,
  MASCOT_BODIES,
  MASCOT_BODY_KEYS,
  opensWithInsert,
  type Camera,
  type VideoOpeningShot,
  A_ROLL_SECONDS_MIN,
  B_ROLL_CUT_MAX,
  B_ROLL_CUT_MIN,
  B_ROLL_MAX,
  CHARACTER_KEY,
  KEYFRAMES_MAX,
  MISPRONOUNCED,
  WORDS_PER_SECOND_MAX,
  WORDS_PER_SECOND_PROMPT,
  type VideoFormat,
} from "./catalog";

/**
 * Bump cuando cambie el prompt o el esquema del guionista. 3: palabras por segundo con margen (WORDS_PER_SECOND_PROMPT).
 * 4: el ejemplo de mascota del esquema. 5: sin rótulo «Dramatización». 6: el gancho sale de la tríada del agente de
 * ganchos (hook_source). 7: la apertura (opening) y la cámara de cada imagen clave (spec-video-detener-scroll). 8: A1
 * abre con la frase del gancho, sin nada antes, y con su delivery. 9: dos pasos (docs/spec-prompts-simples.md §6):
 * el guion (lo que se dice, effort high) y el plan de tomas (video_plan, effort low); K1 lo arma el código.
 * 10: sin las frases del cliente ideal (spec-prompts-simples §14).
 */
export const UGC_PROMPT_VERSION = 10;
/**
 * Bump cuando cambie el prompt del guionista de mascota (lib/video/prompts.ts). 2: palabras por segundo con margen.
 * 3: silueta segura para Meta. 4: la silueta se describe en positivo. 5: sin rótulo «Animación». 6: el gancho de la
 * tríada, sin el vocero humano. 7: el gancho de su versión de mascota y la apertura (opening). 8: A1 abre con la frase
 * del gancho y su delivery. 9: los ganchos ya no traen su versión de mascota (ganchos v6): el personaje dice el gancho
 * a su manera. 10: dos pasos, y el cuerpo sale de MASCOT_BODIES (el plan elige uno; el código arma la silueta).
 * 11: sin las frases del cliente ideal (spec-prompts-simples §14).
 */
export const MASCOT_PROMPT_VERSION = 11;
/** Bump cuando cambie el prompt o el esquema del QA de imágenes clave. 2: brand_safe (formas que se leen como algo sexual). 3: matches_hook (la apertura) y phone_look (aviso). */
export const KEYFRAME_QA_PROMPT_VERSION = 3;

// ---------------------------------------------------------------- 1. El guion (paso ugc_script)
// Lo que dice la persona o el personaje, toma por toma, con su entrega: el trabajo creativo. Sin
// imágenes clave, cámaras ni B-roll: eso es el plan de tomas.

const lineOut = z.object({
  seconds: z.number().int().describe(`${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX}. Cuenta las palabras: máximo ${String(WORDS_PER_SECOND_PROMPT).replace(".", ",")} por segundo.`),
  line: z.string().describe("Lo que dice, exactamente, en el idioma del mercado. Números en palabras. NUNCA un precio ni un monto."),
  delivery: z.string().describe("En inglés: cómo lo dice (qué palabra remarca, qué tono en cada frase)."),
  acting: z.string().describe("En inglés: gestos y expresión mientras habla."),
});

export const scriptLinesSchema = z.object({
  format_fit: z.object({
    recommended: z
      .enum(["ugc_ai", "mascot", "static", "real_video"])
      .describe("ugc_ai: sirve para video con persona de IA. mascot: rinde más con un personaje animado (un problema físico visible que se puede personificar). static: el ángulo rinde más como imagen. real_video: necesita una persona real (testimonio, experta)."),
    why: z.string().describe("Para el comerciante, una frase."),
  }),
  speaker: z.string().describe("En español, para el plan de tomas: quién habla (UGC: alguien de quien compra, su edad aparente y su rol) o qué es el personaje (mascota: lo que tiene el problema, personificado)."),
  hook_source: z.number().int().nullable().describe("El index del gancho de GANCHOS DEL ÁNGULO con que abre A1, o null si ninguno servía."),
  hook_why: z.string().describe("Para el comerciante, una frase: por qué el gancho detiene el scroll de su cliente."),
  a_roll: z.array(lineOut).describe("Las tomas habladas, en orden (A1, A2…)."),
  end_card: z.object({
    title: z.string().describe("El nombre del producto."),
    subtitle: z.string().describe("Una línea: la razón para comprar hoy (p. ej., «Pagas al recibir»)."),
    cta: z.string().describe("El botón: «Comprar»."),
    small_print: z.array(z.string()).describe("Letra chica obligatoria (tipo de piel, prueba en una zona pequeña, etc.)."),
  }),
  compliance_notes: z.array(z.string()).describe("Para el comerciante: qué cuidar al montar y publicar. Nunca un rótulo de IA, dramatización ni animación."),
});
export type ScriptLines = z.infer<typeof scriptLinesSchema>;

// ---------------------------------------------------------------- 2. El plan de tomas (paso video_plan)
// Encaja el guion ya validado en imágenes clave, cámaras, B-roll y textos en pantalla. K1 (el personaje
// solo) lo arma el código; la apertura sale del gancho elegido.

const keyframe = z.object({
  key: z.string().describe(`«K2» a «K${KEYFRAMES_MAX}» (${CHARACTER_KEY}, el personaje solo, lo pone el sistema).`),
  uses_character: z.boolean().describe("true si aparece la persona o el personaje (cara, manos o cuerpo): se genera con K1 de referencia."),
  uses_product: z.boolean().describe("true si aparece el producto: se genera con la foto real de referencia."),
  one_hand: z.boolean().describe("true si la escena necesita una sola mano visible (sostener el frasco, señalar): evita manos de más."),
  camera: z.enum(CAMERAS).describe("UGC: selfie (cámara frontal a un brazo), pov (cámara trasera mirando hacia abajo, una mano en cuadro), propped (el teléfono apoyado) o mirror (en el espejo). Mascota: animated."),
  prompt: z.string().describe("En inglés, 40 a 90 palabras: la escena (lugar, encuadre, qué hace «the person» o «the character» y en qué estado, qué se ve de «the product», sin describirlo). Sin textos en la imagen."),
});

const bRoll = z.object({
  keyframe: z.string().describe("La imagen clave de la que parte el clip (K2…; nunca K1)."),
  anchor: z.string().describe("UNA palabra de alguna línea, escrita igual: el B-roll entra justo cuando se dice."),
  cut_s: z.number().describe(`Segundos que tapa la toma hablada: ${B_ROLL_CUT_MIN} a ${B_ROLL_CUT_MAX}.`),
  motion: z.string().describe("En inglés: qué se mueve en el clip (acción concreta y corta, cámara)."),
});

const textBeat = z.object({
  anchor: z.string().describe("UNA palabra de alguna línea, escrita igual: el texto aparece cuando se dice."),
  until: z.string().nullable().describe("Palabra de una línea donde se quita, o null (hasta el siguiente texto)."),
  text: z.string().describe("El texto grande en pantalla, en el idioma del mercado: 2 a 6 palabras (el de la oferta puede ir en 2 líneas)."),
});

const planShots = {
  opening: z.object({
    keyframe: z.string().describe("La imagen clave del cuadro 0: la de A1 si abre con la cara (nunca K1), la de B1 si abre con un inserto."),
    first_motion: z.string().describe("En inglés: lo que ya se está moviendo en el cuadro 0."),
  }),
  keyframes: z.array(keyframe).describe(`Desde K2, una por cada escena distinta de las tomas habladas y el B-roll (hasta K${KEYFRAMES_MAX}).`),
  a_roll: z.array(z.object({ keyframe: z.string().describe("La imagen clave de la que parte (K1… con el personaje)."), motion: z.string().describe("En inglés: cámara y movimiento.") })).describe("Una por toma hablada, en el mismo orden."),
  b_roll: z.array(bRoll).describe(`Hasta ${B_ROLL_MAX} insertos cortos sobre la voz; al menos uno por toma hablada.`),
  text_beats: z.array(textBeat).describe("Los textos grandes en pantalla, en orden: el del gancho, cada idea y la oferta al final."),
};

export const ugcPlanSchema = z.object({
  persona: z.string().describe("En inglés: quién habla (edad aparente, género y estilo), alguien común del segmento."),
  character: z.object({
    look: z.string().describe("En inglés: rostro, pelo y rasgos reales de la persona."),
    wardrobe: z.string().describe("En inglés: ropa de casa."),
    setting: z.string().describe("En inglés: el lugar principal, vivido, con la luz de la casa."),
  }),
  ...planShots,
});

export const mascotPlanSchema = z.object({
  character: z.object({
    body: z.enum(MASCOT_BODY_KEYS).describe(`El cuerpo del personaje: ${MASCOT_BODY_KEYS.map((k) => `${k} (${MASCOT_BODIES[k].name.toLowerCase()})`).join(", ")}.`),
    color: z.string().describe("En inglés: su color, pastel y nunca color piel («soft mint green»)."),
    face: z.string().describe("En inglés: ojos, cejas, expresión y algún accesorio, sin cambiar la forma del cuerpo."),
    setting: z.string().describe("En inglés: el lugar principal."),
  }),
  ...planShots,
});
export type UgcPlan = z.infer<typeof ugcPlanSchema>;
export type MascotPlan = z.infer<typeof mascotPlanSchema>;
export const planSchema = (format: VideoFormat) => (format === "mascot" ? mascotPlanSchema : ugcPlanSchema);

// ---------------------------------------------------------------- El guion armado (video_scripts.payload)

export type ScriptOpening = { hook_source: number | null; shot: VideoOpeningShot; keyframe: string; first_motion: string };
/** Los guiones de antes no traen `camera` (versión 7). */
export type UgcKeyframe = Omit<z.infer<typeof keyframe>, "camera"> & { camera?: Camera };
export type UgcARoll = { key: string; keyframe: string; seconds: number; line: string; delivery: string; acting: string; motion: string };
export type UgcBRoll = z.infer<typeof bRoll> & { key: string };

/**
 * El guion como lo leen la pantalla, el render y el paquete. Desde la versión 9 lo arma el código con
 * el guion y el plan (assembleScript); los de antes salían de una sola llamada con la misma forma. Los
 * de antes de la versión 7 no traen `opening`; los de la 6 traían `hook_source` suelto.
 */
export interface UgcScript {
  format_fit: ScriptLines["format_fit"];
  persona: string;
  character: { look: string; wardrobe: string; setting: string };
  opening?: ScriptOpening;
  hook_source?: number | null;
  hook_why: string;
  keyframes: UgcKeyframe[];
  a_roll: UgcARoll[];
  b_roll: UgcBRoll[];
  text_beats: z.infer<typeof textBeat>[];
  end_card: ScriptLines["end_card"];
  compliance_notes: string[];
}

/** K1, el personaje solo: la referencia de la cara de todas las demás. Es regla, no creación: lo arma el código. */
export function characterKeyframe(format: VideoFormat): UgcKeyframe {
  return format === "mascot"
    ? { key: CHARACTER_KEY, uses_character: true, uses_product: false, one_hand: false, camera: "animated", prompt: "The character alone and healthy, happy, facing the camera, its whole body inside the frame, centered." }
    : { key: CHARACTER_KEY, uses_character: true, uses_product: false, one_hand: false, camera: "selfie", prompt: "The person alone, relaxed, looking at the camera with a small natural smile, at home." };
}

/**
 * El guion armado: lo que se dice (`lines`) en las tomas del plan. Las claves (A1…, B1…) las pone el
 * código; la toma de la apertura es la del gancho (o la escena de la mascota). En la mascota, la silueta
 * sale de MASCOT_BODIES y el modelo solo pone color, cara y accesorios.
 */
export function assembleScript(lines: ScriptLines, plan: UgcPlan | MascotPlan, format: VideoFormat, hookShot?: VideoOpeningShot | null): UgcScript {
  const mascot = format === "mascot";
  const who = mascot
    ? (() => {
        const c = (plan as MascotPlan).character;
        return { persona: `${MASCOT_BODIES[c.body].prompt}, a 3D animated character`, character: { look: `${c.color}; ${c.face}`, wardrobe: "none", setting: c.setting } };
      })()
    : { persona: (plan as UgcPlan).persona, character: (plan as UgcPlan).character };
  return {
    format_fit: lines.format_fit,
    ...who,
    opening: { hook_source: lines.hook_source, shot: mascot ? "mascot_scene" : (hookShot ?? "selfie_talk"), keyframe: plan.opening.keyframe, first_motion: plan.opening.first_motion },
    hook_why: lines.hook_why,
    keyframes: [characterKeyframe(format), ...plan.keyframes.filter((k) => k.key !== CHARACTER_KEY)],
    a_roll: lines.a_roll.map((l, i) => ({ key: `A${i + 1}`, keyframe: plan.a_roll[i]?.keyframe ?? "", seconds: l.seconds, line: l.line, delivery: l.delivery, acting: l.acting, motion: plan.a_roll[i]?.motion ?? "" })),
    b_roll: plan.b_roll.map((b, i) => ({ ...b, key: `B${i + 1}` })),
    text_beats: plan.text_beats,
    end_card: lines.end_card,
    compliance_notes: lines.compliance_notes,
  };
}

/** Las líneas como guion (sin tomas), para revisarlas antes del plan. */
export function linesAsScript(lines: ScriptLines): UgcScript {
  return {
    format_fit: lines.format_fit,
    persona: "",
    character: { look: "", wardrobe: "", setting: "" },
    hook_source: lines.hook_source,
    hook_why: lines.hook_why,
    keyframes: [],
    a_roll: lines.a_roll.map((l, i) => ({ ...l, key: `A${i + 1}`, keyframe: "", motion: "" })),
    b_roll: [],
    text_beats: [],
    end_card: lines.end_card,
    compliance_notes: lines.compliance_notes,
  };
}

/** Lo que el comerciante cambia de un guion: las líneas y cómo se dicen, y los textos en pantalla. */
export const scriptEditSchema = z.object({
  a_roll: z.array(z.object({ key: z.string(), line: z.string().trim().min(1).max(220), delivery: z.string().trim().max(300) })).min(1),
  text_beats: z.array(z.object({ text: z.string().trim().min(1).max(80) })),
  end_card: z.object({ title: z.string().trim().min(1).max(40), subtitle: z.string().trim().min(1).max(60), cta: z.string().trim().min(1).max(20) }),
});
export type ScriptEdit = z.infer<typeof scriptEditSchema>;

// ---------------------------------------------------------------- Reglas

/** Palabras de una línea, sin signos, en minúscula y sin tildes (para anclar B-roll y textos). */
export function words(line: string): string[] {
  return line
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);
}

export const wordKey = (w: string) => words(w)[0] ?? "";

/** Un monto hablado: dígitos o cifras en palabras. Seedance los pronuncia mal y el precio va en pantalla. */
const SPOKEN_AMOUNT = /\d|\b(mil|miles|millones?|pesos|d[oó]lares|reais|reales|soles|bol[ií]vares|quetzales|colones|guaran[ií]es)\b/i;

/** Una persona de IA que afirma su edad («tengo cuarenta y dos»): la presenta como alguien real. */
const OWN_AGE = /\btengo\s+(\d+|veinti\w*|treinta|cuarenta|cincuenta|sesenta|setenta)\b|\b(mis|a mis)\s+(\d+|treinta|cuarenta|cincuenta|sesenta)\b/i;

/** La primera frase de una línea (hasta el primer punto, cierre de pregunta o exclamación, o puntos suspensivos). */
export function firstSentence(line: string): string {
  return line.trim().split(/(?<=[.?!…])\s/)[0] ?? "";
}

/**
 * Lo que está mal en lo que se dice (el paso del guion): cuántas tomas y cuánto duran, las palabras por
 * segundo, montos, segunda persona, plazos, la edad de la persona de IA, palabras que la voz pronuncia
 * mal, el cierre y, al generar (`opening`), que A1 abra con el gancho elegido.
 */
export function lineProblems(s: UgcScript, pricing: PricingPlan, format: VideoFormat = "ugc", opening?: OpeningInput): string[] {
  const problems: string[] = [];
  const limits = FORMAT_LIMITS[format];
  if (s.a_roll.length < limits.aRollMin || s.a_roll.length > limits.aRollMax) problems.push(`Trae ${s.a_roll.length} tomas habladas; deben ser de ${limits.aRollMin} a ${limits.aRollMax}.`);
  const total = s.a_roll.reduce((n, a) => n + a.seconds, 0);
  if (total < limits.totalMin || total > limits.totalMax) problems.push(`Las tomas habladas suman ${total} s; deben sumar de ${limits.totalMin} a ${limits.totalMax}.`);
  s.a_roll.forEach((a, i) => {
    const at = `La toma ${a.key || i + 1}`;
    if (!Number.isInteger(a.seconds) || a.seconds < A_ROLL_SECONDS_MIN || a.seconds > A_ROLL_SECONDS_MAX) problems.push(`${at} dura ${a.seconds} s; debe durar de ${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX}.`);
    const n = words(a.line).length;
    if (n > a.seconds * WORDS_PER_SECOND_MAX) problems.push(`${at} tiene ${n} palabras para ${a.seconds} s (máximo ${Math.floor(a.seconds * WORDS_PER_SECOND_MAX)}): acórtala o dale más segundos.`);
    if (SPOKEN_AMOUNT.test(a.line)) problems.push(`${at} dice un número o un monto («${a.line}»): los precios van solo en pantalla y los números, en palabras.`);
    if (SECOND_PERSON_BODY.test(a.line))
      problems.push(
        format === "mascot"
          ? `${at} habla del cuerpo de quien mira en segunda persona («tu uña», «tus pies»): el personaje habla de sí mismo («a mí me salió…») o de «mi dueño».`
          : `${at} habla de la piel, la edad o el cuerpo de quien mira en segunda persona: usa primera persona o «las que…».`,
      );
    if (RESULT_TIMELINE.test(a.line)) problems.push(`${at} promete un plazo de resultado («${a.line}»): quítalo, Meta rechaza los plazos en salud y belleza.`);
    if (OWN_AGE.test(a.line)) problems.push(`${at} le pone una edad a la persona de IA («${a.line}»): nombra el segmento en plural («las que pasamos los cuarenta»).`);
    for (const m of MISPRONOUNCED) if (words(a.line).includes(m.word)) problems.push(`${at} usa «${m.word}», que la voz pronuncia mal: usa ${m.instead}.`);
    problems.push(...claimProblems(a.line, pricing, `${at}: `));
  });
  for (const t of [s.end_card.title, s.end_card.subtitle, s.end_card.cta, ...s.end_card.small_print]) problems.push(...claimProblems(t, pricing, "El cierre: "));
  if (opening) problems.push(...hookLineProblems(s, opening));
  return problems;
}

/**
 * Lo que está mal en las tomas (el plan): imágenes clave, la silueta de la mascota, de qué imagen parte
 * cada toma, el B-roll y los textos anclados a palabras dichas y, al generar (`opening`), la apertura y
 * el aspecto de teléfono del UGC.
 */
export function planProblems(s: UgcScript, pricing: PricingPlan, format: VideoFormat = "ugc", opening?: OpeningInput): string[] {
  const problems: string[] = [];
  const who = format === "mascot" ? "al personaje" : "a la persona";
  const kfKeys = s.keyframes.map((k) => k.key);
  const kf = new Map(s.keyframes.map((k) => [k.key, k]));

  // Imágenes clave.
  if (s.keyframes.length < 3 || s.keyframes.length > KEYFRAMES_MAX) problems.push(`Trae ${s.keyframes.length} imágenes clave; deben ser de 3 a ${KEYFRAMES_MAX}.`);
  if (new Set(kfKeys).size !== kfKeys.length) problems.push("Hay imágenes clave con la misma clave.");
  for (const k of kfKeys) if (!/^K\d$/.test(k)) problems.push(`«${k}» no es una clave de imagen clave (K1…K9).`);
  const character = kf.get(CHARACTER_KEY);
  if (!character) problems.push(`Falta ${CHARACTER_KEY}, el personaje.`);
  else if (!character.uses_character || character.uses_product) problems.push(`${CHARACTER_KEY} es el personaje solo: uses_character true y uses_product false.`);

  // La mascota: formas que se leen como algo sexual (la primera corrida real dio «a patch of facial skin with a small neck»).
  const risky = format === "mascot" ? riskyShape(`${s.persona}. ${s.character.look}`) : null;
  if (risky) problems.push(`La forma del personaje puede leerse como algo sexual («${risky}»): la silueta es la del cuerpo elegido; la cara y los accesorios no la cambian, y el color no es piel.`);

  s.a_roll.forEach((a, i) => {
    const at = `La toma ${a.key || i + 1}`;
    if (a.key !== `A${i + 1}`) problems.push(`${at} debe llamarse A${i + 1}.`);
    const k = kf.get(a.keyframe);
    if (!k) problems.push(`${at} parte de «${a.keyframe}», que no está en keyframes.`);
    else if (!k.uses_character) problems.push(`${at} es hablada: su imagen clave (${a.keyframe}) tiene que mostrar ${who}.`);
  });

  // B-roll y textos anclados a palabras dichas.
  const spoken = new Set(s.a_roll.flatMap((a) => words(a.line)));
  if (s.b_roll.length > B_ROLL_MAX) problems.push(`Trae ${s.b_roll.length} B-roll; el máximo es ${B_ROLL_MAX}.`);
  s.b_roll.forEach((b, i) => {
    const at = `El B-roll ${b.key || i + 1}`;
    if (b.key !== `B${i + 1}`) problems.push(`${at} debe llamarse B${i + 1}.`);
    if (!spoken.has(wordKey(b.anchor))) problems.push(`${at} se ancla a «${b.anchor}», que nadie dice: usa una palabra de una línea.`);
    if (b.cut_s < B_ROLL_CUT_MIN || b.cut_s > B_ROLL_CUT_MAX) problems.push(`${at} tapa ${b.cut_s} s; debe ser de ${B_ROLL_CUT_MIN} a ${B_ROLL_CUT_MAX}.`);
    if (b.keyframe === CHARACTER_KEY) problems.push(`${at} parte de ${CHARACTER_KEY}: los B-roll parten de su propia imagen clave.`);
    else if (!kf.has(b.keyframe)) problems.push(`${at} parte de ${b.keyframe}, que no está en keyframes.`);
  });
  s.text_beats.forEach((t, i) => {
    const at = `El texto en pantalla ${i + 1} («${t.text}»)`;
    if (!spoken.has(wordKey(t.anchor))) problems.push(`${at} se ancla a «${t.anchor}», que nadie dice.`);
    if (t.until && !spoken.has(wordKey(t.until))) problems.push(`${at} se quita en «${t.until}», que nadie dice.`);
    if (RESULT_TIMELINE.test(t.text)) problems.push(`${at} promete un plazo de resultado: quítalo.`);
    if (SECOND_PERSON_BODY.test(t.text)) problems.push(`${at} le habla a quien mira de su cuerpo, su edad o su salud: usa primera persona o «las que…».`);
    problems.push(...claimProblems(t.text, pricing, `${at}: `));
  });

  if (opening) {
    problems.push(...openingProblems(s, format));
    if (format === "ugc") problems.push(...phoneLookProblems(s));
  }

  // Cada imagen clave se usa (no se paga una imagen que no sale en el video).
  const used = new Set([CHARACTER_KEY, ...s.a_roll.map((a) => a.keyframe), ...s.b_roll.map((b) => b.keyframe)]);
  for (const k of kfKeys) if (!used.has(k)) problems.push(`La imagen clave ${k} no la usa ninguna toma: quítala.`);
  return problems;
}

/** Todo el guion: lo que se dice y las tomas. Lo que revisa una edición del comerciante. */
export function scriptProblems(s: UgcScript, pricing: PricingPlan, format: VideoFormat = "ugc", opening?: OpeningInput): string[] {
  return [...lineProblems(s, pricing, format, opening), ...planProblems(s, pricing, format, opening)];
}

/** Los ganchos que se le pasaron al guionista (`index` en el desarrollo) y la toma con que abre cada uno. */
export interface OpeningInput {
  /** `spoken`: el hablado del gancho (en la mascota, el de su versión): A1 abre con su primera frase. */
  hooks: { index: number; shot: VideoOpeningShot; spoken?: string }[];
}

/** Lo que se tiene que oír de una frase: sus palabras de 4 letras o más, sin cifras. */
const heard = (t: string) => new Set(words(t).filter((w) => w.length >= 4 && !/\d/.test(w)));
/** Parte de la primera frase del gancho que A1 tiene que decir (puede ajustar una palabra o quitar un monto). */
export const HOOK_SENTENCE_SHARE = 0.6;

/**
 * ¿A1 abre con la primera frase del gancho? En el amplificador de sonido (2026-10-03) A1 abrió con
 * «Todos se rieron.»: tres palabras de contexto antes de lo que detiene. Sin palabras que oír, no se pide.
 */
export function opensWithHook(a1Line: string, spoken: string): boolean {
  const need = heard(firstSentence(spoken));
  if (!need.size) return true;
  const said = heard(firstSentence(a1Line));
  return [...need].filter((w) => said.has(w)).length >= Math.ceil(need.size * HOOK_SENTENCE_SHARE);
}

/**
 * El gancho en lo que se dice (docs/spec-video-detener-scroll.md §3): `hook_source` de la lista, la
 * primera frase de A1 cabe en 3 s y es la del gancho (salvo la mascota, que lo dice a su manera), y sin
 * el pago contra entrega.
 */
function hookLineProblems(s: UgcScript, input: OpeningInput): string[] {
  const problems: string[] = [];
  const source = s.opening?.hook_source ?? s.hook_source ?? null;
  const offered = input.hooks.map((h) => h.index);
  const hook = source == null ? null : input.hooks.find((h) => h.index === source);
  if (source != null && !hook) problems.push(`hook_source es ${source}, que no está en GANCHOS DEL ÁNGULO${offered.length ? ` (${offered.join(", ")})` : ""}: usa uno de la lista o null.`);
  const a1 = s.a_roll[0];
  if (!a1) return problems;
  const opening = firstSentence(a1.line);
  const n = words(opening).length;
  if (n > SPOKEN_MAX_WORDS) problems.push(`La primera frase de A1 («${opening}») tiene ${n} palabras: el gancho cabe en 3 s, máximo ${SPOKEN_MAX_WORDS}.`);
  if (hook?.spoken && !opensWithHook(a1.line, hook.spoken))
    problems.push(`La primera frase de A1 («${opening}») no es la del gancho («${firstSentence(hook.spoken)}»): A1 abre con esa frase, adaptada a la voz, sin nada antes.`);
  if (COD_IN_HOOK.test(opening)) problems.push("El pago contra entrega y el envío gratis no van en el gancho: van en la oferta del final y en el cierre.");
  return problems;
}

/**
 * La apertura en las tomas (§3): la primera imagen es la toma del gancho, con movimiento desde el cuadro
 * 0, y el texto del gancho se lee sin sonido desde el primer segundo.
 */
function openingProblems(s: UgcScript, format: VideoFormat): string[] {
  const problems: string[] = [];
  const o = s.opening;
  const a1 = s.a_roll[0];
  if (!o) return ["Falta opening: la imagen del cuadro 0 y lo que se mueve en ella."];
  if (!o.first_motion.trim()) problems.push("Falta opening.first_motion: qué se mueve en el cuadro 0.");
  if (!a1) return problems;

  const k = s.keyframes.find((x) => x.key === o.keyframe);
  if (!k) problems.push(`opening.keyframe es ${o.keyframe}, que no está en keyframes.`);
  if (!opensWithInsert(o.shot)) {
    // Abre con la cara: A1 parte de la escena del gancho, no del retrato que fija la cara (en la mascota, K1 es el personaje SANO).
    if (o.keyframe === CHARACTER_KEY) problems.push(`La apertura no parte de ${CHARACTER_KEY} (el retrato que fija la cara): crea otra imagen clave con el gesto del gancho y úsala en A1.`);
    if (a1.keyframe !== o.keyframe) problems.push(`Abre con ${o.shot}: A1 parte de opening.keyframe (${o.keyframe}), no de ${a1.keyframe}.`);
    if (k && !k.uses_character) problems.push(`La imagen clave de la apertura (${o.keyframe}) tiene que mostrar ${format === "mascot" ? "al personaje" : "a la persona"}.`);
    if (k && o.shot === "mirror" && k.camera !== "mirror") problems.push(`Abre con mirror: ${o.keyframe} va con camera mirror.`);
    if (k && o.shot === "selfie_talk" && k.camera !== "selfie") problems.push(`Abre con selfie_talk: ${o.keyframe} va con camera selfie.`);
  } else {
    // Abre con un inserto: B1 tapa el comienzo de A1.
    const b1 = s.b_roll[0];
    const head = words(a1.line).slice(0, HOOK_BEAT_MAX_WORD);
    if (!b1) problems.push(`Abre con ${o.shot}: falta B1, el inserto del gancho.`);
    else {
      if (b1.keyframe !== o.keyframe) problems.push(`Abre con ${o.shot}: B1 parte de opening.keyframe (${o.keyframe}), no de ${b1.keyframe}.`);
      if (!head.includes(wordKey(b1.anchor))) problems.push(`B1 abre el video: se ancla a una de las primeras ${HOOK_BEAT_MAX_WORD} palabras de A1, no a «${b1.anchor}».`);
    }
    if (k && o.shot === "pov_hands" && k.camera !== "pov") problems.push(`Abre con pov_hands: ${o.keyframe} va con camera pov.`);
    if (k && o.shot === "product_in_place" && !k.uses_product) problems.push(`Abre con product_in_place: ${o.keyframe} muestra el producto (uses_product true).`);
  }

  const first = s.text_beats[0];
  if (!first) problems.push("Falta el primer texto en pantalla: el del gancho.");
  else {
    const head = words(a1.line).slice(0, HOOK_BEAT_MAX_WORD);
    if (!head.includes(wordKey(first.anchor))) problems.push(`El primer texto en pantalla («${first.text}») se ancla a «${first.anchor}»: tiene que aparecer en una de las primeras ${HOOK_BEAT_MAX_WORD} palabras de A1 para leerse sin sonido desde el primer segundo.`);
    if (wordCount(first.text) > ON_SCREEN_MAX_WORDS) problems.push(`El primer texto en pantalla («${first.text}») tiene ${wordCount(first.text)} palabras; el del gancho va hasta ${ON_SCREEN_MAX_WORDS}.`);
    if (COD_IN_HOOK.test(first.text)) problems.push("El pago contra entrega y el envío gratis no van en el texto del gancho: van en la oferta del final y en el cierre.");
  }
  return problems;
}

/**
 * Que el UGC parezca grabado con un teléfono (§4.3): cada imagen clave declara su cámara, el B-roll no
 * es una selfie y lo que escribe el modelo no habla como una foto de estudio. Solo al generar.
 */
function phoneLookProblems(s: UgcScript): string[] {
  const problems: string[] = [];
  const bKeys = new Set(s.b_roll.map((b) => b.keyframe));
  for (const k of s.keyframes) {
    if (!k.camera || k.camera === "animated") problems.push(`La imagen clave ${k.key} no dice su cámara: selfie, pov, propped o mirror.`);
    else if (bKeys.has(k.key) && k.uses_character && k.camera === "selfie") problems.push(`La imagen clave ${k.key} es de un B-roll: va en pov (la otra mano, mirando hacia abajo) o propped, no en selfie.`);
    const w = studioWord(k.prompt);
    if (w) problems.push(`La imagen clave ${k.key} habla como una foto de estudio («${w}»): descríbela como una foto de teléfono en una casa.`);
  }
  for (const [what, t] of [["character.setting", s.character.setting], ["character.look", s.character.look]] as const) {
    const w = studioWord(t);
    if (w) problems.push(`${what} habla como una foto de estudio («${w}»): un lugar y una persona comunes, con la luz de la casa.`);
  }
  for (const x of [...s.a_roll, ...s.b_roll]) {
    const w = studioWord(x.motion);
    if (w) problems.push(`El movimiento de ${x.key} habla como un comercial («${w}»): cámara en mano de teléfono.`);
  }
  return problems;
}

/** Aplica lo que editó el comerciante (por clave y por posición) sin tocar la dirección. */
export function applyScriptEdit(s: UgcScript, edit: ScriptEdit): UgcScript {
  const byKey = new Map(edit.a_roll.map((a) => [a.key, a]));
  return {
    ...s,
    a_roll: s.a_roll.map((a) => {
      const e = byKey.get(a.key);
      return e ? { ...a, line: e.line, delivery: e.delivery || a.delivery } : a;
    }),
    text_beats: s.text_beats.map((t, i) => (edit.text_beats[i] ? { ...t, text: edit.text_beats[i].text } : t)),
    end_card: { ...s.end_card, ...edit.end_card },
  };
}

/** Las tomas habladas cuya línea o entrega cambió (hay que volver a generarlas). */
export function changedLines(before: UgcScript, after: UgcScript): string[] {
  return after.a_roll.filter((a) => {
    const b = before.a_roll.find((x) => x.key === a.key);
    return !b || b.line !== a.line || b.delivery !== a.delivery;
  }).map((a) => a.key);
}

// ---------------------------------------------------------------- QA de imágenes clave

export const keyframeQaSchema = z.object({
  hands_ok: z.boolean().describe("false si hay una mano de más, una mano deforme o dedos que no son cinco."),
  product_ok: z.boolean().nullable().describe("Solo si se pidió el producto: true si es igual a la foto real (forma, colores, etiqueta legible). null si no aplica."),
  same_person: z.boolean().nullable().describe("Solo si hay referencia del personaje: true si es la misma persona (cara, pelo). null si no aplica."),
  no_text: z.boolean().describe("false si hay textos, subtítulos o marcas de agua que no son la etiqueta real del producto."),
  brand_safe: z.boolean().describe("false si una forma o una pose puede leerse como genitales o algo sexual o sugerente (Meta lo rechaza por contenido adulto). Ante la duda, false."),
  matches_hook: z.boolean().nullable().describe("Solo en la imagen de la apertura: true si muestra lo que pide la primera toma del gancho, con la acción ya en marcha. null si no es la apertura."),
  phone_look: z.boolean().nullable().describe("Solo en el video con persona: true si parece una foto de teléfono en una casa; false si parece de estudio, de campaña o de banco de imágenes. null en la mascota."),
  issues: z.array(z.string()).describe("Cada problema en una frase para el comerciante, en español. [] si ninguno."),
});
export type KeyframeQaOutput = z.infer<typeof keyframeQaSchema>;
export interface KeyframeQa {
  pass: boolean;
  /** Si no pasa, por qué. Si pasa, los avisos que no bloquean (`phone_look`). */
  issues: string[];
}

export function keyframeQaVerdict(out: KeyframeQaOutput): KeyframeQa {
  const issues = out.issues.map((i) => i.trim()).filter(Boolean);
  const add = (ok: boolean | null, msg: string) => ok === false && !issues.length && issues.push(msg);
  add(out.hands_ok, "Revisa las manos: hay una de más o está deforme.");
  add(out.product_ok, "El producto no se ve igual a tu foto.");
  add(out.same_person, "La persona no es la misma del personaje.");
  add(out.no_text, "Tiene textos que no pedimos.");
  add(out.matches_hook ?? null, "No muestra la primera toma del gancho: pide otra.");
  // Lo más grave va primero y siempre, aunque el modelo haya anotado otros problemas.
  if (!out.brand_safe) issues.unshift("Su forma puede leerse como algo sexual y Meta rechazaría el anuncio: pide otra o escribe otro guion.");
  const pass = out.hands_ok && out.product_ok !== false && out.same_person !== false && out.no_text && out.brand_safe && out.matches_hook !== false;
  // phone_look no bloquea (spec-video-detener-scroll §4.5): si pasa lo demás, queda como aviso.
  if (pass) return { pass, issues: out.phone_look === false ? ["Parece foto de estudio: si no te convence, pide otra."] : [] };
  return { pass, issues };
}
