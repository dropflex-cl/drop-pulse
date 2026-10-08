import { describe, expect, it } from "vitest";
import { AUTO_SHOTS, GALLERY_MIN, GALLERY_SHOTS, autoShotIds, benefitSlot, slotKind } from "./catalog";
import { pageRenderRequest } from "./render";
import { benefitAngles, normalizePlan, pageQaVerdict, planProblems, type PagePlan, type PlanShot, type StoredShot } from "./schemas";

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
  visual_world: "studio_color",
  visual_world_why: "Lo compra para ella misma y lo usa en el baño: un estudio rosado se ve como su marca de belleza.",
  brand_art: art,
  props_allowed: ["smooth matte grey river pebbles", "floating pink silk fabric"],
  props_forbidden: ["cream jars (suggests a moisturizer is included)", "ice cubes (suggests cooling)"],
  benefits: Array.from({ length: benefits }, (_, i) => ({ text: `Lima la piel dura en minutos, beneficio ${i + 1}`, angle: null })),
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

describe("tomas que se generan solas", () => {
  // Como las guarda runPageImages: position = el orden en que las entregó el director.
  const shots = [
    { id: "p", slot: "cover", position: 0 },
    ...["g1", "g2", "g3", "g4", "g5"].map((id, i) => ({ id, slot: "gallery", position: i + 1 })),
    ...[1, 2, 3].map((n) => ({ id: `b${n}`, slot: benefitSlot(n), position: 5 + n })),
  ];

  it("la portada y las primeras 4 de galería: lo que deja la etapa lista", () => {
    expect([...autoShotIds(shots)].sort()).toEqual(["g1", "g2", "g3", "g4", "p"]);
    expect(autoShotIds(shots).size).toBe(AUTO_SHOTS);
    expect(AUTO_SHOTS).toBe(1 + GALLERY_MIN);
  });

  it("la quinta de galería y los beneficios quedan propuestos", () => {
    const auto = autoShotIds(shots);
    for (const id of ["g5", "b1", "b2", "b3"]) expect(auto.has(id)).toBe(false);
  });

  it("sigue el orden del director, no el de la lista", () => {
    const shuffled = [...shots].reverse();
    expect([...autoShotIds(shuffled)].sort()).toEqual(["g1", "g2", "g3", "g4", "p"]);
  });

  it("con menos tomas de galería, genera las que haya", () => {
    expect([...autoShotIds(shots.filter((s) => !["g3", "g4", "g5"].includes(s.id)))].sort()).toEqual(["g1", "g2", "p"]);
  });
});

describe("planProblems", () => {
  it("acepta un set completo", () => {
    expect(planProblems(plan(), 2)).toEqual([]);
    expect(planProblems(plan(3))).toEqual([]);
  });

  it("los beneficios admiten ofertas y texto comercial sin topes editoriales", () => {
    expect(planProblems(plan(2))).toContain("Debe haber 3 benefits; hay 2.");
    const p = plan(3);
    p.benefits[1] = { text: "Lleva 2 y ahorra $9.990", angle: null };
    p.benefits[2] = { text: "x".repeat(200), angle: null };
    expect(planProblems(p)).toEqual([]);
  });

  it("exige una toma por beneficio aprobado y el tamaño de la galería", () => {
    const p = plan(1);
    p.shots = p.shots.filter((s, i) => !(s.slot === "gallery" && i === 2));
    const problems = planProblems(p, 2);
    expect(problems).toContain(`Debe haber ${GALLERY_SHOTS} gallery; hay ${GALLERY_SHOTS - 1}.`);
    expect(problems).toContain("Falta la toma del beneficio 2.");
  });

  it("cada ángulo aprobado tiene su beneficio, en orden; el que sobra va al diferenciador", () => {
    expect(benefitAngles([2, 1])).toEqual([1, 2, null]);
    expect(benefitAngles([1, 2, 3])).toEqual([1, 2, 3]);
    expect(benefitAngles([1, 3])).toEqual([1, 3, null]);
    const p = plan(3);
    p.benefits = p.benefits.map((b, i) => ({ ...b, angle: [1, 2, null][i] }));
    expect(planProblems(p, 3, [1, 2])).toEqual([]);
    p.benefits[0].angle = 2;
    p.benefits[1].angle = null;
    p.benefits[2].angle = 3;
    const problems = planProblems(p, 3, [1, 2]);
    expect(problems).toContain("El beneficio 1 es el del ángulo 1 (angle: 1); trae 2.");
    expect(problems).toContain("El beneficio 2 es el del ángulo 2 (angle: 2); trae null.");
    expect(problems).toContain("El beneficio 3 no es de un ángulo (angle: null); trae 3.");
  });

  it("el mundo visual se explica", () => {
    expect(planProblems(plan(3, { visual_world_why: " " }))).toContain("Falta visual_world_why: por qué ese mundo visual.");
  });

  it("la portada y el ambiente admiten textos", () => {
    const p = plan();
    p.shots[0] = shot({ slot: "cover", type: "hero_clean", name: "Portada" });
    p.shots[1] = shot({ type: "hero_mood", name: "Ambiente" });
    expect(planProblems(p, 2)).toEqual([]);
  });

  it("admite precios, packs, descuentos y condiciones COD en todos los espacios", () => {
    const p = plan();
    const commercial = ["cada una con la suya", "Uno de regalo", "Pack a $47.990", "50% de descuento", "2x1", "Lleva 3, paga 2", "Envío gratis", "Paga al recibir"];
    p.shots = p.shots.map(s => ({ ...s, texts: commercial.map(text => ({ role: "badge", text, placement: "bottom", points_to: null })) }));
    expect(planProblems(p, 2)).toEqual([]);
  });

  it("permite titulares largos y sigue revisando kit y points_to", () => {
    const p = plan();
    p.shots[2] = shot({
      kit_parts: ["pink power bank"],
      texts: [
        { role: "headline", text: "Un titular que tiene demasiadas palabras para leerse", placement: "top", points_to: null },
        { role: "badge", text: "SIN ESFUERZO", placement: "left", points_to: "the roller" },
      ],
    });
    const problems = planProblems(p, 2).join(" ");
    expect(problems).not.toContain("pasa de");
    expect(problems).toContain("kit_parts «pink power bank» no está en kit");
    expect(problems).toContain("points_to solo va en callouts");
  });

  it("sigue rechazando textos y beneficios vacíos", () => {
    const p = plan();
    p.benefits[0].text = " ";
    p.shots[0].texts = [{ role: "badge", text: "\n ", placement: "bottom", points_to: null }];
    const problems = planProblems(p, 2).join(" ");
    expect(problems).toContain("El beneficio 1 está vacío");
    expect(problems).toContain("trae un texto vacío");
  });
});

