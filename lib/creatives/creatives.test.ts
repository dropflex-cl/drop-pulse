import { describe, expect, it } from "vitest";
import type { PricingPlan } from "@/lib/pricing/plan";
import { renderRequest, languageName, modeFor, type RenderableConcept } from "./render";
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
const KIT = ["spare grey roller head", "white USB cable"];

const concept = (over: Partial<ConceptPayload> = {}): ConceptPayload => ({
  angle: 1,
  family: "hero",
  name: "Equilibrio",
  why: "El titular nombra la sensación, no el síntoma.",
  look: "El frasco al centro sobre rosado, con cápsulas y frutas rojas.",
  preset_id: preset,
  art: { palette: "blush pink, ivory, rose gold", typography: "bold condensed sans caps", mood: "fresh, clean, premium" },
  scene: "Soft pink background, capsules and red fruits around the jar.",
  layout: "The jar centered, occupying half of the frame; headline across the top.",
  product_units: 1,
  kit_parts: [],
  texts: [
    { role: "headline", text: "equilibrio que se siente.", placement: "top center, one line, charcoal", points_to: null },
    { role: "badge", text: "60 CÁPSULAS VEGANAS", placement: "bottom right, rose-gold pill", points_to: null },
  ],
  ...over,
});

/** Un concepto como se guardaba antes de la dirección de arte (prompt v1). */
const legacy: RenderableConcept = {
  preset_id: preset,
  scene: "Soft pink background, capsules and red fruits around the jar.",
  texts: [
    { role: "headline", text: "equilibrio que se siente." },
    { role: "badge", text: "60 CÁPSULAS VEGANAS" },
  ],
};

