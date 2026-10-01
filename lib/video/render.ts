// Los pedidos a Higgsfield de cada toma (docs/spec-video-ugc.md §4). El prompt lo arma el código, no
// el modelo: la dirección de voz, la regla de la etiqueta y la de las manos van siempre igual (son lo
// que aprendió la POC), y el aspecto de teléfono del UGC y el primer cuadro de la apertura también
// (docs/spec-video-detener-scroll.md). Todo en positivo: el modelo dibuja lo que se nombra. Puro.

import {
  A_ROLL_ENDPOINT,
  A_ROLL_RESOLUTION,
  B_ROLL_ENDPOINT,
  B_ROLL_SECONDS,
  KEYFRAME_ENDPOINT,
  opensWithInsert,
  type PhoneCamera,
  type VideoFormat,
} from "./catalog";
import type { ScriptOpening, UgcARoll, UgcBRoll, UgcKeyframe, UgcScript } from "./schemas";

export interface ShotRequest {
  endpoint: string;
  input: Record<string, unknown>;
}

/**
 * La voz que funcionó en la POC (variante E). «Rápida y enérgica» salió golpeada; «cálida y suave»,
 * plana. Esta va igual en toda toma hablada; lo propio de cada línea va en `delivery`.
 */
export function voiceBlock(language: string, format: VideoFormat = "ugc"): string {
  const accent = language.startsWith("pt") ? "Brazilian Portuguese" : "neutral Latin American Spanish (no regional accent or slang)";
  if (format === "mascot") {
    // La voz de la POC KeraPass: igual en las cuatro tomas aunque el personaje cambiara de aspecto.
    return [
      `Voice: a cute, expressive animated-movie character voice, young female, slightly high-pitched and playful, comedic timing, in ${accent}.`,
      "Natural speed, not rushed, not shouting.",
      "No music, only soft ambient sound.",
    ].join(" ");
  }
  return [
    `Voice: upbeat, warm and genuinely enthusiastic, in ${accent}.`,
    "Smiling while talking; lively, melodic intonation that rises and falls, clear emphasis on key words, the energy of sharing an exciting discovery with a best friend.",
    "Natural conversational speed: not rushed, not shouting, never monotone or bored.",
    "No music, only soft natural room sound.",
  ].join(" ");
}

const PRODUCT_RULE =
  "The product is kept exactly as in the product reference image (same shape, colors, cap, label and printed text, fully legible). Do not print any word, logo or label on the product that is not on it in the reference image.";
const ONE_HAND = "Only one hand is visible in the whole image, anatomically correct with five fingers.";
const HANDS = "Every visible hand is anatomically correct with five fingers; no extra hands.";
/** El UGC parece una foto de teléfono en una casa, no de estudio (spec-video-detener-scroll §4.1). */
const HOME_PHONE =
  "Vertical 9:16 photo taken with a phone at home, the way people post on TikTok: everything in focus, mixed home lighting (a warm ceiling bulb and daylight from a window that is a little blown out), a little grain in the shadows, colors straight out of the phone camera. A lived-in place with everyday things in view (a towel, bottles, a charger cable, something out of place). No text, no captions, no subtitles, no logos, no watermark.";
/** Cómo se grabó cada imagen clave. La selfie deja aire sobre la cabeza: ahí van los textos del montaje. */
export const CAMERA_BLOCKS: Record<PhoneCamera, string> = {
  selfie: "Taken with the front camera at arm's length: slightly wide-angle with a little distortion at the edges, at eye level or slightly above; the face sits in the middle third of the frame with the room visible above the head.",
  pov: "Taken with the rear camera held in one hand, looking down at what the other hand is doing.",
  propped: "Taken with the phone propped on a counter or a shelf, a little low and slightly tilted, showing more of the room.",
  mirror: "A mirror selfie: the phone is visible in the hand and the mirror has small smudges.",
};
/** La persona: alguien común. En belleza, sin nombrar lo que el producto promete arreglar (sería el «antes»). */
const ORDINARY_PERSON = "The person looks like an ordinary person, not a model: natural skin texture with visible pores and a slightly uneven tone, hair as it is at home, home clothes.";
const ORDINARY_PERSON_APPEARANCE = "The person looks like an ordinary person, not a model: natural skin texture, hair as it is at home, home clothes.";
/** El cuadro 0 de la apertura: la acción ya empezó (los clips parten de esta imagen). */
const firstFrame = (motion: string) => `This is the very first frame of the video: the action is already happening (${motion.trim().replace(/\.$/, "")}).`;
/** Seedance suaviza la cámara: se pide el pulso de una mano que sostiene el teléfono. */
const PHONE_TALK = "Handheld vertical phone video recorded by the person: small natural hand shake, tiny reframings, the phone's auto-exposure adjusting as they move.";
const PHONE_BROLL: Record<PhoneCamera, string> = {
  selfie: "Handheld phone footage from the front camera, small natural hand shake.",
  pov: "Handheld phone footage from the rear camera looking down at the hands, small natural hand shake.",
  propped: "Footage from a phone propped on a counter, almost static, with small everyday movement in the room.",
  mirror: "Handheld phone footage in a mirror, small natural hand shake.",
};

