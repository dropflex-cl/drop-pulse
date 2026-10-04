import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { ROLE_LIMITS, ROLE_PROMPT_LIMITS, TEXT_ROLES } from "./catalog";
import { CHAT_MESSAGE_MAX, CHAT_MESSAGE_PROMPT_MAX, CONTACT_NAME_MAX, CONTACT_NAME_PROMPT_MAX } from "./chat";
import { angleForPrompt } from "@/lib/angles/approved";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { artContext, artSystem, chatSystem, chatUser, creativesContextText, creativesSystem, creativesTail, creativesUser, type CreativesContext } from "./prompts";
import { textProblems } from "./schemas";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const brief = { product_name: "Removedor de callos", what_it_does: "Lima los callos con un rodillo.", key_facts: [{ label: "Batería", value: "Recargable" }], proof: { real_reviews: [], real_expert: null } } as unknown as ProductBrief;
const payload = {
  core_message: "Pies suaves sin ir a la podóloga",
  offer_layer: "2 por $37.490 · Paga al recibir",
  hooks: [{ text: "Mis talones raspaban las sábanas.", on_screen: "TALONES QUE RASPAN", visual_first_3s: "Pie sobre la sábana", policy_ok: true }],
  recommended_hook: 0,
} as unknown as AngleBriefPayload;
const ctx: CreativesContext = {
  brief,
  avatar: AVATAR,
  pricing,
  angles: [angleForPrompt({ slot: 1, frame: "unique_mechanism", title: "Talones que raspan", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "", hook: "Mis talones raspaban las sábanas." }, payload)],
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
    expect(creativesTail(problems)).toMatch(/Propón 6 anuncios de imagen/);
  });

  it("el mensaje en un solo texto es el contexto seguido del cierre", () => {
    expect(creativesUser(ctx, ["x"])).toBe(`${creativesContextText(ctx)}\n${creativesTail(["x"])}`);
    expect(creativesUser(ctx)).toMatch(/^PRODUCTO: Removedor de callos/);
  });
});

describe("dos pasos: los conceptos y la dirección de arte", () => {
  it("los conceptos reciben texto corto: sin la ficha ni el cliente ideal en JSON, sin presets ni dirección de arte", () => {
    const u = creativesContextText(ctx);
    expect(u).not.toMatch(/"(what_it_does|voice_of_customer|trigger_moments|summary)"\s*:/);
    expect(u).not.toMatch(/^\s*[{[]/m);
    expect(u).toContain("- Batería: Recargable");
    expect(u).toContain(`QUIÉN COMPRA, SEGÚN EL COMERCIANTE: ${AVATAR.summary}`);
    expect(u).toContain("Ángulo 1: «Talones que raspan»");
    expect(u).toContain("«TALONES QUE RASPAN» (se dice: «Mis talones raspaban las sábanas.»)");
    expect(u).toContain("- La oferta: 2 por $37.490");
    expect(u).not.toMatch(/PRESETS|palette|layout/);
    const sys = creativesSystem(CL);
    expect(sys.split("\n").length).toBeLessThan(25);
    expect(sys).not.toMatch(/palette|layout|product_look|kit_parts|EJEMPLO/);
  });

  it("la dirección de arte recibe los conceptos con sus textos, los presets y, si ya se sabe, cómo se ve el producto", () => {
    const concepts = [{ angle: 1, family: "hero" as const, name: "Suave", idea: "El producto sobre una toalla.", why: "", texts: [{ role: "headline" as const, text: "Talones suaves" }] }];
    const fresh = artContext({ brief, concepts, presets: [], hasRealReviews: false });
    expect(fresh).toContain("Describe primero product_look");
    expect(fresh).toContain("PRESETS: ninguno");
    expect(fresh).toContain("1. hero (Producto hero; presets del grupo Hero Spotlight) · «Suave»: El producto sobre una toalla.");
    expect(fresh).toContain("- headline: «Talones suaves»");
    const known = artContext({ brief, concepts, presets: [], hasRealReviews: false, look: { product_look: "pink foot file", kit: ["spare roller"] } });
    expect(known).toContain("CÓMO SE VE (ya descrito): pink foot file");
    expect(known).not.toContain("Describe primero");
    expect(artSystem(CL)).toContain("No cambias los textos");
  });

  it("el chat recibe texto corto y las reseñas para citar", () => {
    const u = chatUser({ brief, avatar: AVATAR, angle: ctx.angles[0], currency: "CLP", reviews: ["Llegó rápido y me sirvió"] });
    expect(u).not.toMatch(/"(what_it_does|voice_of_customer|trigger_moments|summary)"\s*:/);
    expect(u).toContain("1. Llegó rápido y me sirvió");
    expect(u).toContain("«Mis talones raspaban las sábanas.»");
  });
});
