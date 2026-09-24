import { describe, expect, it } from "vitest";
import type { PricingPlan } from "@/lib/pricing/plan";
import { renderRequest, languageName, modeFor } from "./render";
import { conceptProblems, qaVerdict, textProblems, type ConceptPayload, type CreativeConceptsOutput } from "./schemas";

const pricing = {
  currency: "CLP",
  salePrice: 24990,
  compareAtPrice: 39990,
  packs: [
    { units: 1, price: 24990, perUnitPrice: 24990, savings: 0 },
    { units: 2, price: 37490, perUnitPrice: 18745, savings: 12490 },
  ],
} as unknown as PricingPlan;

const preset = "f53dec43-8292-53fc-b944-f70e8086b6f0";

const concept = (over: Partial<ConceptPayload> = {}): ConceptPayload => ({
  angle: "primary",
  family: "hero",
  name: "Equilibrio",
  why: "El titular nombra la sensación, no el síntoma.",
  preset_id: preset,
  scene: "Soft pink background, capsules and red fruits around the jar.",
  texts: [
    { role: "headline", text: "equilibrio que se siente." },
    { role: "badge", text: "60 CÁPSULAS VEGANAS" },
  ],
  ...over,
});

describe("renderRequest", () => {
  it("con preset: Flare, 1k, calidad baja, el preset y la regla de texto en el idioma del mercado", () => {
    const r = renderRequest(concept(), "1:1", "Spanish");
    expect(r).toMatchObject({ endpoint: "marketing-studio/image/flare", mode: "preset", presetId: preset });
    expect(r.input).toMatchObject({ resolution: "1k", quality: "low", aspect_ratio: "1:1", enhance_prompt: true, preset_id: preset });
    const prompt = r.input.prompt as string;
    expect(prompt).toContain('Headline: "equilibrio que se siente.".');
    expect(prompt).toContain('Badge: "60 CÁPSULAS VEGANAS".');
    expect(prompt).toContain("in Spanish");
    expect(prompt).toContain("Do not translate anything.");
    expect(prompt).toMatch(/kept exactly as it is/);
  });

  it("el segundo intento pasa a edición directa, sin preset (el QA rechazó el primero)", () => {
    const r = renderRequest(concept(), "9:16", "Spanish", 2);
    expect(r.mode).toBe("direct");
    expect(r.presetId).toBeNull();
    expect(r.input).toMatchObject({ enhance_prompt: false, aspect_ratio: "9:16" });
    expect(r.input).not.toHaveProperty("preset_id");
    expect(r.input.prompt as string).toMatch(/^Vertical 9:16 advertising image\./);
  });

  it("sin preset (foto nativa, nota) siempre es edición directa", () => {
    expect(modeFor({ preset_id: null }, 1)).toBe("direct");
    expect(renderRequest(concept({ preset_id: null, family: "native" }), "1:1", "Spanish").input.prompt as string).toMatch(/^Square advertising image\./);
  });

  it("el idioma sale del código del mercado", () => {
    expect(languageName("es-CL")).toBe("Spanish");
    expect(languageName("en")).toBe("English");
  });
});

describe("textProblems", () => {
  it("acepta los montos de PRECIO Y OFERTA y rechaza los inventados", () => {
    expect(textProblems([{ role: "headline", text: "2 por $37.490" }], pricing)).toEqual([]);
    expect(textProblems([{ role: "headline", text: "Hoy $9.990" }], pricing)[0]).toMatch(/monto/);
  });

  it("rechaza promesas de salud y exige un solo titular", () => {
    expect(textProblems([{ role: "headline", text: "Previene infecciones urinarias" }], pricing)[0]).toMatch(/salud/);
    expect(textProblems([{ role: "badge", text: "Sin sabor" }], pricing)[0]).toMatch(/headline/);
  });
});

describe("conceptProblems", () => {
  const six: CreativeConceptsOutput = {
    concepts: [
      concept(),
      concept({ family: "explainer" }),
      concept({ family: "headline" }),
      concept({ angle: "secondary", family: "proof" }),
      concept({ angle: "secondary", family: "native", preset_id: null }),
      concept({ family: "offer" }),
    ],
    compliance_flags: [],
  };
  const facts = { presetIds: new Set([preset]), pricing };

  it("una respuesta completa no tiene problemas", () => {
    expect(conceptProblems(six, facts)).toEqual([]);
  });

  it("pide la oferta, presets reales y un preset en las familias que lo tienen", () => {
    const bad = { ...six, concepts: [...six.concepts.slice(0, 5), concept({ preset_id: "00000000-0000-0000-0000-000000000000" })] };
    const problems = conceptProblems(bad, facts);
    expect(problems.some((p) => /oferta/.test(p))).toBe(true);
    expect(problems.some((p) => /no está en PRESETS/.test(p))).toBe(true);
    expect(conceptProblems({ ...six, concepts: [...six.concepts.slice(0, 5), concept({ family: "offer", preset_id: null })] }, facts).some((p) => /elige uno de PRESETS/.test(p))).toBe(true);
  });
});

describe("qaVerdict", () => {
  it("pasa solo con el producto igual, los textos exactos, sin textos de más y en el idioma pedido", () => {
    const ok = qaVerdict({ product_matches: true, product_issue: null, texts: [{ expected: "Hola", status: "exact", found: "Hola" }], extra_texts: [], language_ok: true });
    expect(ok.pass).toBe(true);
    const bad = qaVerdict({
      product_matches: true,
      product_issue: null,
      texts: [{ expected: "DENTRO DE CADA CÁPSULA", status: "typo", found: "INSIDE EVERY CAPSULE" }],
      extra_texts: ["VAGINAL PROBIOTIC"],
      language_ok: false,
    });
    expect(bad.pass).toBe(false);
    expect(bad.issues).toEqual(["Tradujo algún texto a otro idioma.", "«DENTRO DE CADA CÁPSULA» quedó como «INSIDE EVERY CAPSULE».", "Agregó «VAGINAL PROBIOTIC»."]);
  });
});