/** Lo que sabe el render del producto: en belleza y cuidado personal, la persona no muestra el problema. */
export interface RenderContext {
  appearance?: boolean;
}

/** La categoría de la ficha es texto libre: ¿es de apariencia (belleza, piel, cabello, cuidado personal)? */
export function isAppearanceCategory(category: string | null | undefined): boolean {
  return /belleza|piel|cabello|pelo|cuidado personal|cosm[eé]tic|maquillaje|skincare|beauty|facial|antiarrugas|anti-?edad|col[aá]geno/i.test(category ?? "");
}

const isOpening = (opening: ScriptOpening | undefined, key: string) => Boolean(opening && opening.keyframe === key);

// Mascota (POC KeraPass): un cuadro de película animada. El frasco sin cara (la etiqueta se deforma) y
// los brazos de caricatura contados (sin brazos de más).
const ANIMATED = "Vertical 9:16 still frame from a 3D animated movie, Pixar-style render, soft cinematic lighting, shallow depth of field. No text, no captions, no subtitles, no logos, no watermark.";
const PLAIN_PRODUCT = "The product is a plain product: no face, no eyes, no arms.";
const CARTOON_ARMS = "Only the character's own two small cartoon arms, no extra arms or hands.";
/** La silueta del personaje: redonda y entera en el cuadro (una forma alargada con cuello se lee como algo sexual). */
const MASCOT_SHAPE = "Family-friendly character design: a round, chubby, instantly readable silhouette about as wide as it is tall, fully inside the frame, with no elongated or cylindrical body and no narrow neck under its head.";

/** Qué imágenes de referencia lleva una imagen clave, en orden: el personaje primero y el producto después. */
export function keyframeRefs(k: Pick<UgcKeyframe, "key" | "uses_character" | "uses_product">, characterKey: string): ("character" | "product")[] {
  const refs: ("character" | "product")[] = [];
  if (k.uses_character && k.key !== characterKey) refs.push("character");
  if (k.uses_product) refs.push("product");
  return refs;
}

function refPhrase(refs: ("character" | "product")[], format: VideoFormat): string {
  const ord = (i: number) => (refs.length === 1 ? "the reference image" : i === 0 ? "the first reference image" : "the second reference image");
  const same = (i: number) =>
    format === "mascot"
      ? `The character is the same animated character as in ${ord(i)} (same face, eyes, eyebrows, same cartoon arms, same body shape); only its condition changes if the scene says so.`
      : `The person is the same person as in ${ord(i)} (same face, same hair).`;
  return refs.map((r, i) => (r === "character" ? same(i) : `The product is the one in ${ord(i)}.`)).join(" ");
}

function whoPhrase(script: Pick<UgcScript, "persona" | "character">, format: VideoFormat): string {
  if (format === "mascot") return `The character: ${script.persona}; ${script.character.look}.`;
  return `The person: ${script.persona}; ${script.character.look}; wearing ${script.character.wardrobe}.`;
}

function handsRule(k: UgcKeyframe, format: VideoFormat): string {
  if (format === "mascot") return k.uses_character ? `${MASCOT_SHAPE} ${CARTOON_ARMS}` : "";
  return k.one_hand ? ONE_HAND : k.uses_character ? HANDS : "";
}

