import { describe, expect, it } from "vitest";
import { angleForPrompt } from "@/lib/angles/approved";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { WRITTEN, toWrite } from "./page-schema";
import { copyProgress, enabledLabel } from "./progress";
import { copySystem, copyUser, type CopyContext } from "./prompts";
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
    expect(toWrite([], 3)).toEqual(["listing", ...ids]);
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

describe("prompts del redactor de página", () => {
  const brief = (core: string) => ({ core_message: core, hooks: [{ text: "gancho" }], objection_handling: [{ objection: "¿Y si no me queda?", answer: "Talla única" }] }) as unknown as AngleBriefPayload;
  const ctx: CopyContext = {
    brief: { product_name: "Corrector", proof: { guarantee_days: null } } as unknown as ProductBrief,
    avatar: AVATAR,
    pricing,
    angles: [
      angleForPrompt({ slot: 1, frame: "unique_mechanism", title: "No es la silla", pain_or_desire: "Espalda cargada", segment: "Oficinistas", promise: "Hombros atrás", trigger_moment: "A las 4 de la tarde", competition: "" }, brief("La postura se corrige sola")),
      angleForPrompt({ slot: 2, frame: "offer", title: "", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "" }, brief("Lleva 2")),
    ],
    differentiator: { versus: "una faja", claim: "Lleva los hombros atrás", basis: "" },
    shopify: { title: "Corrector Postura Unisex", description: null },
    countryCode: "CL",
    freeShipping: true,
    returnDays: null,
    reviews: [{ id: "rv_1", rating: 5, text: "Me llegó rápido y se ajusta bien.", country: "CL" }],
    write: ["listing", "inventory", "faq-and-text"],
  };

  it("el system depende solo del mercado y trae la guía de cada componente", () => {
    const sys = copySystem(CL);
    expect(sys).toBe(copySystem(CL));
    for (const c of WRITTEN) {
      expect(sys).toContain(`### ${c.id} (${c.name})`);
      expect(sys).toContain(c.objection);
    }
    expect(sys).toContain("Reparte las objeciones");
    expect(sys).toContain("{return_days}");
  });

  it("el usuario lleva precio, políticas reales, reseñas con id, los 2 ángulos y qué escribir", () => {
    const u = copyUser(ctx);
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("- Envío gratis a todo Chile (policy free_shipping).");
    expect(u).toContain("Sin política de cambios cargada");
    expect(u).toContain("- rv_1 · 5★ · CL: Me llegó rápido y se ajusta bien.");
    expect(u).toContain("ÁNGULOS DE VENTA (2");
    expect(u).toContain("Ángulo 1: No es la silla (forma: Mecanismo único)");
    expect(u).toContain("Ángulo 2: Oferta (forma: Oferta)");
    expect(u).toContain("Frente a una faja: Lleva los hombros atrás");
    expect(copySystem(CL)).toContain("UNA PÁGINA PARA TODOS LOS ÁNGULOS");
    expect(copySystem(CL)).not.toMatch(/ángulo PRINCIPAL manda/);
    expect(u).toContain("¿Y si no me queda?");
    expect(u).not.toContain("gancho");
    expect(u).toContain("- listing: la ficha.");
    expect(u).toContain("- components: inventory, faq-and-text.");
    expect(u).not.toContain("YA APROBADO");
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
    expect(u).not.toContain("Escribe la página del producto.");
  });

  it("sin reseñas aprobadas lo dice", () => {
    expect(copyUser({ ...ctx, reviews: [] })).toContain("(ninguna: no escribas componentes que citen reseñas)");
  });
});
