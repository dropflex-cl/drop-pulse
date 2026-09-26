import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { ROLE_LIMITS, ROLE_PROMPT_LIMITS, TEXT_ROLES } from "./catalog";
import { CHAT_MESSAGE_MAX, CHAT_MESSAGE_PROMPT_MAX, CONTACT_NAME_MAX, CONTACT_NAME_PROMPT_MAX } from "./chat";
import { chatSystem, creativesContextText, creativesSystem, creativesTail, creativesUser, type CreativesContext } from "./prompts";
import { textProblems } from "./schemas";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const ctx: CreativesContext = {
  brief: { product_name: "Removedor de callos" } as unknown as ProductBrief,
  avatar: AVATAR,
  pricing,
  angles: [],
  presets: [],
  hasRealReviews: false,
};

describe("margen en los largos que cuenta el modelo", () => {
  it("el generador pide menos caracteres de los que valida el código", () => {
    for (const r of TEXT_ROLES) expect(ROLE_PROMPT_LIMITS[r]).toBeLessThan(ROLE_LIMITS[r]);
    const sys = creativesSystem(CL);
    expect(sys).toContain(`≤ ${ROLE_PROMPT_LIMITS.headline} caracteres`);
    expect(sys).not.toContain(`≤ ${ROLE_LIMITS.headline} caracteres`);
  });

  it("un texto entre el tope del prompt y el real sigue siendo válido", () => {
    const headline = "Pedicura eléctrica recargable con rodillos";
    expect(headline.length).toBeGreaterThan(ROLE_PROMPT_LIMITS.headline);
    expect(headline.length).toBeLessThanOrEqual(ROLE_LIMITS.headline);
    expect(textProblems([{ role: "headline", text: headline }], pricing)).toEqual([]);
  });

  it("el chat pide burbujas y nombre con margen; el editor sigue con el tope real", () => {
    expect(CHAT_MESSAGE_PROMPT_MAX).toBeLessThan(CHAT_MESSAGE_MAX);
    expect(CONTACT_NAME_PROMPT_MAX).toBeLessThan(CONTACT_NAME_MAX);
    expect(chatSystem(CL)).toContain(`Cada burbuja hasta ${CHAT_MESSAGE_PROMPT_MAX} caracteres`);
  });
});

describe("la propuesta en dos bloques (lo fijo en caché)", () => {
  it("el contexto no cambia entre intentos: los problemas van solo en el cierre", () => {
    const problems = ["«Cuarzo contra piedra pómez» pasa de 32 caracteres (callout)."];
    expect(creativesContextText(ctx)).not.toContain("respuesta anterior");
    expect(creativesTail()).not.toContain("respuesta anterior");
    expect(creativesTail(problems)).toContain(problems[0]);
    expect(creativesTail(problems)).toMatch(/Propón los conceptos/);
  });

  it("el mensaje en un solo texto es el contexto seguido del cierre", () => {
    expect(creativesUser(ctx, ["x"])).toBe(`${creativesContextText(ctx)}\n${creativesTail(["x"])}`);
    expect(creativesUser(ctx)).toMatch(/^La primera imagen es la IMAGEN BASE/);
  });
});
