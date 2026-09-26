// El proveedor de imágenes de cada etapa que genera (Creativos e Imágenes de la página): Higgsfield, con
// la clave y los créditos del comerciante, o Gemini, con la clave de DropFlex. El comerciante lo elige en
// la misma pantalla y la elección queda guardada por etapa (image_provider_choices). Puro: lo usan el
// servidor, la pantalla y los tests.
import { IMAGE_COST_USD } from "@/lib/creatives/catalog";
import { imageCostUsd } from "@/lib/integrations/gemini/pricing";

export const IMAGE_PROVIDERS = ["higgsfield", "gemini"] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

export const IMAGE_STAGES = ["creatives", "page_images"] as const;
export type ImageStage = (typeof IMAGE_STAGES)[number];

export const IMAGE_PROVIDER_NAME: Record<ImageProvider, string> = { higgsfield: "Higgsfield", gemini: "Gemini" };

/**
 * USD por imagen, para el aviso antes de generar. Higgsfield: la cota de Flare 1k baja. Gemini: Pro a
 * 2K con ~2.000 tokens de entrada (foto base + prompt), como lo calcula pricing.ts al registrar.
 */
export const IMAGE_COST_BY_PROVIDER: Record<ImageProvider, number> = {
  higgsfield: IMAGE_COST_USD,
  gemini: imageCostUsd("gemini-3-pro-image", "2K", { inputTokens: 2000, textOutputTokens: 0, images: 1 }).usd,
};

/** De dónde sale el cobro, para completar «cuesta cerca de $0,10…». Gemini va al costo de IA del producto. */
export function costSource(p: ImageProvider | null | undefined): string {
  return p === "higgsfield" ? " de tu cuenta de Higgsfield" : "";
}

export interface ImageProviderOption {
  id: ImageProvider;
  name: string;
  available: boolean;
  /** Por qué no se puede usar (sin clave, clave rechazada, no activado). */
  reason?: string;
}

export interface ImageProviderChoice {
  /** El que se usa al generar; null si ninguno está disponible. */
  value: ImageProvider | null;
  /** Lo que el comerciante guardó para esta etapa (puede no estar disponible hoy). */
  saved: ImageProvider | null;
  options: ImageProviderOption[];
}

export const isImageProvider = (v: unknown): v is ImageProvider => IMAGE_PROVIDERS.includes(v as ImageProvider);
export const isImageStage = (v: unknown): v is ImageStage => IMAGE_STAGES.includes(v as ImageStage);

/**
 * El proveedor de una etapa: lo guardado si sigue disponible; si no, Higgsfield cuando el comerciante lo
 * conectó (lo que usaba antes de poder elegir) y, si no, Gemini.
 *
 * @example
 * pickImageProvider("gemini", { higgsfield: true, gemini: true })  // → "gemini"
 * pickImageProvider("gemini", { higgsfield: true, gemini: false }) // → "higgsfield"
 * pickImageProvider(null, { higgsfield: false, gemini: true })     // → "gemini"
 */
export function pickImageProvider(saved: ImageProvider | null, available: Record<ImageProvider, boolean>): ImageProvider | null {
  if (saved && available[saved]) return saved;
  if (available.higgsfield) return "higgsfield";
  if (available.gemini) return "gemini";
  return null;
}
