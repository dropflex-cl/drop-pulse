// Trazos de los adornos de evento (24×24, trazo de 1,75): los mismos de
// lib/shopify/components/_event/snippets/df-event-decor.liquid (el test lo compara). Puro.
import type { DecorKey } from "./catalog";

export const DECOR_PATHS: Record<DecorKey, string> = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  tag: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01",
  pumpkin: "M12 6c-1-2 0-3 2-4M12 6c-4-1.5-8 1-8 7s4 8 8 8 8-2 8-8-4-8.5-8-7Zm0 0c-1.5 1.5-2 4-2 7s.5 6 2 8m0-15c1.5 1.5 2 4 2 7s-.5 6-2 8",
  heart: "M12 20s-7-4.4-9.3-9A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5C19 15.6 12 20 12 20Z",
  snowflake: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2",
  sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  pencil: "M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z",
};
