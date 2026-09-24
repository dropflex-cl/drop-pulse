// En qué quedó la página del producto y si la etapa está completa (docs/spec-pagina-componentes.md).
// La etapa termina con la ficha aprobada; los componentes son opcionales: los que se usan en la
// página cuentan en el resumen. Puro: lo usan la pantalla, la ruta del producto y los tests.

import type { ContentStatus } from "@/lib/types";
import { LISTING } from "./listing";

export interface ProgressItem {
  component: string;
  status: ContentStatus;
  enabled: boolean;
}

export interface CopyProgress {
  /** Componentes escritos (sin la ficha). */
  total: number;
  /** Componentes que van en la página. */
  enabled: number;
  /** La ficha: sin escribir, por aprobar o aprobada. */
  listing: "missing" | "pending" | "approved";
  complete: boolean;
}

export function copyProgress(items: ProgressItem[]): CopyProgress {
  const listing = items.find((i) => i.component === LISTING);
  const components = items.filter((i) => i.component !== LISTING);
  const state = !listing ? "missing" : listing.status === "aprobado" ? "approved" : "pending";
  return {
    total: components.length,
    enabled: components.filter((i) => i.enabled).length,
    listing: state,
    complete: state === "approved",
  };
}

/** «3 componentes en la página». */
export function enabledLabel(n: number): string {
  if (!n) return "Sin componentes en la página";
  return n === 1 ? "1 componente en la página" : `${n} componentes en la página`;
}
