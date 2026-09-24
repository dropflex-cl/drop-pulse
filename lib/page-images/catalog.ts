// Los espacios de la página del producto y las tomas del director de galería (docs/spec-imagenes.md).
// Puro: lo usan el prompt, el render, la pantalla y los tests.

/**
 * Portada, galería y un espacio por cada beneficio que propone el director ('benefit-<n>'). Imágenes
 * va antes de la Página del producto: los beneficios salen de la ficha y los ángulos, y la página
 * después usa estas imágenes.
 */
export type SlotKind = "cover" | "gallery" | "benefit";

export const COVER = "cover";
export const GALLERY = "gallery";
export const benefitSlot = (n: number | string) => `benefit-${n}`;
/** Beneficios que propone el director, cada uno con su imagen 3:4. */
export const BENEFIT_SHOTS = 3;

export function slotKind(slot: string): SlotKind | null {
  if (slot === COVER) return "cover";
  if (slot === GALLERY) return "gallery";
  return slot.startsWith("benefit-") ? "benefit" : null;
}

/** Tomas de galería que propone el director (con la portada, 6 generadas). */
export const GALLERY_SHOTS = 5;
/** La galería de la página: de 4 a 6 elegidas, después de la portada (design-system imagenes.md). */
export const GALLERY_MIN = 4;
export const GALLERY_MAX = 6;

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
export const SLOT_RATIO: Record<SlotKind, "1:1" | "3:4"> = { cover: "1:1", gallery: "1:1", benefit: "3:4" };

export const SLOT_FORMAT: Record<SlotKind, string> = { cover: "1:1 · imagen", gallery: "1:1 · 4 a 6 imágenes", benefit: "3:4 · imagen" };

/** Topes: protegen la cuenta de Higgsfield del comerciante de un bucle. */
export const DAILY_RUNS = 10;
export const DAILY_IMAGES = 150;
/** Opciones por espacio (sin contar las fotos de Información base): más, y la grilla deja de servir. */
export const MAX_OPTIONS_PER_SLOT = 12;
