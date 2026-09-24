import type { StoreFacts } from "@/lib/store-preview/facts";

/**
 * Lo que recibe la vista previa de un componente. `content` puede venir a medio editar (textos
 * vacíos, listas cortas): el preview nunca se rompe por eso, muestra lo que hay.
 */
export interface PreviewProps<C = unknown> {
  content: C;
  facts: StoreFacts;
  /** Las fotos elegidas por espacio (ImageSlot.key → URLs, en orden). */
  images: Record<string, string[]>;
}
