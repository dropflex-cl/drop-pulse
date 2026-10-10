import { CATALOG } from "./components/catalog";
/** Todos los componentes están instalados y visibles; sin datos muestran su estado vacío. */
export const DEFAULT_CONVERSION_SUPPORTS: readonly string[] = CATALOG.map(
  (c) => c.id,
);
/** Apoyos permanentes: ninguna variante o exclusión puede retirarlos. */
export const ALWAYS_ON_SUPPORTS: readonly string[] = [
  "review-stars", "review-slider", "review-wall", "inventory", "benefit-double-box",
];
export function conversionSupportState(disabled: string[] = []) {
  return {
    schema_version: "1.0",
    disabled_components: [...new Set(disabled)]
      .filter((id) => DEFAULT_CONVERSION_SUPPORTS.includes(id) && !ALWAYS_ON_SUPPORTS.includes(id))
      .sort(),
  };
}
