import { readFileSync } from "node:fs";
import { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";
import { reviewCountLabel } from "@/lib/store-preview/facts";

const snippet = readFileSync("lib/shopify/components/_shared/snippets/df-review-count-label.liquid", "utf8")
  .replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, "");
const engine = new Liquid();
describe("conteos de reseñas hoy en Liquid y preview", () => {
  it.each([
    ["(8 reseñas)", "8", "(8 reseñas hoy)"],
    ["**8 opiniones** de compradores", "8", "**8 opiniones hoy** de compradores"],
    ["1 reseña", "1", "1 reseña hoy"],
    ["4,9 de 5 según 1.234 reseñas", "1.234", "4,9 de 5 según 1.234 reseñas hoy"],
    ["8 reseñas hoy", "8", "8 reseñas hoy"],
    ["Sin reseñas", "0", "Sin reseñas"],
    ["3–6 días de entrega", "8", "3–6 días de entrega"],
  ])("conserva las cifras y evita duplicados: %s", async (text, count_text, expected) => {
    expect(await engine.parseAndRender(snippet, { text, count_text })).toBe(expected);
    expect(reviewCountLabel(text)).toBe(expected);
    expect(reviewCountLabel(expected)).toBe(expected);
  });
});
