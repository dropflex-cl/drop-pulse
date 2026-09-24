import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { WRITTEN, toWrite } from "./page-schema";
import { copyProgress, enabledLabel } from "./progress";
import { copySystem, copyUser, type CopyContext } from "./prompts";
import { allowedAmounts, amountsIn } from "./schemas";

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
    primary: { name: "Mecanismo único", payload: brief("La postura se corrige sola") },
    secondary: { name: "Oferta", payload: brief("Lleva 2") },
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
    expect(u).toContain("ÁNGULO PRINCIPAL: Mecanismo único");
    expect(u).toContain("¿Y si no me queda?");
    expect(u).not.toContain("gancho");
    expect(u).toContain("- listing: la ficha.");
    expect(u).toContain("- components: inventory, faq-and-text.");
    expect(u).not.toContain("YA APROBADO");
  });

  it("al reescribir lleva lo aprobado; al reintentar, qué falló", () => {
    const u = copyUser({ ...ctx, write: ["faq-and-text"], returnDays: 30, approved: [{ component: "listing", content: { title: "Corrector ajustable" } }] }, ["faq-and-text.items: falta una pregunta de envio"]);
    expect(u).toContain('- listing: {"title":"Corrector ajustable"}');
    expect(u).toContain("- listing: ya aprobada, responde null.");
    expect(u).toContain("{return_days} días (policy returns)");
    expect(u).toContain("Tu respuesta anterior no cumple las reglas: faq-and-text.items: falta una pregunta de envio");
  });

  it("sin reseñas aprobadas lo dice", () => {
    expect(copyUser({ ...ctx, reviews: [] })).toContain("(ninguna: no escribas componentes que citen reseñas)");
  });
});
