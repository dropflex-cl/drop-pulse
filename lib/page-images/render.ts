// Cómo se pide una imagen de la página a Marketing Studio Flare (docs/spec-imagenes.md §4). Puro y
// testeado: la toma del director → el cuerpo exacto que va a Higgsfield. Siempre directo (sin preset:
// en el POC salía igual con y sin él) y sin `enhance_prompt` (traducía y agregaba textos).

import { RENDER } from "@/lib/creatives/catalog";
import { textRules } from "@/lib/creatives/render";
import { SLOT_RATIO, slotKind } from "./catalog";
import type { StoredShot } from "./schemas";

const FORMAT: Record<"1:1" | "3:4", string> = { "1:1": "Square", "3:4": "Vertical 3:4" };

/** Cada texto con su ubicación y, si es un callout, dónde termina su línea. */
function placedTexts(s: StoredShot): string[] {
  return s.texts.map((t) => {
    const where = t.placement?.trim().replace(/\.$/, "");
    const part = t.points_to?.trim();
    const line = t.role === "callout" && part ? `, connected by a thin line that ends in a small dot exactly on ${/^the\s/i.test(part) ? part : `the ${part}`}` : "";
    const lines = t.text.split("\n").map((l) => l.trim()).filter(Boolean);
    const words = lines.length > 1 ? `in two lines, "${lines[0]}" (bold) above "${lines[1]}" (regular)` : `"${lines[0] ?? ""}"`;
    return `- ${t.role} ${words}${where ? `: ${where}` : ""}${line}.`;
  });
}

/** Sin el motivo entre paréntesis que el director agrega a cada prop prohibido. */
const bare = (props: string[]) => props.map((p) => p.replace(/\s*\(.*\)\s*$/, "").trim()).filter(Boolean);

export function pageImagePrompt(s: StoredShot, ratio: "1:1" | "3:4", language: string): string {
  const units = s.product_units > 1 ? `Show exactly ${s.product_units} identical units of it, same size.` : "Show exactly one unit of it.";
  const kit = s.kit_parts.length
    ? `Also show, exactly as in the reference image: ${s.kit_parts.join(", ")}. No other item from the reference image.`
    : "Do not show the box or any accessory from the reference image.";
  const people = s.hands ? " Only hands and the body part where the product is used are visible (cropped close), never a face." : " No people, no hands.";
  const forbidden = bare(s.props_forbidden);
  return [
    `${FORMAT[ratio]} premium brand campaign image for a product page, art-directed by a top agency: bold, editorial, rich color, product large and heroic.`,
    `PRODUCT: ${s.product_look.trim()}, kept exactly as in the reference image (same shape, colors, logo and printed details). ${units} ${kit} Never turn an item from the reference image into a different object. Do not print any word, logo or label on the product that is not on it in the reference image; text printed on the box never goes on the product.`,
    `SCENE: ${s.scene.trim().replace(/\s+/g, " ")}${people}`,
    `Props exactly as described, nothing else decorative; no crystals or gemstones.${forbidden.length ? ` DO NOT INCLUDE: ${forbidden.join(", ")}.` : ""}`,
    `LAYOUT: ${s.layout.trim().replace(/\s+/g, " ")}`,
    ...(s.texts.length
      ? [
          "TEXTS, exactly these and each where indicated:",
          ...placedTexts(s),
          `STYLE: palette ${s.art.palette}; typography ${s.art.typography}; mood ${s.art.mood}. Headline dominant and bold, texts crisp and legible, nothing touching the edges.`,
          textRules(language),
        ]
      : [`STYLE: palette ${s.art.palette}; mood ${s.art.mood}.`, "NO TEXT: no words, letters, numbers, badges or logos anywhere in the image; the printed product label is the only text allowed."]),
  ].join("\n");
}

export interface PageRenderRequest {
  endpoint: string;
  ratio: "1:1" | "3:4";
  /** El cuerpo para Higgsfield sin la URL de la foto (se agrega al enviar: es temporal). */
  input: Record<string, unknown>;
}

export function pageRenderRequest(slot: string, s: StoredShot, language: string): PageRenderRequest {
  const ratio = SLOT_RATIO[slotKind(slot) ?? "gallery"];
  return {
    endpoint: RENDER.endpoint,
    ratio,
    input: {
      prompt: pageImagePrompt(s, ratio, language),
      resolution: RENDER.resolution,
      quality: RENDER.quality,
      aspect_ratio: ratio,
      moderation: "auto",
      enhance_prompt: false,
    },
  };
}
