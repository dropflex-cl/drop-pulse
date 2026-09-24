import { describe, expect, it } from "vitest";
import { GALLERY_SHOTS, benefitSlot, slotKind } from "./catalog";
import { pageRenderRequest } from "./render";
import { pageQaVerdict, planProblems, type PagePlan, type PlanShot, type StoredShot } from "./schemas";

const art = { palette: "saturated blush pink scene, deep berry text", typography: "heavy rounded sans headline", mood: "fresh, bold, premium" };

const shot = (over: Partial<PlanShot> = {}): PlanShot => ({
  slot: "gallery",
  benefit: null,
  type: "infographic",
  name: "Infografía",
  look: "El aparato grande con cuatro llamadas.",
  art,
  scene: "Saturated pink studio background, droplets in the air, smooth matte grey river pebbles in the foreground.",
  layout: "The device large in the center filling 60% of the height, headline across the top third.",
  product_units: 1,
  kit_parts: [],
  hands: false,
  texts: [
    { role: "headline", text: "Así trabaja el rodillo", placement: "top, two lines, huge heavy rounded sans, deep berry", points_to: null },
    { role: "callout", text: "Rodillo de arena de cuarzo", placement: "left top, bold, one line", points_to: "the grey roller head" },
  ],
  ...over,
});

const plan = (benefits = 2, over: Partial<PagePlan> = {}): PagePlan => ({
  product_look: "Slim pink electric foot file with a rose-gold band and a grey quartz roller head",
  kit: ["spare grey roller head", "white USB cable"],
  brand_art: art,
  props_allowed: ["smooth matte grey river pebbles", "floating pink silk fabric"],
  props_forbidden: ["cream jars (suggests a moisturizer is included)", "ice cubes (suggests cooling)"],
  shots: [
    shot({ slot: "cover", type: "hero_clean", name: "Portada", texts: [] }),
    shot({ type: "hero_mood", name: "Ambiente", texts: [] }),
    ...Array.from({ length: GALLERY_SHOTS - 1 }, (_, i) => shot({ name: `Galería ${i + 2}` })),
    ...Array.from({ length: benefits }, (_, i) => shot({ slot: "benefit", benefit: i + 1, type: "benefit", name: `Beneficio ${i + 1}`, texts: [shot().texts[0]] })),
  ],
  ...over,
});

const stored = (s: PlanShot, p = plan()): StoredShot => ({ ...s, product_look: p.product_look, kit: p.kit, props_forbidden: p.props_forbidden });

describe("espacios", () => {
  it("reconoce portada, galería y beneficios", () => {
    expect(slotKind("cover")).toBe("cover");
    expect(slotKind("gallery")).toBe("gallery");
    expect(slotKind(benefitSlot("abc"))).toBe("benefit");
    expect(slotKind("otra")).toBeNull();
  });
});

describe("planProblems", () => {
  it("acepta un set completo", () => {
    expect(planProblems(plan(), 2)).toEqual([]);
  });

  it("exige una toma por beneficio aprobado y el tamaño de la galería", () => {
    const p = plan(1);
    p.shots = p.shots.filter((s, i) => !(s.slot === "gallery" && i === 2));
    const problems = planProblems(p, 2);
    expect(problems).toContain(`Debe haber ${GALLERY_SHOTS} gallery; hay ${GALLERY_SHOTS - 1}.`);
    expect(problems).toContain("Falta la toma del beneficio 2.");
  });

  it("la portada y el ambiente van sin textos", () => {
    const p = plan();
    p.shots[0] = shot({ slot: "cover", type: "hero_clean", name: "Portada" });
    p.shots[1] = shot({ type: "hero_mood", name: "Ambiente" });
    const problems = planProblems(p, 2);
    expect(problems.some((x) => x.includes("la portada va sin textos"))).toBe(true);
    expect(problems.some((x) => x.includes("hero_mood va sin textos"))).toBe(true);
  });

  it("rechaza ofertas, precios y titulares en minúscula", () => {
    const p = plan();
    p.shots[2] = shot({
      texts: [
        { role: "headline", text: "cada una con la suya", placement: "top", points_to: null },
        { role: "badge", text: "Uno de regalo", placement: "bottom", points_to: null },
        { role: "badge", text: "Pack a $47.990", placement: "bottom", points_to: null },
      ],
    });
    const problems = planProblems(p, 2).join(" ");
    expect(problems).toContain("empieza con minúscula");
    expect(problems).toContain("«Uno de regalo» trae un precio, un descuento o una oferta");
    expect(problems).toContain("«Pack a $47.990» trae un precio");
  });

  it("revisa largos, kit y points_to", () => {
    const p = plan();
    p.shots[2] = shot({
      kit_parts: ["pink power bank"],
      texts: [
        { role: "headline", text: "Un titular que tiene demasiadas palabras para leerse", placement: "top", points_to: null },
        { role: "badge", text: "SIN ESFUERZO", placement: "left", points_to: "the roller" },
      ],
    });
    const problems = planProblems(p, 2).join(" ");
    expect(problems).toContain("pasa de 6 palabras");
    expect(problems).toContain("kit_parts «pink power bank» no está en kit");
    expect(problems).toContain("points_to solo va en callouts");
  });
});

