import { CATALOG } from "./components/catalog";
/** Todos los componentes están instalados y visibles; sin datos muestran su estado vacío. */
export const DEFAULT_CONVERSION_SUPPORTS: readonly string[] = CATALOG.map(
  (c) => c.id,
);
/** Todos los apoyos pueden ocultarse; la ficha y el checkout permanecen fuera de este catálogo. */
export const ALWAYS_ON_SUPPORTS: readonly string[] = [];
export function conversionSupportState(disabled: string[] = []) {
  return {
    schema_version: "1.0",
    disabled_components: [...new Set(disabled)]
      .filter((id) => DEFAULT_CONVERSION_SUPPORTS.includes(id) && !ALWAYS_ON_SUPPORTS.includes(id))
      .sort(),
  };
}
