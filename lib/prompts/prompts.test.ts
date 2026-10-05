import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { renderPrompt, tagValues, templateProblems } from "./render";
import { costText, priceText, PRODUCT_DATA_TAGS, STRATEGY_TAGS, PROMPT_KEYS, type StrategyTagContext } from "./tags";
import { toPromptSettings } from "./view";

describe("Ajustes › Prompts", () => {
  it.each(PROMPT_KEYS)("%s puede pasar del servidor a la pantalla sin funciones", (key) => {
    const view = toPromptSettings(key, []);
    expect(() => structuredClone(view)).not.toThrow();
    expect(view.tags.length).toBeGreaterThan(0);
    for (const tag of view.tags) {
      expect(Object.keys(tag).sort()).toEqual(["label", "tag"]);
    }
  });
});

const CL = { countryCode: "CL", currency: "CLP", language: "es", timezone: "America/Santiago" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const ctx: StrategyTagContext = { name: "Corrector de postura", description: "- Tirantes elásticos\n- Talla única", pricing, market: CL };

/** Las plantillas de la versión 1, tal como las siembra la migración. */
function seeded(key: string): string {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261101000000_prompt_templates.sql"), "utf8");
  const m = sql.match(new RegExp(`'${key}', 1, \\$prompt\\$([\\s\\S]*?)\\$prompt\\$`));
  if (!m) throw new Error(`sin plantilla ${key}`);
  return m[1];
}

describe("plantillas sembradas", () => {
  it("traen todos sus tags", () => {
    expect(templateProblems("strategy", seeded("strategy"))).toEqual([]);
    expect(templateProblems("product_data", seeded("product_data"))).toEqual([]);
  });

  it("el mega prompt va completo, de la primera a la última frase", () => {
    const body = seeded("strategy");
    expect(body.startsWith("Actúa como un estratega senior de ventas directas")).toBe(true);
    expect(body.endsWith("Y enumera los 3 conceptos en orden de prioridad.")).toBe(true);
    for (const fase of ["FASE 1 — ANÁLISIS DEL PRODUCTO", "FASE 4 — HOOKS", "FASE 10 — PRIORIZACIÓN", "FORMATO FINAL", "REGLAS IMPORTANTES"]) expect(body).toContain(fase);
  });
});

describe("renderPrompt", () => {
  it("reemplaza cada tag y deja el resto igual", () => {
    const body = "Producto:\n[ESCRIBE EL NOMBRE DEL PRODUCTO]\nPaís: [PAÍS]\nPrecio: [PRECIO]\nOtra vez: [PAÍS]";
    const out = renderPrompt(body, STRATEGY_TAGS, ctx);
    expect(out).toContain("Producto:\nCorrector de postura\n");
    expect(out).toContain("País: Chile");
    expect(out.match(/Chile/g)).toHaveLength(2);
    expect(out).not.toContain("[");
  });

  it("el mega prompt sembrado queda sin tags", () => {
    const out = renderPrompt(seeded("strategy"), STRATEGY_TAGS, ctx);
    for (const t of STRATEGY_TAGS) expect(out).not.toContain(t.tag);
    expect(out).toContain("- Tirantes elásticos");
  });

  it("guarda los valores de cada tag", () => {
    const values = tagValues(PRODUCT_DATA_TAGS, { shopifyTitle: " Faja ", baseInfo: "" });
    expect(values).toEqual({ "[NOMBRE EN SHOPIFY]": "Faja", "[INFORMACIÓN DEL COMERCIANTE]": "(nada)" });
  });
});

describe("templateProblems", () => {
  it("dice qué tag falta", () => {
    const body = seeded("strategy").replace("[PRECIO]", "el precio");
    expect(templateProblems("strategy", body)).toEqual(["Falta el tag [PRECIO] (Precio de 1 unidad, tachado y packs (Precio y packs))."]);
  });

  it("rechaza un prompt vacío", () => {
    expect(templateProblems("product_data", " ")[0]).toMatch(/vacío/);
  });
});

describe("precio y costo", () => {
  it("el precio lleva el tachado, los packs y el pago contra entrega", () => {
    const text = priceText(pricing);
    expect(text.startsWith("$24.990 (1 unidad) · precio tachado $32.990 · Packs: 2 unidades por $")).toBe(true);
    expect(text).toContain("3 unidades por $");
    expect(text).toContain("(oferta principal)");
    expect(text.endsWith("Pago contra entrega")).toBe(true);
  });

  it("en dólares, con decimales", () => {
    const usd = buildPricingPlan({ unitCost: 6, avgShippingCost: 4, purchaseCostLimit: 8, confirmationRate: 80, deliveryRate: 80, salePrice: 39.9, compareAtPrice: null, extraUnitDiscount: 50 }, "USD")!;
    expect(priceText(usd)).toMatch(/^US\$39,9\d? \(1 unidad\) · Packs: /);
    expect(costText(usd)).toContain("envío promedio");
  });

  it("el costo dice el proveedor y el envío", () => {
    expect(costText(pricing)).toBe("$3.000 por unidad (proveedor) + envío promedio $8.000 por pedido");
  });
});
