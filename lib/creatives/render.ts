// Cómo se pide una pieza a Marketing Studio (docs/spec-creativos.md §3.2 y §7.2). Puro y testeado:
// el concepto del generador → el cuerpo exacto que va a Higgsfield. El prompt se arma en código, no
// lo escribe el modelo: la regla de texto (la que llevó el acierto de 0/4 a 5/7 en F0) va siempre igual.

import { RENDER, type Ratio, type TextRole } from "./catalog";
import type { BakedText, ConceptPayload } from "./schemas";

export type RenderMode = "preset" | "direct";

const PRODUCT = "the product from the reference image, kept exactly as it is (same shape, colors, logo and printed label, fully legible)";

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

function textsSpec(texts: BakedText[]): string {
  return texts.map((t) => `${ROLE_LABEL[t.role]}: "${t.text.trim()}".`).join(" ");
}

export interface RenderRequest {
  endpoint: string;
  mode: RenderMode;
  presetId: string | null;
  /** El cuerpo para Higgsfield sin la URL de la foto (se agrega al enviar: es temporal). */
  input: Record<string, unknown>;
}

/** El modo del intento: el preset si el concepto trae uno; si el QA lo rechazó, edición directa (spec §7.2). */
export function modeFor(concept: Pick<ConceptPayload, "preset_id">, attempt: number): RenderMode {
  return concept.preset_id && attempt === 1 ? "preset" : "direct";
}

export function renderRequest(concept: Pick<ConceptPayload, "preset_id" | "scene" | "texts">, ratio: Ratio, language: string, attempt = 1): RenderRequest {
  const mode = modeFor(concept, attempt);
  const format = ratio === "9:16" ? "Vertical 9:16" : "Square";
  const scene = concept.scene.trim().replace(/\s+/g, " ");
  const prompt =
    mode === "preset"
      ? `Ad for ${PRODUCT}. ${scene} ${textsSpec(concept.texts)} ${textRules(language)}`
      : `${format} advertising image. ${PRODUCT[0].toUpperCase()}${PRODUCT.slice(1)}. ${scene} Lay out the texts cleanly with strong hierarchy and generous margins, keeping the product clearly visible. ${textsSpec(concept.texts)} ${textRules(language)}`;
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
      enhance_prompt: mode === "preset",
      ...(mode === "preset" ? { preset_id: concept.preset_id } : {}),
    },
  };
}
