import { describe, expect, it } from "vitest";
import { angleForPrompt } from "@/lib/angles/approved";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { WRITTEN, toWrite } from "./page-schema";
import { copyProgress, enabledLabel } from "./progress";
import { argumentContext, argumentProblems, argumentSystem, argumentTail, argumentText, type ArgumentContext, type PageArgument } from "./argument";
import { componentBrief, copySystem, copyUser, policiesBlock, type CopyContext } from "./prompts";
import { allowedAmounts, amountAllowed, amountsIn } from "./schemas";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;

describe("montos de la página", () => {
  it("precio, tachado, ahorro y cada pack", () => {
    const amounts = allowedAmounts(pricing);
    expect(amounts).toContain(24990);
    expect(amounts).toContain(32990);
    expect(amounts).toContain(8000);
    expect(amounts).toContain(pricing.packs[1].price);
  });

  it("acepta el redondeo de un monto permitido, no un monto inventado", () => {
    const amounts = allowedAmounts(pricing);
    const pack3 = pricing.packs[2].price;
    expect(amountAllowed(Math.round(pack3 / 1000) * 1000, amounts)).toBe(true);
    expect(amountAllowed(Math.round(pricing.packs[2].perUnitPrice), amounts)).toBe(true);
    expect(amountAllowed(12345, amounts)).toBe(false);
    expect(amounts).toContain(pricing.salePrice - pricing.packs[1].perUnitPrice);
  });

  it("lee los montos con el símbolo de la moneda", () => {
    expect(amountsIn("2 por $39.990 · antes $ 49.990", "CLP")).toEqual([39990, 49990]);
    expect(amountsIn("Llega en 3 días", "CLP")).toEqual([]);
  });
});

describe("qué escribir", () => {
  const ids = WRITTEN.map((c) => c.id);

  it("todo, menos lo que necesita reseñas que no hay", () => {
    const none = toWrite([], 0);
    expect(none[0]).toBe("listing");
    expect(none).not.toContain("review-slider");
    expect(none).not.toContain("review-stars");
    expect(toWrite([], 2)).not.toContain("review-stars");
    // review-wall pide 4: un muro de 2 por fila con menos se ve vacío.
    expect(toWrite([], 3)).toEqual(["listing", ...ids.filter((id) => id !== "review-wall")]);
    expect(toWrite([], 4)).toEqual(["listing", ...ids]);
  });

  it("al reescribir, sin lo aprobado", () => {
    const rows = [
      { component: "listing", status: "approved" },
      { component: "inventory", status: "approved" },
      { component: "faq-and-text", status: "generated" },
    ];
    const write = toWrite(rows, 5);
    expect(write).not.toContain("listing");
    expect(write).not.toContain("inventory");
    expect(write).toContain("faq-and-text");
  });
});

describe("progreso de la página", () => {
  it("la etapa termina con la ficha aprobada; los componentes cuentan en el resumen", () => {
    expect(copyProgress([])).toMatchObject({ listing: "missing", complete: false, total: 0 });
    const items = [
      { component: "listing", status: "generado" as const, enabled: true },
      { component: "inventory", status: "aprobado" as const, enabled: true },
      { component: "faq-and-text", status: "generado" as const, enabled: false },
    ];
    expect(copyProgress(items)).toEqual({ total: 2, enabled: 1, listing: "pending", complete: false });
    expect(copyProgress([{ ...items[0], status: "aprobado" }, ...items.slice(1)]).complete).toBe(true);
    expect(enabledLabel(0)).toBe("Sin componentes en la página");
    expect(enabledLabel(1)).toBe("1 componente en la página");
    expect(enabledLabel(4)).toBe("4 componentes en la página");
  });
});

