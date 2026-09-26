// Los pedidos a Higgsfield de cada toma (docs/spec-video-ugc.md §4). El prompt lo arma el código, no
// el modelo: la dirección de voz, la regla de la etiqueta y la de las manos van siempre igual (son lo
// que aprendió la POC). Puro.

import {
  A_ROLL_ENDPOINT,
  A_ROLL_RESOLUTION,
  B_ROLL_ENDPOINT,
  B_ROLL_SECONDS,
  KEYFRAME_ENDPOINT,
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
export function voiceBlock(language: string): string {
  const accent = language.startsWith("pt") ? "Brazilian Portuguese" : "neutral Latin American Spanish (no regional accent or slang)";
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

/** Qué imágenes de referencia lleva una imagen clave, en orden: el personaje primero y el producto después. */
export function keyframeRefs(k: Pick<UgcKeyframe, "key" | "uses_character" | "uses_product">, characterKey: string): ("character" | "product")[] {
  const refs: ("character" | "product")[] = [];
  if (k.uses_character && k.key !== characterKey) refs.push("character");
  if (k.uses_product) refs.push("product");
  return refs;
}

function refPhrase(refs: ("character" | "product")[]): string {
  const ord = (i: number) => (refs.length === 1 ? "the reference image" : i === 0 ? "the first reference image" : "the second reference image");
  return refs
    .map((r, i) => (r === "character" ? `The person is the same person as in ${ord(i)} (same face, same hair).` : `The product is the one in ${ord(i)}.`))
    .join(" ");
}

/** La imagen clave (Flare, 9:16, sin reescribir el prompt). K1 va sin referencias: define la cara. */
export function keyframeRequest(k: UgcKeyframe, script: Pick<UgcScript, "persona" | "character">, characterKey: string): ShotRequest {
  const refs = keyframeRefs(k, characterKey);
  const who = k.key === characterKey || (k.uses_character && !refs.includes("character")) ? `The person: ${script.persona}; ${script.character.look}; wearing ${script.character.wardrobe}.` : "";
  const prompt = [PHOTO, refPhrase(refs), who, `Setting: ${script.character.setting}.`, k.prompt, k.uses_product ? PRODUCT_RULE : "", k.one_hand ? ONE_HAND : k.uses_character ? HANDS : ""]
    .filter(Boolean)
    .join(" ");
  return {
    endpoint: KEYFRAME_ENDPOINT,
    input: { prompt, resolution: "1k", quality: "low", aspect_ratio: "9:16", moderation: "auto", enhance_prompt: false },
  };
}

/** La toma hablada (Seedance 2.0, con audio): la persona dice la línea exacta con los labios sincronizados. */
export function aRollRequest(a: UgcARoll, language: string, productInFrame: boolean): ShotRequest {
  const prompt = [
    "Handheld vertical smartphone selfie video.",
    a.motion,
    a.acting,
    `The person speaks with accurate lip-sync, saying exactly: «${a.line}»`,
    a.delivery,
    productInFrame ? "The product and its printed label stay exactly the same and legible." : "",
    "Hands anatomically correct, no extra hands.",
    voiceBlock(language),
  ]
    .filter(Boolean)
    .join(" ");
  return { endpoint: A_ROLL_ENDPOINT, input: { prompt, duration: a.seconds, resolution: A_ROLL_RESOLUTION, generate_audio: true } };
}

export const B_ROLL_NEGATIVE = "text, captions, subtitles, watermark, logo changes, distorted label, extra fingers, extra hands";

/** El B-roll (Kling 2.5 Turbo, 5 s, sin audio): una acción corta que tapa la toma hablada. */
export function bRollRequest(b: UgcBRoll, productInFrame: boolean): ShotRequest {
  const prompt = [b.motion, productInFrame ? "The product label stays unchanged and legible." : "", "Realistic handheld smartphone footage."].filter(Boolean).join(" ");
  return { endpoint: B_ROLL_ENDPOINT, input: { prompt, duration: B_ROLL_SECONDS, negative_prompt: B_ROLL_NEGATIVE } };
}
