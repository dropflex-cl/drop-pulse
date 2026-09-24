import { describe, expect, it } from "vitest";
import * as z from "zod/v4";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { FIELD_LABELS, ICON_LABELS, emptyValue, formFields, type FormField } from "./form";
import { ICON_KEYS } from "@/lib/shopify/components/define";
import { LISTING, listingSchema, type Listing } from "./listing";
import { WRITTEN, loosen, pageProblems, pageSchema, schemaProblems, textsOf, type PageFacts, type PageOutput } from "./page-schema";
import { allowedAmounts } from "./schemas";

const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;

const LISTING_EXAMPLE: Listing = {
  title: "Corrector de postura ajustable para trabajar sentado",
  short_name: "Corrector de postura",
  short_description: "Te ayuda a mantener la espalda recta mientras trabajas. Se ajusta con velcro y no se nota bajo la ropa.",
  offer_line: `2 por $${pricing.packs[1].price.toLocaleString("es-CL")} · Paga al recibir`,
  seo_title: "Corrector de postura ajustable para la oficina",
  seo_description: "Corrector de postura con ajuste de velcro y tela respirable. Paga al recibir en tu casa.",
};

const ALL = [LISTING, ...WRITTEN.map((c) => c.id)];

/** Una página válida: la ficha y el primer ejemplo de cada componente. */
function page(): PageOutput {
  return { listing: { ...LISTING_EXAMPLE }, components: Object.fromEntries(WRITTEN.map((c) => [c.id, structuredClone(c.examples[0])])) };
}

const reviewIds = WRITTEN.flatMap((c) => textsOf(c.examples[0], [c.id]).filter((t) => t.path.endsWith("review_id")).map((t) => t.text));
const facts: PageFacts = { currency: "CLP", amounts: allowedAmounts(pricing), reviewIds };

describe("el esquema de la llamada única", () => {
  it("todos los componentes con texto tienen versión holgada", () => {
    for (const c of WRITTEN) expect(() => loosen(c.content), c.id).not.toThrow();
    expect(WRITTEN.length).toBe(CATALOG.filter((c) => c.metafield).length);
  });

  // La salida estructurada compila el esquema a una gramática: con muchos opcionales o uniones, o un
  // esquema muy largo, la API lo rechaza. Si esto falla, se compactan los content.ts (describe más
  // cortos, menos opcionales), no se parte la llamada.
  it("cabe en la salida estructurada", () => {
    const js = z.toJSONSchema(pageSchema(ALL)) as Record<string, unknown>;
    const acc = { optional: 0, unions: 0 };
    const walk = (n: unknown) => {
      if (!n || typeof n !== "object") return;
      const o = n as { type?: string; properties?: object; required?: string[]; anyOf?: unknown[] };
      if (o.type === "object" && o.properties) acc.optional += Object.keys(o.properties).length - (o.required?.length ?? 0);
      if (o.anyOf) acc.unions++;
      Object.values(o).forEach(walk);
    };
    walk(js);
    expect(JSON.stringify(js).length).toBeLessThan(32_000);
    expect(acc.optional).toBeLessThanOrEqual(24);
    expect(acc.unions).toBeLessThanOrEqual(16);
  });

  it("sin límites en la gramática: van escritos en la descripción", () => {
    const js = JSON.stringify(z.toJSONSchema(pageSchema(ALL)));
    expect(js).not.toMatch(/"(minLength|maxLength|minItems|maxItems|pattern)"/);
    expect(js).toContain("(10 a 70 caracteres)");
  });

  it("pide solo lo que falta: la ficha aprobada va como null", () => {
    const s = pageSchema(["inventory"]);
    const parsed = s.safeParse({ listing: null, components: { inventory: WRITTEN.find((c) => c.id === "inventory")!.examples[0] } });
    expect(parsed.success).toBe(true);
  });

  it("los ejemplos pasan el esquema holgado (lo que devuelve la API se puede leer)", () => {
    expect(pageSchema(ALL).safeParse(page()).success).toBe(true);
  });
});

