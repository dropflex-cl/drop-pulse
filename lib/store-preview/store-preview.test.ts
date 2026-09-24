import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { ICON_KEYS, UI_ICON_KEYS } from "@/lib/shopify/components/define";
import { contrast } from "@/lib/copy/accent";
import { ACCENT_PALETTE } from "@/lib/copy/accent";
import { accentTones, accentVars, brightness, withLightness } from "./accent";
import { EXAMPLE, exampleTokens, fill, tokenValues, type StoreFacts } from "./facts";
import { CSS_OUT, TS_OUT, storeCss, themeTs } from "./generate";
import { ICON_PATHS } from "./theme.generated";
import { boldParts } from "./settings";

describe("lo que la vista previa toma del tema", () => {
  it("está al día (npm run store-preview)", () => {
    expect(readFileSync(CSS_OUT, "utf8")).toBe(storeCss());
    expect(readFileSync(TS_OUT, "utf8")).toBe(themeTs(Object.fromEntries(CATALOG.map((c) => [c.id, c.file]))));
  });

  it("trae todos los íconos y ningún @media del tema", () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual([...ICON_KEYS, ...UI_ICON_KEYS].sort());
    expect(storeCss()).not.toMatch(/@media\s*\(\s*(min|max)-width/);
  });
});

describe("el acento, igual que df-accent-vars", () => {
  it("filtros de Shopify", () => {
    expect(brightness("#ffffff")).toBe(255);
    expect(brightness("#000000")).toBe(0);
    expect(withLightness("#1f4bd8", 50)).toMatch(/^#[0-9a-f]{6}$/);
    expect(withLightness("#ff0000", 25)).toBe("#800000");
  });

  it("el texto de acento pasa 4.5:1 sobre el fondo, conservando el tono", () => {
    for (const hex of ["#f5a524", "#a3e635", "#22d3ee", ...ACCENT_PALETTE.map((a) => a.hex)]) {
      const t = accentTones(hex)!;
      expect(contrast(t.ink, "#ffffff"), hex).toBeGreaterThanOrEqual(4.5);
    }
    const dark = accentTones("#1e3a8a", "#111111")!;
    expect(contrast(dark.ink, "#111111")).toBeGreaterThanOrEqual(4.5);
  });

  it("un acento que ya contrasta no se toca; el texto encima según el brillo", () => {
    expect(accentTones("#1f4bd8")).toEqual({ accent: "#1f4bd8", onAccent: "#ffffff", ink: "#1f4bd8" });
    expect(accentTones("#f5a524")!.onAccent).toBe("#16181d");
    expect(accentVars(null)).toEqual({});
    expect(accentVars("#1f4bd8")["--df-product-accent"]).toBe("#1f4bd8");
  });
});

describe("tokens con datos reales o de ejemplo", () => {
  const facts: StoreFacts = {
    productName: "Corrector",
    price: 24990,
    currency: "CLP",
    reviews: [],
    rating: null,
    count: 0,
    policies: { cod: true, free_shipping: true, return_days: 30 },
    logistics: null,
  };

  it("llena con lo real y marca lo de ejemplo", () => {
    expect(fill("Cambio gratis por {return_days} días", facts)).toBe("Cambio gratis por 30 días");
    expect(fill("{rating} · {count} reseñas", facts)).toBe(`4,8 · ${EXAMPLE.count} reseñas`);
    expect(exampleTokens({ a: "{rating} y {return_days}", b: ["{min}", "{qty}"] }, facts).sort()).toEqual(["min", "rating"]);
    const real = { ...facts, rating: 4.6, count: 1200, logistics: { min: 1, max: 3 } };
    expect(fill("{rating} de 5 · {count} · {min}-{max}", real)).toBe("4,6 de 5 · 1.200 · 1-3");
    expect(exampleTokens("{rating} {min}", real)).toEqual([]);
    expect(tokenValues(facts).threshold.value).toBe("$29.990");
  });

  it("negritas como el Liquid", () => {
    expect(boldParts("Compra **sin riesgo** hoy")).toEqual([
      { text: "Compra ", bold: false },
      { text: "sin riesgo", bold: true },
      { text: " hoy", bold: false },
    ]);
  });
});
