// Rutas que dependen de datos. Las rutas van siempre en inglés (CLAUDE.md › Rutas);
// las claves internas (`StageKey`, `ProductFilter`) siguen el vocabulario del design system.
import type { ProductFilter, StageKey } from "./types";

/** Segmento de URL de cada etapa con pantalla propia. */
export const STAGE_SEGMENT: Partial<Record<StageKey, string>> = { importado: "base", textos: "copy", imagenes: "images" };

/** La etapa en su pantalla, o la ficha del producto si la etapa no tiene una. */
export function productHref(id: string, stage?: StageKey): string {
  const segment = stage && STAGE_SEGMENT[stage];
  return segment ? `/products/${id}/${segment}` : `/products/${id}`;
}

/** Valor de `?filter=` en /products. */
export const FILTER_PARAM: Record<ProductFilter, string> = { avanzan: "moving", detenidos: "stuck", publicados: "published" };

export function filterFromParam(value: string | undefined): ProductFilter | undefined {
  return (Object.keys(FILTER_PARAM) as ProductFilter[]).find((f) => FILTER_PARAM[f] === value);
}
