// Salida estructurada del guionista UGC y sus reglas (docs/spec-video-ugc.md §3). Claves en inglés;
// lo que dice la persona y lo que se lee en pantalla, en el idioma del mercado; lo que va a los
// modelos de imagen y video, en inglés. Puro.

import * as z from "zod/v4";
import { claimProblems } from "@/lib/creatives/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import {
  A_ROLL_MAX,
  A_ROLL_MIN,
  A_ROLL_SECONDS_MAX,
  FORMAT_LIMITS,
  A_ROLL_SECONDS_MIN,
  B_ROLL_CUT_MAX,
  B_ROLL_CUT_MIN,
  B_ROLL_MAX,
  CHARACTER_KEY,
  KEYFRAMES_MAX,
  MISPRONOUNCED,
  TOTAL_SECONDS_MAX,
  TOTAL_SECONDS_MIN,
  WORDS_PER_SECOND_MAX,
  WORDS_PER_SECOND_PROMPT,
  type VideoFormat,
} from "./catalog";

/** Bump cuando cambie el prompt o el esquema del guionista. 3: palabras por segundo con margen (WORDS_PER_SECOND_PROMPT). */
export const UGC_PROMPT_VERSION = 3;
/** Bump cuando cambie el prompt del guionista de mascota (lib/video/prompts.ts › mascotSystem). 2: palabras por segundo con margen. */
export const MASCOT_PROMPT_VERSION = 2;
/** Bump cuando cambie el prompt o el esquema del QA de imágenes clave. */
export const KEYFRAME_QA_PROMPT_VERSION = 1;

const keyframe = z.object({
  key: z.string().describe(`«K1» a «K${KEYFRAMES_MAX}». ${CHARACTER_KEY} es SIEMPRE el personaje solo, sin el producto.`),
  uses_character: z.boolean().describe("true si aparece la persona o el personaje (cara, manos o cuerpo): se genera con K1 de referencia."),
  uses_product: z.boolean().describe("true si aparece el producto: se genera con la foto real de referencia."),
  one_hand: z.boolean().describe("true si la escena necesita una sola mano visible (sostener el frasco, señalar): evita manos de más."),
  prompt: z
    .string()
    .describe(
      "En inglés, 40 a 90 palabras: la escena (lugar, luz, encuadre, qué hace la persona o el personaje, qué se ve del producto). UGC: una foto vertical tomada con un teléfono, nombra a «the person». Mascota: un cuadro de película animada 3D, nombra a «the character» y su estado (sano, con el problema, sanando). Nombra «the product» sin describirlo (sale de la foto real). Sin textos ni subtítulos en la imagen.",
    ),
});

const aRoll = z.object({
  key: z.string().describe("«A1», «A2»… en orden."),
  keyframe: z.string().describe("La imagen clave de la que parte la toma (K1… de keyframes): la persona o el personaje mirando a cámara."),
  seconds: z.number().int().describe(`${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX}. Cuenta las palabras: máximo ${String(WORDS_PER_SECOND_PROMPT).replace(".", ",")} por segundo.`),
  line: z.string().describe("Lo que dice, exactamente, en el idioma del mercado. Números en palabras. NUNCA un precio ni un monto."),
  delivery: z.string().describe("En inglés: cómo lo dice (qué palabra remarca, qué tono en cada frase)."),
  acting: z.string().describe("En inglés: gestos y expresión (sonrisa, cejas, manos) mientras habla."),
  motion: z.string().describe("En inglés: cámara y movimiento («handheld selfie, slight natural shake, she leans toward the lens»)."),
});

const bRoll = z.object({
  key: z.string().describe("«B1», «B2»… en orden de aparición."),
  keyframe: z.string().describe("La imagen clave de la que parte el clip (K2…; nunca K1)."),
  anchor: z.string().describe("UNA palabra de alguna línea de a_roll, escrita igual: el B-roll entra justo cuando se dice."),
  cut_s: z.number().describe(`Segundos que tapa la toma hablada: ${B_ROLL_CUT_MIN} a ${B_ROLL_CUT_MAX}.`),
  motion: z.string().describe("En inglés: qué se mueve en el clip (acción concreta y corta, cámara)."),
});

const textBeat = z.object({
  anchor: z.string().describe("UNA palabra de alguna línea de a_roll, escrita igual: el texto aparece cuando se dice."),
  until: z.string().nullable().describe("Palabra de una línea donde se quita, o null (hasta el siguiente texto)."),
  text: z.string().describe("El texto grande en pantalla, en el idioma del mercado. Corto: 2 a 6 palabras (el de la oferta puede ir en 2 líneas)."),
});

