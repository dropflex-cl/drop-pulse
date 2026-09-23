import { describe, expect, it } from "vitest";
import { IMPORT_ERRORS, countryLabel, importErrorMessage, importSummary, ratingLabel, reviewDate } from "./copy";

describe("textos de reseñas", () => {
  it("fecha corta en español", () => {
    expect(reviewDate("2026-08-13")).toBe("ago 2026");
    expect(reviewDate(null)).toBeUndefined();
  });

  it("país y calificación como los muestra la tienda", () => {
    expect(countryLabel("CL")).toBe("Chile");
    expect(countryLabel("MX")).toBe("México");
    expect(ratingLabel(4.6)).toBe("4,6");
  });

  it("resumen: importadas, nuevas y repetidas", () => {
    expect(importSummary(48, 0, 4.6)).toBe("48 importadas · promedio 4,6");
    expect(importSummary(12, 36)).toBe("12 nuevas · 36 ya estaban");
    expect(importSummary(0, 20)).toBe("Ninguna nueva · 20 ya estaban");
  });

  it("todo error tiene texto; uno desconocido cae al genérico", () => {
    for (const text of Object.values(IMPORT_ERRORS)) expect(text).toMatch(/\.$/);
    expect(importErrorMessage("otra cosa")).toBe(IMPORT_ERRORS.failed);
  });
});
