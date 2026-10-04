import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { TestAngle } from "@/lib/angles/catalog";
import { angleLine, buyerLine, buyerReasons, marketAnchorLine, productFacts, proofLine, reviewQuotes, SUPPLIER_TEXT_MAX, supplierText } from "./context";
import type { ProductBrief } from "./schemas";

const brief = {
  product_name: "Corrector de postura",
  what_it_does: "Lleva los hombros atrás.",
  how_it_works: null,
  key_facts: [
    { label: "Material", value: "Neopreno" },
    { label: "Talla", value: "Única" },
  ],
  proof: { real_expert: null, real_reviews: ["Me sirvió", " "], studies_or_certifications: [], units_sold_or_social_proof: null, guarantee_days: null },
} as unknown as ProductBrief;

const angle: TestAngle = {
  slot: 2,
  frame: "offer",
  title: "La tele a todo volumen",
  pain_or_desire: "No escucha",
  segment: "Hijos",
  promise: "Oír mejor",
  trigger_moment: "",
  competition: "",
  hook: "Si la tele de tu papá se escucha desde la calle, esto es para ustedes.",
  speaks_to: "buyer",
  tone: "humor cotidiano",
  market_amounts: [400000],
};

describe("contexto compartido de los prompts", () => {
  it("los hechos del producto van en viñetas, sin la ficha en JSON ni lo que falta", () => {
    expect(productFacts(brief)).toBe(["PRODUCTO: Corrector de postura", "Lo comprobado en la foto y la ficha:", "- Lleva los hombros atrás.", "- Material: Neopreno", "- Talla: Única"].join("\n"));
    expect(productFacts(brief)).not.toContain("{");
  });

  it("el texto del proveedor va tal cual y recortado", () => {
    expect(supplierText("  ")).toBe("(nada)");
    expect(supplierText(" origen Japón ")).toBe("origen Japón");
    expect(supplierText("x".repeat(SUPPLIER_TEXT_MAX + 10))).toBe(`${"x".repeat(SUPPLIER_TEXT_MAX)}…`);
  });

  it("quién compra es una línea; el porqué y las dudas, sin escenas ni frases", () => {
    expect(buyerLine(AVATAR)).toBe(`QUIÉN COMPRA, SEGÚN EL COMERCIANTE: ${AVATAR.summary}`);
    expect(buyerReasons(AVATAR)).toEqual([`- Por qué compra: ${AVATAR.why_buy}`, ...AVATAR.doubts.map((d) => `- Duda: ${d}`), `- El pago contra entrega: ${AVATAR.cash_on_delivery}`]);
    expect(buyerReasons({ ...AVATAR, user: "Su papá", doubts: [] })[0]).toBe("- Quién lo usa: Su papá");
  });

  it("las pruebas se cuentan sin citarlas, y las reseñas se citan recortadas", () => {
    expect(proofLine(brief)).toBe("PRUEBAS REALES: sin experto; 1 reseñas de compradores del mismo producto en otra tienda.");
    expect(proofLine({ ...brief, proof: { ...brief.proof, real_expert: "Kinesióloga Ana Pérez" } }, [])).toBe("PRUEBAS REALES: experto: Kinesióloga Ana Pérez; sin reseñas.");
    expect(reviewQuotes(["a", "a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(reviewQuotes(["x".repeat(400)], 1)[0]).toHaveLength(301);
  });

  it("un ángulo en pocas líneas: gancho, a quién le habla, tono y, solo si se pide, el ancla", () => {
    const line = angleLine(angle, "CLP");
    expect(line.split("\n")[0]).toBe("Ángulo 2: «La tele a todo volumen»");
    expect(line).toContain(`«${angle.hook}»`);
    expect(line).toContain("quien compra");
    expect(line).toContain("humor cotidiano");
    expect(line).toContain(marketAnchorLine([400000], "CLP"));
    expect(line).not.toContain("No escucha");
    // Sin moneda, sin el ancla: solo los ganchos la pueden usar.
    expect(angleLine(angle)).not.toContain("Ancla de mercado");
    // Un ángulo de antes del orquestador v7: sin gancho, con su dolor y su promesa.
    const old = angleLine({ ...angle, hook: undefined, speaks_to: undefined, tone: undefined, market_amounts: undefined }, "CLP");
    expect(old).toContain("Dolor o deseo: No escucha");
    expect(old).toContain("Promesa: Oír mejor");
  });
});
