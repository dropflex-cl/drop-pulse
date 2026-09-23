// En qué quedó cada bloque de la página y si la etapa está completa (design-system/textos.md ›
// Obligatorios). Puro: lo usan la pantalla, la ruta del producto y los tests.

import type { ContentStatus } from "@/lib/types";
import { BLOCKS, blockDef } from "./blocks";

/**
 * - accepted / edited: aprobado (con el texto de la IA o con el tuyo);
 * - kept: descartado con original: se mantiene lo de Shopify;
 * - discarded: descartado sin original: no va en la página;
 * - missing: obligatorio descartado sin original: falta aprobar una versión;
 * - pending: por revisar.
 */
export type ItemState = "accepted" | "edited" | "kept" | "discarded" | "missing" | "pending";

export interface ProgressItem {
  key: string;
  status: ContentStatus;
  edited?: boolean;
  original?: string | null;
}

export function itemState(i: ProgressItem): ItemState {
  if (i.status === "aprobado") return i.edited ? "edited" : "accepted";
  if (i.status === "rechazado") {
    if (i.original?.trim()) return "kept";
    return blockDef(i.key)?.required ? "missing" : "discarded";
  }
  return "pending";
}

export interface CopyProgress {
  total: number;
  approved: number;
  pending: number;
  /** Obligatorios sin versión aprobada (descartados sin original, o que no llegaron). */
  missing: string[];
  complete: boolean;
}

export function copyProgress(items: ProgressItem[]): CopyProgress {
  const states = items.map(itemState);
  const settled = (key: string) => items.some((i, n) => i.key === key && ["accepted", "edited", "kept"].includes(states[n]));
  const missing = BLOCKS.filter((b) => b.required && !settled(b.key) && !items.some((i, n) => i.key === b.key && states[n] === "pending")).map((b) => b.label);
  const pending = states.filter((s) => s === "pending").length;
  return {
    total: items.length,
    approved: states.filter((s) => s === "accepted" || s === "edited").length,
    pending,
    missing,
    complete: items.length > 0 && pending === 0 && missing.length === 0,
  };
}
