// Costo de una imagen de Gemini en USD, para ai_generations.cost_usd. Puro, con tests.
//
// v1 anotaba US$0,134 fijos por imagen (docs/proveedor-ia/costo-actual.md de dropflex): no contaba los
// tokens de entrada (la foto y el prompt), ni el razonamiento, ni la diferencia 2K/4K, ni el modelo de
// respaldo. Aquí el costo sale de lo que informa la respuesta (`usageMetadata`): la imagen al precio
// publicado por resolución y el resto por tokens. Precios de ai.google.dev/gemini-api/docs/pricing
// (estudio de mercado de v1, 2026-06); si Google los cambia, se cambian aquí.

export type GeminiImageSize = "0.5K" | "1K" | "2K" | "4K";

interface ImageModelPrice {
  /** USD por imagen generada, según la resolución pedida. */
  perImage: Partial<Record<GeminiImageSize, number>>;
  /** USD por millón de tokens de entrada (texto e imágenes de referencia). */
  inputPerMTok: number;
  /** USD por millón de tokens de salida que no son imagen (razonamiento y texto). */
  textOutputPerMTok: number;
}

export const GEMINI_IMAGE_PRICES = {
  // Gemini 3 Pro Image («Nano Banana Pro»): el de los creativos de v1, texto en español confiable.
  "gemini-3-pro-image": { perImage: { "1K": 0.134, "2K": 0.134, "4K": 0.24 }, inputPerMTok: 2, textOutputPerMTok: 12 },
  // Gemini 3.1 Flash Image: el respaldo de v1 cuando Pro está saturado. Otro cupo, render más débil.
  "gemini-3.1-flash-image": { perImage: { "0.5K": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 }, inputPerMTok: 0.5, textOutputPerMTok: 3 },
} as const satisfies Record<string, ImageModelPrice>;

export type GeminiImageModel = keyof typeof GEMINI_IMAGE_PRICES;

/** Lo que cuenta para el costo, leído de la respuesta. */
export interface GeminiImageUsage {
  inputTokens: number;
  /** Tokens de salida que no son imagen: razonamiento + texto. */
  textOutputTokens: number;
  /** Imágenes que devolvió (0 si la bloqueó). */
  images: number;
}

/**
 * El precio de un id tal como lo devuelve o lo acepta la API: sin `models/` y sin sufijo de versión
 * (`gemini-3-pro-image-preview`, `gemini-3-pro-image-001`). null si no lo conocemos.
 */
export function priceFor(model: string): ImageModelPrice | null {
  const id = model.replace(/^models\//, "");
  const known = (Object.keys(GEMINI_IMAGE_PRICES) as GeminiImageModel[])
    .filter((k) => id === k || id.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return known ? GEMINI_IMAGE_PRICES[known] : null;
}

/**
 * USD de una llamada. `estimated` cuando el modelo o la resolución no están en la tabla: se cobra con
 * el precio de Pro, el más alto, para no subestimar (queda marcado como estimado en ai_generations).
 *
 * @example
 * imageCostUsd("gemini-3-pro-image", "2K", { inputTokens: 2000, textOutputTokens: 0, images: 1 })
 * // → { usd: 0.138, estimated: false }
 */
export function imageCostUsd(model: string, size: GeminiImageSize, u: GeminiImageUsage): { usd: number; estimated: boolean } {
  const pro: ImageModelPrice = GEMINI_IMAGE_PRICES["gemini-3-pro-image"];
  const known = priceFor(model);
  const exact = known?.perImage[size];
  const p = known ?? pro;
  const image = exact ?? pro.perImage[size === "4K" ? "4K" : "2K"]!;
  const usd = u.images * image + (u.inputTokens * p.inputPerMTok + u.textOutputTokens * p.textOutputPerMTok) / 1e6;
  return { usd: Math.round(usd * 1e6) / 1e6, estimated: exact == null };
}