export const ugcScriptSchema = z.object({
  format_fit: z.object({
    recommended: z
      .enum(["ugc_ai", "mascot", "static", "real_video"])
      .describe("ugc_ai: sirve para video con persona de IA. mascot: rinde más con un personaje animado (un problema físico visible que se puede personificar). static: el ángulo rinde más como imagen. real_video: necesita una persona real (testimonio, experta)."),
    why: z.string().describe("Para el comerciante, una frase."),
  }),
  persona: z.string().describe("En inglés: quién habla. UGC: edad aparente, género y estilo según el cliente ideal (siempre una dramatización). Mascota: qué es el personaje animado («a cute 3D animated big-toe character»)."),
  character: z.object({
    look: z.string().describe("En inglés: rostro, pelo y rasgos de la persona. Mascota: cómo es el personaje sano (forma, piel, ojos, cejas, brazos), sin piernas si es una parte del cuerpo."),
    wardrobe: z.string().describe("En inglés: ropa. Mascota: «none» (los accesorios de una escena van en su imagen clave)."),
    setting: z.string().describe("En inglés: el lugar principal y la luz."),
  }),
  hook_why: z.string().describe("Para el comerciante, una frase: por qué el gancho detiene el scroll de su cliente."),
  keyframes: z.array(keyframe).describe(`De 3 a ${KEYFRAMES_MAX}. K1 = el personaje solo; una por cada escena distinta de a_roll y b_roll.`),
  a_roll: z
    .array(aRoll)
    .describe(
      `UGC: ${A_ROLL_MIN} a ${A_ROLL_MAX} tomas habladas, en total ${TOTAL_SECONDS_MIN} a ${TOTAL_SECONDS_MAX} s. Mascota: ${FORMAT_LIMITS.mascot.aRollMin} a ${FORMAT_LIMITS.mascot.aRollMax}, en total ${FORMAT_LIMITS.mascot.totalMin} a ${FORMAT_LIMITS.mascot.totalMax} s.`,
    ),
  b_roll: z.array(bRoll).describe(`Hasta ${B_ROLL_MAX} insertos cortos sobre la voz; al menos uno por toma hablada.`),
  text_beats: z.array(textBeat).describe("Los textos grandes en pantalla, en orden: el gancho, cada idea numerada y la oferta al final."),
  end_card: z.object({
    title: z.string().describe("El nombre del producto."),
    subtitle: z.string().describe("Una línea: la razón para comprar hoy (p. ej., «Pagas al recibir»)."),
    cta: z.string().describe("El botón: «Comprar»."),
    small_print: z.array(z.string()).describe("Letra chica obligatoria (tipo de piel, prueba en una zona pequeña, etc.)."),
  }),
  compliance_notes: z.array(z.string()).describe("Para el comerciante: qué cuidar al montar y publicar."),
});

export type UgcScript = z.infer<typeof ugcScriptSchema>;
export type UgcKeyframe = UgcScript["keyframes"][number];
export type UgcARoll = UgcScript["a_roll"][number];
export type UgcBRoll = UgcScript["b_roll"][number];

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

/** Condición del lector en segunda persona (política de atributos personales de Meta). */
const SECOND_PERSON =
  /\b(tu|tus) (piel|cara|rostro|edad|cuerpo|arrugas|manchas|l[ií]neas|cuello|papada|acn[eé]|flacidez|u[ñn]as?|pies?|dedos?|dientes?|enc[ií]as|rodillas?|articulaciones|espalda|pelo|cabello|calvicie|barriga|panza|grasa|hongos?)\b|\ba tu edad\b|\btienes (arrugas|manchas|acn[eé]|hongos?|dolor)/i;

/** Un plazo de resultado («al día tres», «en dos semanas»): promesa de salud que Meta rechaza. */
const RESULT_TIMELINE = /\b(al|en|a los|en solo)\s+(\d+|un|una|dos|tres|cuatro|cinco|siete|diez|catorce|quince|treinta)\s+(d[ií]as?|semanas?|mes(es)?)\b|\bal d[ií]a\s+(\d+|uno|dos|tres|cuatro|cinco|siete)\b|\ben la semana\s+(\d+|uno|dos|tres)\b/i;

