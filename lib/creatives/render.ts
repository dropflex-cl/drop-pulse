// Cómo se pide una pieza a Marketing Studio (docs/spec-creativos.md §3.2, §7.2 y §7.4). Puro y
// testeado: el concepto del generador → el cuerpo exacto que va a Higgsfield. El prompt se arma en
// código, no lo escribe el modelo: la regla de texto (la que llevó el acierto de 0/4 a 5/7 en F0) y
// la del producto van siempre igual. Con dirección de arte (conceptos v2) el prompt nombra el
// producto, dice qué partes del kit aparecen, ubica cada texto y fija paleta y tipografía; los
// conceptos v1 (sin layout) siguen con el formato anterior.

import { FAMILY_DEFS, RENDER, type Family, type Ratio, type TextRole } from "./catalog";
import { chatRenderPrompt, type WhatsappChat } from "./chat";
import type { ConceptPayload, StoredText } from "./schemas";

export type RenderMode = "preset" | "direct";

const PRODUCT = "the product from the reference image, kept exactly as it is (same shape, colors, logo and printed label, fully legible)";
const NO_NEW_MARKS = "Do not print any word, logo or label on the product that is not on it in the reference image.";

const ROLE_LABEL: Record<TextRole, string> = {
  headline: "Headline",
  subheadline: "Subheadline",
  callout: "Callout",
  badge: "Badge",
  table_header: "Table column header",
  table_row: "Table row",
  note: "Handwritten-style note",
};

/** Idioma de los textos, en inglés para el modelo («Spanish»). */
export function languageName(code: string): string {
  const base = code.toLowerCase().split(/[-_]/)[0];
  return ({ es: "Spanish", en: "English", pt: "Portuguese" } as Record<string, string>)[base] ?? "the given language";
}

export function textRules(language: string): string {
  return [
    `TEXT RULES: write every text exactly as given between quotes, in ${language}, with its accents and punctuation.`,
    `Do not translate anything.`,
    `Do not add any headline, overline, badge, button, signature, brand line or word that is not listed here; the printed product label is the only other text allowed.`,
  ].join(" ");
}

function textsSpec(texts: StoredText[]): string {
  return texts.map((t) => `${ROLE_LABEL[t.role]}: "${t.text.trim()}".`).join(" ");
}

/** Cada texto con su ubicación y, si es un callout, la parte del producto a la que llega su línea. */
function placedTexts(texts: StoredText[]): string[] {
  return texts.map((t) => {
    const where = t.placement?.trim().replace(/\.$/, "");
    const part = t.points_to?.trim();
    const line = t.role === "callout" && part ? `, connected by a thin line to ${/^the\s/i.test(part) ? part : `the ${part}`}` : "";
    return `- ${ROLE_LABEL[t.role]} "${t.text.trim()}"${where ? `: ${where}` : ""}${line}.`;
  });
}

/** Lo que el render necesita de un concepto (los v1 no traen dirección de arte). */
export type RenderableConcept = Pick<ConceptPayload, "preset_id" | "scene"> & {
  family?: Family;
  texts: StoredText[];
  product_look?: string;
  art?: ConceptPayload["art"];
  layout?: string;
  product_units?: number;
  kit_parts?: string[];
};

export interface RenderRequest {
  endpoint: string;
  mode: RenderMode;
  presetId: string | null;
  /** El cuerpo para Higgsfield sin la URL de la foto (se agrega al enviar: es temporal). */
  input: Record<string, unknown>;
}

/**
 * El modo del intento: el preset si el concepto trae uno y su familia lo admite; si el QA rechazó el
 * primero, edición directa (spec §7.2). Las familias de escena van siempre directas (§7.4).
 */
export function modeFor(concept: Pick<RenderableConcept, "preset_id" | "family">, attempt: number): RenderMode {
  const allowsPreset = !concept.family || FAMILY_DEFS[concept.family].presetGroups.length > 0;
  return concept.preset_id && allowsPreset && attempt === 1 ? "preset" : "direct";
}

/** El prompt con dirección de arte (conceptos v2). */
function directedPrompt(c: RenderableConcept & { layout: string }, ratio: Ratio, language: string): string {
  const format = ratio === "9:16" ? "Vertical 9:16" : "Square";
  const look = c.product_look?.trim() || "the product from the reference image";
  const units = (c.product_units ?? 1) > 1 ? `Show exactly ${c.product_units} units of it, side by side.` : "Show exactly one unit of it.";
  const kit = c.kit_parts?.length
    ? `Also show, exactly as in the reference image: ${c.kit_parts.join(", ")}. No other item from the reference image.`
    : "Do not show the box or any accessory from the reference image.";
  return [
    `${format} advertising image, art-directed like a premium agency ad.`,
    `PRODUCT: ${look}, kept exactly as in the reference image (same shape, colors, logo and printed details). ${units} ${kit} Never turn an item from the reference image into a different object. ${NO_NEW_MARKS}`,
    `SCENE: ${c.scene.trim().replace(/\s+/g, " ")}`,
    `LAYOUT: ${c.layout.trim().replace(/\s+/g, " ")}`,
    "TEXTS, exactly these and each where indicated:",
    ...placedTexts(c.texts),
    ...(c.art ? [`STYLE: palette ${c.art.palette}; typography ${c.art.typography}; mood ${c.art.mood}. Generous margins, no text touching the edges, clean hierarchy.`] : []),
    textRules(language),
  ].join("\n");
}

export function renderRequest(concept: RenderableConcept, ratio: Ratio, language: string, attempt = 1): RenderRequest {
  const mode = modeFor(concept, attempt);
  const format = ratio === "9:16" ? "Vertical 9:16" : "Square";
  const scene = concept.scene.trim().replace(/\s+/g, " ");
  const prompt = concept.layout
    ? directedPrompt({ ...concept, layout: concept.layout }, ratio, language)
    : mode === "preset"
      ? `Ad for ${PRODUCT}. ${NO_NEW_MARKS} ${scene} ${textsSpec(concept.texts)} ${textRules(language)}`
      : `${format} advertising image. ${PRODUCT[0].toUpperCase()}${PRODUCT.slice(1)}. ${NO_NEW_MARKS} ${scene} Lay out the texts cleanly with strong hierarchy and generous margins, keeping the product clearly visible. ${textsSpec(concept.texts)} ${textRules(language)}`;
  return {
    endpoint: RENDER.endpoint,
    mode,
    presetId: mode === "preset" ? concept.preset_id : null,
    input: {
      prompt,
      resolution: RENDER.resolution,
      quality: RENDER.quality,
      aspect_ratio: ratio,
      moderation: "auto",
      // Nunca se deja que Higgsfield reescriba el prompt: con la dirección de arte no aporta y es lo
      // que traducía textos al inglés, agregaba palabras de fondo y omitía notas (spec §7.4).
      enhance_prompt: false,
      ...(mode === "preset" ? { preset_id: concept.preset_id } : {}),
    },
  };
}

/**
 * La captura del chat de WhatsApp: siempre directa (un preset le pone su diseño) y en 9:16. El prompt
 * es el autocontenido de lib/creatives/chat.ts.
 */
export function chatRenderRequest(chat: WhatsappChat, languageCode: string, productLook?: string): RenderRequest {
  return {
    endpoint: RENDER.endpoint,
    mode: "direct",
    presetId: null,
    input: {
      prompt: chatRenderPrompt(chat, languageCode, productLook),
      resolution: RENDER.resolution,
      quality: RENDER.quality,
      aspect_ratio: "9:16",
      moderation: "auto",
      enhance_prompt: false,
    },
  };
}
