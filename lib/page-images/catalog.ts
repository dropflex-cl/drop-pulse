// Los espacios de la página del producto y las tomas del director de galería (docs/spec-imagenes.md).
// Puro: lo usan el prompt, el render, la pantalla y los tests.

/**
 * Portada, galería, un espacio por cada beneficio que propone el director ('benefit-<n>') y los GIF
 * que sube el comerciante. Imágenes va antes de la Página del producto: los beneficios salen de la
 * ficha y los ángulos, y la página después usa estas imágenes.
 */
export type SlotKind = "cover" | "gallery" | "benefit" | "gif";

export const COVER = "cover";
export const GALLERY = "gallery";
/**
 * Los GIF de la página (componente gif-strip): solo subidos, nunca generados. Se ordenan como la
 * galería y el GIF N lleva el texto N que escribió la IA en la Página del producto: con 3 subidos se
 * usan los 3 primeros textos.
 */
export const GIFS = "gifs";
export const benefitSlot = (n: number | string) => `benefit-${n}`;
/** Beneficios que propone el director, cada uno con su imagen 3:4. */
export const BENEFIT_SHOTS = 3;

export function slotKind(slot: string): SlotKind | null {
  if (slot === COVER) return "cover";
  if (slot === GALLERY) return "gallery";
  if (slot === GIFS) return "gif";
  return slot.startsWith("benefit-") ? "benefit" : null;
}

/** Tomas de galería que propone el director (con la portada, 6 generadas). */
export const GALLERY_SHOTS = 5;
/** La galería de la página: de 4 a 6 elegidas, después de la portada (design-system imagenes.md). */
export const GALLERY_MIN = 4;
export const GALLERY_MAX = 6;
/** Los espacios que llevan varias elegidas en orden (1…n). */
export const ORDERED = new Set<SlotKind>(["gallery", "gif"]);

/** GIF de la página: tantos como textos escribe la IA (gif-strip). */
export const GIF_MAX = 5;
/** Un GIF pesa: el original puede llegar a 25 MB (el tope del bucket); se guarda re-codificado. */
export const GIF_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/**
 * Ancho con que se guarda. Una animación decodificada es una tira vertical de cuadros: el tope es de
 * ancho, nunca de lado mayor (con «inside» la altura de todos los cuadros encogería el clip).
 */
export const GIF_MAX_WIDTH = 900;
/** Lado mínimo: más chico se ve pixelado en la columna del producto. */
export const GIF_MIN_SIDE = 240;

/** Qué muestra una toma. Cada una cumple un papel en la venta. */
export const SHOT_TYPES = ["hero_clean", "hero_mood", "infographic", "comparison", "in_the_box", "detail", "in_use", "scale", "benefit"] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export const SHOT_NAMES: Record<ShotType, string> = {
  hero_clean: "Producto solo",
  hero_mood: "Ambiente",
  infographic: "Infografía",
  comparison: "Comparativa",
  in_the_box: "Qué incluye",
  detail: "Detalle",
  in_use: "En uso",
  scale: "Tamaño",
  benefit: "Beneficio",
};

/**
 * Proporción de cada espacio. Flare no genera 4:5 (acepta 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16 y
 * 21:9): los beneficios van en 3:4 nativo, sin recortar (un recorte cortaba el titular).
 */
export const SLOT_RATIO: Record<SlotKind, "1:1" | "3:4"> = { cover: "1:1", gallery: "1:1", benefit: "3:4", gif: "1:1" };

export const SLOT_FORMAT: Record<SlotKind, string> = { cover: "1:1 · imagen", gallery: "1:1 · 4 a 6 imágenes", benefit: "3:4 · imagen", gif: `GIF animado · hasta ${GIF_MAX}` };

/** Topes: protegen la cuenta de Higgsfield del comerciante de un bucle. */
export const DAILY_RUNS = 10;
export const DAILY_IMAGES = 150;
/** Opciones por espacio (sin contar las fotos de Información base): más, y la grilla deja de servir. */
export const MAX_OPTIONS_PER_SLOT = 12;