/** Qué está mal en un guion (del modelo o editado). Vacío si se puede guardar. */
export function scriptProblems(s: UgcScript, pricing: PricingPlan, format: VideoFormat = "ugc"): string[] {
  const problems: string[] = [];
  const limits = FORMAT_LIMITS[format];
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

  // Tomas habladas.
  if (s.a_roll.length < limits.aRollMin || s.a_roll.length > limits.aRollMax) problems.push(`Trae ${s.a_roll.length} tomas habladas; deben ser de ${limits.aRollMin} a ${limits.aRollMax}.`);
  const total = s.a_roll.reduce((n, a) => n + a.seconds, 0);
  if (total < limits.totalMin || total > limits.totalMax) problems.push(`Las tomas habladas suman ${total} s; deben sumar de ${limits.totalMin} a ${limits.totalMax}.`);
  s.a_roll.forEach((a, i) => {
    const at = `La toma ${a.key || i + 1}`;
    if (a.key !== `A${i + 1}`) problems.push(`${at} debe llamarse A${i + 1}.`);
    if (!Number.isInteger(a.seconds) || a.seconds < A_ROLL_SECONDS_MIN || a.seconds > A_ROLL_SECONDS_MAX) problems.push(`${at} dura ${a.seconds} s; debe durar de ${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX}.`);
    const n = words(a.line).length;
    if (n > a.seconds * WORDS_PER_SECOND_MAX) problems.push(`${at} tiene ${n} palabras para ${a.seconds} s (máximo ${Math.floor(a.seconds * WORDS_PER_SECOND_MAX)}): acórtala o dale más segundos.`);
    if (SPOKEN_AMOUNT.test(a.line)) problems.push(`${at} dice un número o un monto («${a.line}»): los precios van solo en pantalla y los números, en palabras.`);
    if (SECOND_PERSON.test(a.line))
      problems.push(
        format === "mascot"
          ? `${at} habla del cuerpo de quien mira en segunda persona («tu uña», «tus pies»): el personaje habla de sí mismo («a mí me salió…») o de «mi dueño».`
          : `${at} habla de la piel, la edad o el cuerpo de quien mira en segunda persona: usa primera persona o «las que…».`,
      );
    if (RESULT_TIMELINE.test(a.line)) problems.push(`${at} promete un plazo de resultado («${a.line}»): quítalo, Meta rechaza los plazos en salud y belleza.`);
    if (OWN_AGE.test(a.line)) problems.push(`${at} le pone una edad a la persona de IA («${a.line}»): nombra el segmento en plural («las que pasamos los cuarenta»).`);
    for (const m of MISPRONOUNCED) if (words(a.line).includes(m.word)) problems.push(`${at} usa «${m.word}», que la voz pronuncia mal: usa ${m.instead}.`);
    problems.push(...claimProblems(a.line, pricing, `${at}: `));
    const k = kf.get(a.keyframe);
    if (!k) problems.push(`${at} parte de ${a.keyframe}, que no está en keyframes.`);
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
    problems.push(...claimProblems(t.text, pricing, `${at}: `));
  });
  for (const t of [s.end_card.title, s.end_card.subtitle, s.end_card.cta, ...s.end_card.small_print]) problems.push(...claimProblems(t, pricing, "El cierre: "));

  // Cada imagen clave se usa (no se paga una imagen que no sale en el video).
  const used = new Set([CHARACTER_KEY, ...s.a_roll.map((a) => a.keyframe), ...s.b_roll.map((b) => b.keyframe)]);
  for (const k of kfKeys) if (!used.has(k)) problems.push(`La imagen clave ${k} no la usa ninguna toma: quítala.`);
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
  issues: z.array(z.string()).describe("Cada problema en una frase para el comerciante, en español. [] si ninguno."),
});
export type KeyframeQaOutput = z.infer<typeof keyframeQaSchema>;
export interface KeyframeQa {
  pass: boolean;
  issues: string[];
}

export function keyframeQaVerdict(out: KeyframeQaOutput): KeyframeQa {
  const issues = out.issues.map((i) => i.trim()).filter(Boolean);
  const add = (ok: boolean | null, msg: string) => ok === false && !issues.length && issues.push(msg);
  add(out.hands_ok, "Revisa las manos: hay una de más o está deforme.");
  add(out.product_ok, "El producto no se ve igual a tu foto.");
  add(out.same_person, "La persona no es la misma del personaje.");
  add(out.no_text, "Tiene textos que no pedimos.");
  const pass = out.hands_ok && out.product_ok !== false && out.same_person !== false && out.no_text;
  return { pass, issues: pass ? [] : issues };
}