describe("pageProblems", () => {
  it("una página válida no tiene problemas", () => {
    expect(pageProblems(page(), ALL, facts)).toEqual([]);
  });

  it("falta un componente pedido", () => {
    const p = page();
    delete p.components["faq-and-text"];
    expect(pageProblems(p, ALL, facts)).toContain("Falta components.faq-and-text.");
  });

  it("los límites del esquema estricto, con la ruta", () => {
    const p = page();
    (p.listing as Listing).short_name = "x".repeat(40);
    expect(pageProblems(p, ALL, facts).some((m) => m.startsWith("listing.short_name:"))).toBe(true);
    expect(schemaProblems("inventory", { available_text: "En stock 24 horas", limited_text: "Quedan {qty}", sold_out_text: "Agotado ya" }).join()).toMatch(/inventory\.available_text/);
  });

  it("reseñas que no existen o repetidas", () => {
    const p = page();
    const slider = p.components["review-slider"] as { items: { review_id: string }[] };
    slider.items[0].review_id = "inventada";
    slider.items[1].review_id = slider.items[2].review_id;
    const problems = pageProblems(p, ALL, facts);
    expect(problems.some((m) => m.includes("inventada"))).toBe(true);
    expect(problems.some((m) => m.includes("repetiste una reseña"))).toBe(true);
  });

  it("montos que no son de PRECIO Y OFERTA", () => {
    const p = page();
    (p.listing as Listing).offer_line = "2 por $12.345 · Paga al recibir";
    expect(pageProblems(p, ALL, facts).some((m) => m.includes("12345"))).toBe(true);
  });

  it("la frase de la oferta cierra con el pago al recibir", () => {
    const p = page();
    (p.listing as Listing).offer_line = "Llévate 2 y ahorra en tu compra";
    expect(pageProblems(p, ALL, facts).some((m) => m.startsWith("listing.offer_line"))).toBe(true);
  });

  it("palabras internas y promesas prohibidas", () => {
    const p = page();
    (p.listing as Listing).short_description = "Según la ficha, cura el dolor de espalda mientras trabajas sentado todo el día.";
    const problems = pageProblems(p, ALL, facts).join(" ");
    expect(problems).toContain("palabra interna");
    expect(problems).toContain("promesa prohibida");
  });

  it("el mismo texto en dos componentes", () => {
    const p = page();
    (p.listing as Listing).short_description = "Lleva tus hombros suavemente hacia atrás para que notes cuando te encorvas.";
    const iwb = p.components["image-with-benefits"] as { benefits: { body: string }[] };
    iwb.benefits[0].body = "Lleva tus hombros suavemente hacia atrás para que notes cuando te encorvas.";
    expect(pageProblems(p, ALL, facts).some((m) => m.includes("repite lo que ya dice"))).toBe(true);
  });

  it("los mensajes de validación están en español y son simples", () => {
    expect(schemaProblems(LISTING, {})[0]).toBe("listing.title: Falta este campo.");
    expect(schemaProblems(LISTING, { ...LISTING_EXAMPLE, short_name: "x".repeat(31) })).toEqual(["listing.short_name: Pasa de 30 caracteres."]);
    expect(schemaProblems(LISTING, { ...LISTING_EXAMPLE, title: "Corto" })).toEqual(["listing.title: Escribe al menos 10 caracteres."]);
  });
});

describe("el formulario desde el esquema", () => {
  const labels = (fields: FormField[]): string[] =>
    fields.flatMap((f) => [f.key, ...(f.kind === "group" ? labels(f.fields) : f.kind === "list" ? labels([f.item]) : [])]).filter(Boolean);

  it("cada campo de cada componente tiene nombre en español", () => {
    for (const schema of [listingSchema, ...WRITTEN.map((c) => c.content)]) {
      for (const key of labels(formFields(schema))) expect(FIELD_LABELS[key], key).toBeTruthy();
    }
  });

  it("tipos de campo: texto con límites, ícono, lista con mínimo y máximo, reseña, celda", () => {
    const iwb = formFields(WRITTEN.find((c) => c.id === "image-with-benefits")!.content);
    expect(iwb[0]).toMatchObject({ kind: "text", key: "heading", min: 8, max: 40 });
    expect(iwb[1]).toMatchObject({ kind: "list", key: "benefits", min: 4, max: 6 });
    const item = (iwb[1] as Extract<FormField, { kind: "list" }>).item as Extract<FormField, { kind: "group" }>;
    expect(item.fields.map((f) => f.kind)).toEqual(["icon", "text", "text"]);
    const slider = formFields(WRITTEN.find((c) => c.id === "review-slider")!.content);
    expect(JSON.stringify(slider)).toContain('"kind":"review"');
    const table = formFields(WRITTEN.find((c) => c.id === "comparison-table")!.content);
    expect(JSON.stringify(table)).toContain('"kind":"cell"');
    const listing = formFields(listingSchema);
    expect(listing.find((f) => f.key === "short_description")).toMatchObject({ kind: "text", multiline: true, max: 160 });
  });

  it("cada ícono tiene nombre en español", () => {
    expect(Object.keys(ICON_LABELS).sort()).toEqual([...ICON_KEYS].sort());
  });

  it("un elemento nuevo trae los campos obligatorios", () => {
    const iwb = formFields(WRITTEN.find((c) => c.id === "image-with-benefits")!.content);
    const list = iwb[1] as Extract<FormField, { kind: "list" }>;
    expect(emptyValue(list.item)).toEqual({ icon: "check", title: "", body: "" });
    expect((emptyValue(list) as unknown[]).length).toBe(4);
  });
});

describe("la pantalla", () => {
  it("cada componente tiene su frase corta", async () => {
    const { componentPitch } = await import("./page-ui");
    for (const c of CATALOG) expect(componentPitch(c).length, c.id).toBeLessThanOrEqual(80);
  });
});