/** La imagen clave (Flare, 9:16, sin reescribir el prompt). K1 va sin referencias: define la cara. */
export function keyframeRequest(
  k: UgcKeyframe,
  script: Pick<UgcScript, "persona" | "character" | "opening">,
  characterKey: string,
  format: VideoFormat = "ugc",
  ctx: RenderContext = {},
): ShotRequest {
  const refs = keyframeRefs(k, characterKey);
  const who = k.key === characterKey || (k.uses_character && !refs.includes("character")) ? whoPhrase(script, format) : "";
  const mascot = format === "mascot";
  const camera = !mascot && k.camera && k.camera !== "animated" ? CAMERA_BLOCKS[k.camera] : "";
  const person = !mascot && k.uses_character ? (ctx.appearance ? ORDINARY_PERSON_APPEARANCE : ORDINARY_PERSON) : "";
  const prompt = [
    mascot ? ANIMATED : HOME_PHONE,
    camera,
    refPhrase(refs, format),
    who,
    person,
    `Setting: ${script.character.setting}.`,
    k.prompt,
    isOpening(script.opening, k.key) ? firstFrame(script.opening!.first_motion) : "",
    k.uses_product ? PRODUCT_RULE : "",
    k.uses_product && format === "mascot" ? PLAIN_PRODUCT : "",
    handsRule(k, format),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    endpoint: KEYFRAME_ENDPOINT,
    input: { prompt, resolution: "1k", quality: "low", aspect_ratio: "9:16", moderation: "auto", enhance_prompt: false },
  };
}

/**
 * La toma hablada (Seedance 2.0, con audio): la persona dice la línea exacta con los labios sincronizados.
 * Si A1 abre el video con la cara, la acción ya está en marcha desde el primer cuadro.
 */
export function aRollRequest(a: UgcARoll, language: string, productInFrame: boolean, format: VideoFormat = "ugc", opening?: ScriptOpening): ShotRequest {
  const mascot = format === "mascot";
  const opens = a.key === "A1" && opening && !opensWithInsert(opening.shot) && opening.keyframe === a.keyframe;
  const prompt = [
    mascot ? "3D animated movie shot, Pixar-style." : PHONE_TALK,
    opens ? `The action is already happening from the very first frame: ${opening!.first_motion.trim()}` : "",
    a.motion,
    a.acting,
    `${mascot ? "The animated character" : "The person"} speaks with accurate lip-sync, saying exactly: «${a.line}»`,
    a.delivery,
    productInFrame ? `The product and its printed label stay exactly the same and legible${mascot ? "; the product has no face" : ""}.` : "",
    mascot ? `${CARTOON_ARMS} No text, no captions.` : "Hands anatomically correct, no extra hands.",
    voiceBlock(language, format),
  ]
    .filter(Boolean)
    .join(" ");
  return { endpoint: A_ROLL_ENDPOINT, input: { prompt, duration: a.seconds, resolution: A_ROLL_RESOLUTION, generate_audio: true } };
}

export const B_ROLL_NEGATIVE = "text, captions, subtitles, watermark, logo changes, distorted label, extra fingers, extra hands";
/** Lo cinematográfico delata a la IA en el UGC. En un campo negativo sí sirve nombrarlo. */
export const B_ROLL_NEGATIVE_UGC = `${B_ROLL_NEGATIVE}, cinematic, bokeh, shallow depth of field, slow motion, studio lighting, color grading, film look`;

/**
 * El B-roll (Kling 2.5 Turbo, 5 s, sin audio): una acción corta que tapa la toma hablada. `camera` es la
 * de su imagen clave; si abre el video, la acción ya está en marcha.
 */
export function bRollRequest(b: UgcBRoll, productInFrame: boolean, format: VideoFormat = "ugc", camera?: UgcKeyframe["camera"], opening?: ScriptOpening): ShotRequest {
  const mascot = format === "mascot";
  const opens = Boolean(opening && opensWithInsert(opening.shot) && opening.keyframe === b.keyframe && b.key === "B1");
  const phone = mascot ? "" : PHONE_BROLL[camera && camera !== "animated" ? camera : "pov"];
  const prompt = [
    mascot ? "3D animated movie shot, Pixar-style." : "",
    opens ? `The action is already happening from the very first frame: ${opening!.first_motion.trim()}` : "",
    b.motion,
    productInFrame ? "The product label stays unchanged and legible." : "",
    phone,
  ]
    .filter(Boolean)
    .join(" ");
  return { endpoint: B_ROLL_ENDPOINT, input: { prompt, duration: B_ROLL_SECONDS, negative_prompt: mascot ? `${B_ROLL_NEGATIVE}, extra arms` : B_ROLL_NEGATIVE_UGC } };
}

