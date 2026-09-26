// Los pedidos a Higgsfield de cada toma (docs/spec-video-ugc.md §4). El prompt lo arma el código, no
// el modelo: la dirección de voz, la regla de la etiqueta y la de las manos van siempre igual (son lo
// que aprendió la POC). Puro.

import {
  A_ROLL_ENDPOINT,
  A_ROLL_RESOLUTION,
  B_ROLL_ENDPOINT,
  B_ROLL_SECONDS,
  KEYFRAME_ENDPOINT,
  type VideoFormat,
} from "./catalog";
import type { UgcARoll, UgcBRoll, UgcKeyframe, UgcScript } from "./schemas";

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
const PHOTO = "Vertical 9:16 realistic smartphone UGC photo, unpolished, natural light, like a frame from a TikTok video. No text, no captions, no subtitles, no logos, no watermark.";

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
export function keyframeRequest(k: UgcKeyframe, script: Pick<UgcScript, "persona" | "character">, characterKey: string, format: VideoFormat = "ugc"): ShotRequest {
  const refs = keyframeRefs(k, characterKey);
  const who = k.key === characterKey || (k.uses_character && !refs.includes("character")) ? whoPhrase(script, format) : "";
  const prompt = [
    format === "mascot" ? ANIMATED : PHOTO,
    refPhrase(refs, format),
    who,
    `Setting: ${script.character.setting}.`,
    k.prompt,
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

/** La toma hablada (Seedance 2.0, con audio): la persona dice la línea exacta con los labios sincronizados. */
export function aRollRequest(a: UgcARoll, language: string, productInFrame: boolean, format: VideoFormat = "ugc"): ShotRequest {
  const mascot = format === "mascot";
  const prompt = [
    mascot ? "3D animated movie shot, Pixar-style." : "Handheld vertical smartphone selfie video.",
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

/** El B-roll (Kling 2.5 Turbo, 5 s, sin audio): una acción corta que tapa la toma hablada. */
export function bRollRequest(b: UgcBRoll, productInFrame: boolean, format: VideoFormat = "ugc"): ShotRequest {
  const mascot = format === "mascot";
  const prompt = [mascot ? "3D animated movie shot, Pixar-style." : "", b.motion, productInFrame ? "The product label stays unchanged and legible." : "", mascot ? "" : "Realistic handheld smartphone footage."]
    .filter(Boolean)
    .join(" ");
  return { endpoint: B_ROLL_ENDPOINT, input: { prompt, duration: B_ROLL_SECONDS, negative_prompt: mascot ? `${B_ROLL_NEGATIVE}, extra arms` : B_ROLL_NEGATIVE } };
}