describe("badges de 2 líneas", () => {
  it("cada línea cuenta por separado y el render las separa", () => {
    const p = plan();
    const ok = { role: "badge" as const, text: "CABLE INCLUIDO\nNotebook o power bank", placement: "left middle pill", points_to: null };
    p.shots[2] = shot({ texts: [shot().texts[0], ok] });
    expect(planProblems(p, 2)).toEqual([]);
    p.shots[2] = shot({ texts: [shot().texts[0], { ...ok, text: "UNO\nDOS\nTRES" }, { ...ok, role: "note", text: "Una nota\nen dos" }] });
    const problems = planProblems(p, 2).join(" ");
    expect(problems).toContain("tiene 3 líneas; máximo 2");
    expect(problems).toContain("tiene 2 líneas; va en una");
    const prompt = String(pageRenderRequest("gallery", stored(shot({ texts: [ok] })), "Spanish").input.prompt);
    expect(prompt).toContain('- badge in two lines, "CABLE INCLUIDO" (bold) above "Notebook o power bank" (regular): left middle pill.');
  });
});

describe("pageRenderRequest", () => {
  it("la galería va en 1:1, directa, sin reescritura y con los textos ubicados", () => {
    const req = pageRenderRequest("gallery", stored(shot()), "Spanish");
    expect(req.ratio).toBe("1:1");
    expect(req.input).toMatchObject({ aspect_ratio: "1:1", enhance_prompt: false, quality: "low", resolution: "1k" });
    expect(req.input).not.toHaveProperty("preset_id");
    const prompt = String(req.input.prompt);
    expect(prompt).toContain("PRODUCT: Slim pink electric foot file");
    expect(prompt).toContain('callout "Rodillo de arena de cuarzo": left top, bold, one line, connected by a thin line that ends in a small dot exactly on the grey roller head.');
    expect(prompt).toContain("text printed on the box never goes on the product");
    expect(prompt).toContain("DO NOT INCLUDE: cream jars, ice cubes.");
    expect(prompt).toContain("TEXT RULES");
  });

  it("los beneficios van en 3:4 nativo (Flare no tiene 4:5)", () => {
    const req = pageRenderRequest(benefitSlot("x"), stored(shot({ slot: "benefit", benefit: 1, type: "benefit" })), "Spanish");
    expect(req.ratio).toBe("3:4");
    expect(req.input.aspect_ratio).toBe("3:4");
    expect(String(req.input.prompt)).toMatch(/^Vertical 3:4 /);
  });

  it("sin textos pide una imagen sin palabras; con manos, nunca una cara", () => {
    const prompt = String(pageRenderRequest("gallery", stored(shot({ type: "in_use", texts: [], hands: true })), "Spanish").input.prompt);
    expect(prompt).toContain("NO TEXT");
    expect(prompt).not.toContain("TEXT RULES");
    expect(prompt).toContain("never a face");
  });

  it("varias unidades salen idénticas y el kit se nombra", () => {
    const prompt = String(pageRenderRequest("gallery", stored(shot({ product_units: 3, kit_parts: ["white USB cable"] })), "Spanish").input.prompt);
    expect(prompt).toContain("exactly 3 identical units of it, same size");
    expect(prompt).toContain("Also show, exactly as in the reference image: white USB cable.");
  });
});

describe("pageQaVerdict", () => {
  const ok = { product_matches: true, product_issue: null, texts: [], extra_texts: [], language_ok: true, mismatches: [], misleading_props: [], units_consistent: true, anatomy_ok: true };

  it("pasa sin problemas", () => {
    expect(pageQaVerdict(ok)).toMatchObject({ pass: true, issues: [] });
  });

  it("junta cada motivo en español", () => {
    const v = pageQaVerdict({
      ...ok,
      texts: [{ expected: "Así trabaja el rodillo", status: "typo", found: "Asi trabaja el rodilo" }],
      extra_texts: ["ELECTRONIC PEDICURE TOOL"],
      misleading_props: ["El power bank rosado parece incluido en el kit."],
      units_consistent: false,
      anatomy_ok: false,
    });
    expect(v.pass).toBe(false);
    expect(v.issues).toEqual([
      "«Así trabaja el rodillo» quedó como «Asi trabaja el rodilo».",
      "Agregó «ELECTRONIC PEDICURE TOOL».",
      "Prop que confunde: El power bank rosado parece incluido en el kit.",
      "Las unidades del producto no son iguales entre sí.",
      "Manos o pies deformes.",
    ]);
  });
});