describe("renderRequest", () => {
  it("con dirección de arte: nombra el producto, ubica cada texto y fija el estilo", () => {
    const c = concept({
      family: "explainer",
      preset_id: null,
      kit_parts: ["spare grey roller head"],
      texts: [
        { role: "headline", text: "Dos rodillos, dos trabajos", placement: "top center, one line.", points_to: null },
        { role: "callout", text: "Fino: pule y suaviza", placement: "lower left pill", points_to: "spare grey roller head" },
      ],
    });
    const r = renderRequest({ ...c, product_look: "pink electric foot file with a rose-gold ring" }, "1:1", "Spanish");
    expect(r).toMatchObject({ endpoint: "marketing-studio/image/flare", mode: "direct", presetId: null });
    expect(r.input).toMatchObject({ resolution: "1k", quality: "low", aspect_ratio: "1:1", enhance_prompt: false });
    const prompt = r.input.prompt as string;
    expect(prompt).toMatch(/^Square advertising image, art-directed/);
    expect(prompt).toContain("PRODUCT: pink electric foot file with a rose-gold ring, kept exactly as in the reference image");
    expect(prompt).toContain("Show exactly one unit of it.");
    expect(prompt).toContain("Also show, exactly as in the reference image: spare grey roller head. No other item from the reference image.");
    expect(prompt).toContain("Do not print any word, logo or label on the product");
    expect(prompt).toContain('- Headline "Dos rodillos, dos trabajos": top center, one line.');
    expect(prompt).toContain('- Callout "Fino: pule y suaviza": lower left pill, connected by a thin line to the spare grey roller head.');
    const withThe = renderRequest({ ...c, texts: [c.texts[0], { ...c.texts[1], points_to: "the spare grey roller head" }] }, "1:1", "Spanish");
    expect(withThe.input.prompt as string).toContain("connected by a thin line to the spare grey roller head.");
    expect(prompt).toContain("STYLE: palette blush pink, ivory, rose gold; typography bold condensed sans caps; mood fresh, clean, premium.");
    expect(prompt).toContain("in Spanish");
    expect(prompt).toContain("Do not translate anything.");
  });

  it("sin partes del kit, pide no mostrar la caja ni accesorios; la oferta muestra sus unidades", () => {
    expect(renderRequest(concept(), "1:1", "Spanish").input.prompt as string).toContain("Do not show the box or any accessory from the reference image.");
    expect(renderRequest(concept({ family: "offer", product_units: 3 }), "1:1", "Spanish").input.prompt as string).toContain("Show exactly 3 units of it, side by side.");
  });

  it("con preset (producto protagonista): el preset, sin que Higgsfield reescriba el prompt", () => {
    const r = renderRequest(concept(), "9:16", "Spanish");
    expect(r).toMatchObject({ mode: "preset", presetId: preset });
    expect(r.input).toMatchObject({ enhance_prompt: false, preset_id: preset, aspect_ratio: "9:16" });
    expect(r.input.prompt as string).toMatch(/^Vertical 9:16 advertising image/);
  });

  it("el segundo intento pasa a edición directa, sin preset (el QA rechazó el primero)", () => {
    const r = renderRequest(concept(), "9:16", "Spanish", 2);
    expect(r.mode).toBe("direct");
    expect(r.presetId).toBeNull();
    expect(r.input).toMatchObject({ enhance_prompt: false });
    expect(r.input).not.toHaveProperty("preset_id");
  });

  it("las familias de escena nunca usan preset, aunque el concepto traiga uno", () => {
    expect(modeFor({ preset_id: preset, family: "before_after" }, 1)).toBe("direct");
    expect(modeFor({ preset_id: preset, family: "explainer" }, 1)).toBe("direct");
    expect(modeFor({ preset_id: null, family: "native" }, 1)).toBe("direct");
    expect(modeFor({ preset_id: preset, family: "proof" }, 1)).toBe("preset");
  });

  it("un concepto v1 (sin dirección de arte) sigue con el formato anterior", () => {
    const preset1 = renderRequest(legacy, "1:1", "Spanish");
    expect(preset1.mode).toBe("preset");
    const prompt = preset1.input.prompt as string;
    expect(prompt).toMatch(/^Ad for the product from the reference image, kept exactly as it is/);
    expect(prompt).toContain('Headline: "equilibrio que se siente.".');
    expect(prompt).toContain('Badge: "60 CÁPSULAS VEGANAS".');
    expect(prompt).toContain("Do not print any word, logo or label on the product");
    expect(renderRequest({ ...legacy, preset_id: null }, "1:1", "Spanish").input.prompt as string).toMatch(/^Square advertising image\. The product/);
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

  it("largo por rol: el titular hasta 6 palabras y el resto en una línea", () => {
    expect(textProblems([{ role: "headline", text: "Pedicura en casa sin reservar hora nunca más" }], pricing)[0]).toMatch(/6 palabras/);
    const long = textProblems(
      [
        { role: "headline", text: "Dos rodillos" },
        { role: "subheadline", text: "Luz LED que se enciende sola al funcionar" },
        { role: "callout", text: "Diseñado para desgastar la piel dura" },
      ],
      pricing,
    );
    expect(long).toEqual([
      "«Luz LED que se enciende sola al funcionar» pasa de 40 caracteres (subheadline).",
      "«Diseñado para desgastar la piel dura» pasa de 32 caracteres (callout).",
    ]);
  });

  it("máximo de textos según la familia: 5, y 7 en comparativa y oferta", () => {
    const six = [{ role: "headline" as const, text: "Hola" }, ...Array.from({ length: 5 }, () => ({ role: "badge" as const, text: "Sí" }))];
    expect(textProblems(six, pricing, "", "hero")[0]).toMatch(/máximo es 5/);
    expect(textProblems(six, pricing, "", "proof")).toEqual([]);
  });
});

describe("conceptProblems", () => {
  const six = (): CreativeConceptsOutput => ({
    product_look: "pink jar with a white logo",
    kit: KIT,
    concepts: [
      concept(),
      concept({ family: "explainer", preset_id: null, kit_parts: ["Spare grey roller head"] }),
      concept({ family: "headline" }),
      concept({ angle: 2, family: "proof" }),
      concept({ angle: 2, family: "native", preset_id: null }),
      concept({ angle: 2, family: "offer", product_units: 3 }),
    ],
    compliance_flags: [],
  });
  const facts = { presetIds: new Set([preset]), pricing };

  it("una respuesta completa no tiene problemas", () => {
    expect(conceptProblems(six(), facts)).toEqual([]);
  });

  it("pide presets reales y un preset en las familias que lo tienen", () => {
    const base = six();
    const bad = { ...base, concepts: [...base.concepts.slice(0, 5), concept({ angle: 2, preset_id: "00000000-0000-0000-0000-000000000000" })] };
    const problems = conceptProblems(bad, facts);
    expect(problems.some((p) => /no está en PRESETS/.test(p))).toBe(true);
    expect(conceptProblems({ ...base, concepts: [...base.concepts.slice(0, 5), concept({ angle: 2, family: "offer", preset_id: null })] }, facts).some((p) => /elige uno de PRESETS/.test(p))).toBe(true);
  });

  it("reparte los conceptos por ángulo, en formatos distintos y sin concepto de retargeting obligatorio", () => {
    const base = six();
    // 3 ángulos: 2 por ángulo.
    const three = { ...base, concepts: base.concepts.map((c, i) => ({ ...c, angle: [1, 1, 2, 2, 3, 3][i] })) };
    expect(conceptProblems(three, { ...facts, slots: [1, 2, 3] }).filter((p) => /ángulo/.test(p))).toEqual([]);
    // Un ángulo que no existe y un ángulo corto de conceptos.
    const wrong = { ...base, concepts: base.concepts.map((c, i) => (i === 0 ? { ...c, angle: 3 } : c)) };
    const problems = conceptProblems(wrong, facts);
    expect(problems.some((p) => /ángulo 3, que no existe/.test(p))).toBe(true);
    expect(problems.some((p) => /El ángulo 1 necesita 3 conceptos y trae 2/.test(p))).toBe(true);
    // Mismo formato dos veces en un ángulo.
    const same = { ...base, concepts: base.concepts.map((c, i) => (i === 1 ? { ...c, family: "hero" as const, preset_id: preset } : c)) };
    expect(conceptProblems(same, facts).some((p) => /repiten familia/.test(p))).toBe(true);
  });

  it("sin presets (render con Gemini), todas las familias van directas", () => {
    const base = six();
    const direct = { ...base, concepts: base.concepts.map((c) => ({ ...c, preset_id: null })) };
    expect(conceptProblems(direct, { ...facts, presetIds: new Set<string>() })).toEqual([]);
    // Un preset inventado sigue siendo un problema.
    expect(conceptProblems(base, { ...facts, presetIds: new Set<string>() }).some((p) => /no está en PRESETS/.test(p))).toBe(true);
  });

  it("las familias de escena van sin preset", () => {
    const base = six();
    base.concepts[1] = concept({ family: "before_after" });
    expect(conceptProblems(base, facts).some((p) => /familia sin preset \(before_after\)/.test(p))).toBe(true);
  });

  it("partes del kit reales, unidades de más solo en la oferta y points_to solo en callouts", () => {
    const base = six();
    base.concepts[0] = concept({ kit_parts: ["crystal glass"], product_units: 3 });
    base.concepts[2] = concept({ family: "headline", texts: [{ role: "headline", text: "Hola", placement: "top", points_to: "the roller" }] });
    const problems = conceptProblems(base, facts);
    expect(problems.some((p) => /«crystal glass» no está en kit/.test(p))).toBe(true);
    expect(problems.some((p) => /varias unidades del producto solo en la oferta/.test(p))).toBe(true);
    expect(problems.some((p) => /solo los callouts llevan points_to/.test(p))).toBe(true);
  });
});

describe("qaVerdict", () => {
  const ok = { product_matches: true, product_issue: null, texts: [{ expected: "Hola", status: "exact" as const, found: "Hola" }], extra_texts: [], language_ok: true, mismatches: [] };

  it("pasa solo con el producto igual, los textos exactos, sin textos de más y en el idioma pedido", () => {
    expect(qaVerdict(ok).pass).toBe(true);
    const bad = qaVerdict({
      ...ok,
      texts: [{ expected: "DENTRO DE CADA CÁPSULA", status: "typo", found: "INSIDE EVERY CAPSULE" }],
      extra_texts: ["VAGINAL PROBIOTIC"],
      language_ok: false,
    });
    expect(bad.pass).toBe(false);
    expect(bad.issues).toEqual(["Tradujo algún texto a otro idioma.", "«DENTRO DE CADA CÁPSULA» quedó como «INSIDE EVERY CAPSULE».", "Agregó «VAGINAL PROBIOTIC»."]);
  });

  it("un texto que la imagen contradice no pasa", () => {
    const v = qaVerdict({ ...ok, mismatches: ["«Crema, piedra y parches»: se ven calcetines, no parches."] });
    expect(v.pass).toBe(false);
    expect(v.issues).toEqual(["«Crema, piedra y parches»: se ven calcetines, no parches."]);
  });
});