describe("textos con saltos de línea", () => {
  it("admite varias líneas en cualquier rol y el render conserva las dos de un badge", () => {
    const p = plan();
    const ok = { role: "badge" as const, text: "CABLE INCLUIDO\nNotebook o power bank", placement: "left middle pill", points_to: null };
    p.shots[2] = shot({ texts: [shot().texts[0], ok] });
    expect(planProblems(p, 2)).toEqual([]);
    p.shots[2] = shot({ texts: [shot().texts[0], { ...ok, text: "UNO\nDOS\nTRES" }, { ...ok, role: "note", text: "Una nota\nen dos" }] });
    expect(planProblems(p, 2)).toEqual([]);
    const prompt = String(pageRenderRequest("gallery", stored(shot({ texts: [ok] })), "Spanish").input.prompt);
    expect(prompt).toContain('- badge in two lines, "CABLE INCLUIDO" (bold) above "Notebook o power bank" (regular): left middle pill.');
  });

  it("el «\\n» literal que escribe el modelo es un salto de línea (la falla de producción del 2026-10-03)", () => {
    const p = plan();
    const literal = { role: "callout" as const, text: "PERILLA DE VOLUMEN\\nSube o baja el entorno", placement: "left", points_to: "the volume dial" };
    p.shots[2] = shot({ texts: [shot().texts[0], literal] });
    const fixed = normalizePlan(p);
    expect(fixed.shots[2].texts[1].text).toBe("PERILLA DE VOLUMEN\nSube o baja el entorno");
    expect(planProblems(fixed, 2)).toEqual([]);
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

  it("el pedido abre con el mundo visual; sin mundo (tomas de antes), el estudio de siempre", () => {
    const of = (world?: StoredShot["world"]) => String(pageRenderRequest("gallery", { ...stored(shot()), world }, "Spanish").input.prompt);
    expect(of()).toMatch(/^Square premium brand campaign image/);
    expect(of("studio_color")).toBe(of());
    expect(of("real_home")).toMatch(/^Square premium lifestyle photo .* real, lived-in Latin American home/);
    expect(of("clean_explainer")).toMatch(/^Square clean explanatory product image/);
    expect(of("native_phone")).toMatch(/^Square authentic smartphone photo/);
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

  it("la portada conserva la oferta COD y todas las líneas pedidas al renderizar", () => {
    const texts: PlanShot["texts"] = [{ role: "badge", text: "Pack de 3 a $47.990\nEnvío gratis\nPaga al recibir", placement: "bottom", points_to: null }];
    const prompt = String(pageRenderRequest("cover", stored(shot({ slot: "cover", type: "hero_clean", texts })), "Spanish").input.prompt);
    expect(prompt).toContain('in 3 lines, in order: "Pack de 3 a $47.990" / "Envío gratis" / "Paga al recibir"');
    expect(prompt).not.toContain("NO TEXT");
    expect(prompt).toContain("TEXT RULES");
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