describe("argumento de la página (page_argument)", () => {
  const payload = (core: string) => ({ core_message: core, hooks: [{ text: "gancho del anuncio" }], objection_handling: [] }) as unknown as AngleBriefPayload;
  const brief = {
    product_name: "Corrector",
    what_it_does: "Lleva los hombros atrás.",
    key_facts: [{ label: "Material", value: "Neopreno" }],
    known_objections: ["¿Se nota bajo la ropa?"],
    proof: { guarantee_days: null, real_reviews: [], real_expert: null },
  } as unknown as ProductBrief;
  const angles = [
    angleForPrompt({ slot: 1, frame: "unique_mechanism", title: "No es la silla", pain_or_desire: "Espalda cargada", segment: "Oficinistas", promise: "Hombros atrás", trigger_moment: "", competition: "", hook: "No es tu silla: son tus hombros.", speaks_to: "buyer" }, payload("La postura se corrige sola")),
    angleForPrompt({ slot: 2, frame: "offer", title: "Lleva 2", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "" }, payload("Uno para la oficina y otro para la casa")),
  ];
  const ctx: ArgumentContext = { brief, avatar: AVATAR, pricing, angles, differentiator: { versus: "una faja", claim: "Lleva los hombros atrás", basis: "" }, reviews: ["Me llegó rápido"], policies: policiesBlock({ countryCode: "CL", freeShipping: true, returnDays: null }) };
  const good = (): PageArgument => ({
    headline: "El corrector que lleva los hombros atrás bajo la ropa",
    promise: "Una faja aprieta la cintura; este tira de los hombros.",
    angles: [
      { slot: 1, moment: "A las 4 de la tarde ya estoy encorvado", benefit: "Hombros atrás con cintas cruzadas", answer: "¿Se nota? No, va bajo la camisa." },
      { slot: 2, moment: "Lo dejo en la oficina y en la casa no tengo", benefit: "El segundo sale a mitad de precio", answer: "¿Para qué dos? Uno en cada lugar." },
    ],
    extra_moment: "Al levantarme del escritorio estiro la espalda con las dos manos",
    objections: Array.from({ length: 5 }, (_, i) => ({ objection: `Duda ${i}`, answer: "Respuesta" })),
    close: `2 por $${pricing.packs[1].price.toLocaleString("es-CL")} · Paga al recibir`,
  });
  const facts = { slots: [1, 2], currency: "CLP", amounts: allowedAmounts(pricing) };

  it("el system es corto, sin componentes ni topes de caracteres", () => {
    const sys = argumentSystem(CL);
    expect(sys).toBe(argumentSystem(CL));
    expect(sys.split("\n").length).toBeLessThan(30);
    expect(sys).toContain("redactor de respuesta directa");
    expect(sys).not.toMatch(/caracteres|pain-block|benefit-usps|\{return_days\}/);
  });

  it("el contexto es texto corto: sin la ficha ni el cliente ideal en JSON, sin los ganchos", () => {
    const u = argumentContext(ctx);
    expect(u).not.toMatch(/"(what_it_does|voice_of_customer|trigger_moments|summary)"\s*:/);
    expect(u).not.toMatch(/^\s*[{[]/m);
    expect(u).toContain("PRODUCTO: Corrector");
    expect(u).toContain(`QUIÉN COMPRA, SEGÚN EL COMERCIANTE: ${AVATAR.summary}`);
    expect(u).toContain(`«${AVATAR.voice_of_customer[0]}»`);
    expect(u).not.toContain(AVATAR.formula);
    expect(u).toContain("EN QUÉ SE DIFERENCIA: frente a una faja, Lleva los hombros atrás");
    expect(u).toContain("LOS ANUNCIOS QUE TRAEN TRÁFICO (2 ángulos)");
    expect(u).toContain("Ángulo 1: «No es la silla»");
    expect(u).toContain("- Idea central: Uno para la oficina y otro para la casa");
    expect(u).not.toContain("gancho del anuncio");
    expect(u).toContain("¿Se nota bajo la ropa?");
    expect(u).toContain("Envío gratis a todo Chile");
    expect(argumentTail(["Trae 3 dudas."])).toMatch(/Trae 3 dudas[\s\S]*Escribe el argumento/);
  });

  it("revisa un ángulo por slot, el momento extra con 2, las dudas, los montos y las promesas", () => {
    expect(argumentProblems(good(), facts)).toEqual([]);
    const bad = { ...good(), angles: good().angles.slice(0, 1), extra_moment: null, objections: [], close: "Antes $12.345. Cura el dolor." };
    const p = argumentProblems(bad, facts).join(" ");
    expect(p).toMatch(/uno por ángulo: 1, 2/);
    expect(p).toMatch(/extra_moment/);
    expect(p).toMatch(/Trae 0 dudas/);
    expect(p).toMatch(/12345/);
    expect(p).toMatch(/promesa prohibida/);
    expect(argumentProblems({ ...good(), extra_moment: null }, { ...facts, slots: [1, 2, 3] }).join(" ")).toMatch(/uno por ángulo: 1, 2, 3/);
  });

  it("el argumento llega a los componentes como texto", () => {
    const t = argumentText(good());
    expect(t).toContain("Titular: El corrector");
    expect(t).toContain("- Ángulo 2. Momento: Lo dejo en la oficina");
    expect(t).toContain("- Otro momento (slot 3): Al levantarme");
    expect(t).toContain("Cierre: 2 por");
    expect(argumentText({ ...good(), angles: [...good().angles, { ...good().angles[0], slot: 3 }] })).not.toContain("Otro momento");
  });
});

describe("prompts del redactor de página (page_copy)", () => {
  const ctx: CopyContext = {
    brief: { product_name: "Corrector", what_it_does: "Lleva los hombros atrás.", key_facts: [], proof: { guarantee_days: null, real_reviews: [] } } as unknown as ProductBrief,
    pricing,
    argument: {
      headline: "El corrector que lleva los hombros atrás",
      promise: "Una faja aprieta la cintura; este tira de los hombros.",
      angles: [{ slot: 1, moment: "A las 4 ya estoy encorvado", benefit: "Hombros atrás", answer: "¿Se nota? No." }],
      extra_moment: null,
      objections: [{ objection: "¿Y si no me queda?", answer: "Talla única" }],
      close: "Paga al recibir",
    },
    shopify: { title: "Corrector Postura Unisex", description: null },
    countryCode: "CL",
    freeShipping: true,
    returnDays: null,
    reviews: [{ id: "rv_1", rating: 5, text: "Me llegó rápido y se ajusta bien.", country: "CL" }],
    write: ["listing", "inventory", "faq-and-text"],
  };

  it("el system depende solo del mercado y trae una guía de 3 líneas por componente, sin su manual", () => {
    const sys = copySystem(CL);
    expect(sys).toBe(copySystem(CL));
    for (const c of WRITTEN) {
      expect(sys).toContain(componentBrief(c));
      expect(componentBrief(c).split("\n")).toHaveLength(3);
      expect(sys).toContain(c.objection);
      // Sin el ejemplo de otro producto ni las reglas del manual.
      expect(sys).not.toContain(JSON.stringify(c.examples[0]));
      for (const f of c.forbidden) expect(sys).not.toContain(f);
    }
    expect(sys).toContain("CÓMO REPARTIR");
    expect(sys).toContain("{return_days}");
    expect(sys.length).toBeLessThan(15000);
  });

  it("la forma de un componente sale de su esquema", () => {
    const pain = WRITTEN.find((c) => c.id === "pain-block")!;
    expect(componentBrief(pain)).toMatch(/^### pain-block \(DropFlex · Lo que te pasa\)\nDónde va: Primer bloque del cuerpo[^\n]*\nForma: heading: Una pregunta de reconocimiento, sin diagnosticar\. · moments: Exactamente 3 momentos/);
  });

  it("el usuario lleva el producto, el precio, las políticas, las reseñas con id, el argumento y qué escribir: sin la ficha ni el cliente ideal en JSON", () => {
    const u = copyUser(ctx);
    expect(u).not.toMatch(/"(what_it_does|voice_of_customer|trigger_moments|summary)"\s*:/);
    expect(u).toContain("PRODUCTO: Corrector");
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("- Envío gratis a todo Chile (policy free_shipping).");
    expect(u).toContain("Sin política de cambios cargada");
    expect(u).toContain("- rv_1 · 5★ · CL: Me llegó rápido y se ajusta bien.");
    expect(u).toContain("ARGUMENTO DE VENTA");
    expect(u).toContain("Titular: El corrector que lleva los hombros atrás");
    expect(u).toContain("¿Y si no me queda? → Talla única");
    expect(u).toContain("- listing: la ficha.");
    expect(u).toContain("- components: inventory, faq-and-text.");
    expect(u).not.toContain("YA APROBADO");
    expect(u).toMatch(/Reparte el argumento en la página del producto\.$/);
  });

  it("al reescribir lleva lo aprobado; al reintentar, su respuesta anterior y qué falló", () => {
    const u = copyUser(
      { ...ctx, write: ["faq-and-text"], returnDays: 30, approved: [{ component: "listing", content: { title: "Corrector ajustable" } }] },
      { previous: { listing: null, components: { "faq-and-text": { heading: "Dudas" } } }, problems: ["faq-and-text.items: falta una pregunta de envio"] },
    );
    expect(u).toContain('- listing: {"title":"Corrector ajustable"}');
    expect(u).toContain("- listing: ya aprobada, responde null.");
    expect(u).toContain("{return_days} días (policy returns)");
    expect(u).toContain('TU RESPUESTA ANTERIOR\n{"listing":null,"components":{"faq-and-text":{"heading":"Dudas"}}}');
    expect(u).toContain("No cumple las reglas: faq-and-text.items: falta una pregunta de envio");
    expect(u).toContain("Corrige solo eso y deja igual todo lo demás.");
    expect(u).not.toContain("Reparte el argumento en la página del producto.");
  });

  it("sin reseñas aprobadas lo dice", () => {
    expect(copyUser({ ...ctx, reviews: [] })).toContain("(ninguna: no escribas componentes que citen reseñas)");
  });
});
