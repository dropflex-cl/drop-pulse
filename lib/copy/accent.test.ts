import { describe, expect, it } from "vitest";
import { ACCENT_PALETTE, MIN_CONTRAST, WHITE, accentCheck, contrast, normalizeHex, onAccent } from "./accent";

describe("color de acento de la página", () => {
  it("la paleta tiene al menos 15 colores distintos, en hex de 6 dígitos", () => {
    expect(ACCENT_PALETTE.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ACCENT_PALETTE.map((c) => c.hex)).size).toBe(ACCENT_PALETTE.length);
    for (const c of ACCENT_PALETTE) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("cada color de la paleta lleva texto blanco con contraste AA (4,5:1)", () => {
    for (const c of ACCENT_PALETTE) {
      expect(contrast(c.hex, WHITE), c.name).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(onAccent(c.hex).text, c.name).toBe(WHITE);
      expect(accentCheck(c.hex).ok, c.name).toBe(true);
    }
  });

  it("contraste WCAG: blanco sobre negro es 21:1; el cobalto del sistema, 6,9:1 aprox.", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#1f4bd8", "#ffffff")).toBeGreaterThan(6.5);
  });

  it("un color claro elegido a mano lleva texto negro; uno que no se lee sobre blanco no pasa", () => {
    expect(onAccent("#fde047").text).toBe("#000000");
    expect(accentCheck("#fde047").ok).toBe(false);
    expect(accentCheck("#e11d48").ok).toBe(true);
  });

  it("normaliza el hex", () => {
    expect(normalizeHex("1F4BD8")).toBe("#1f4bd8");
    expect(normalizeHex(" #14d ")).toBe("#1144dd");
    expect(normalizeHex("azul")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });
});
