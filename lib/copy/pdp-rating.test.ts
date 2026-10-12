import { describe, expect, it } from "vitest";
import { pdpRating, pdpRatingSummary } from "./pdp-rating";
import { productMetafields, landingAtomicKeys, type PublishInput } from "@/lib/shopify/publish/mapping";
import { previewFacts } from "@/lib/products/preview-facts";
import { strictSchema } from "./page-schema";
import { reviewStars } from "@/lib/shopify/components/review-stars/content";
import { statsWithImage } from "@/lib/shopify/components/stats-with-image/content";

const components = [
  { id: "review-stars", content: { label: "{rating} · {count} reseñas", rating: 4.7, count: 1234 }, images: {} },
  { id: "stats-with-image", content: { rating: 3.2, count: 99 }, images: {} },
];
const reviews = [{ id: "r", author: "Ana", body: "Una reseña importada", rating: 5, photos: [] }];

describe("valoración compartida de la PDP", () => {
  it("Estrellas prevalece sobre Hero y el resumen importado sin modificar esas fuentes", () => {
    expect(pdpRating(components, reviews)).toEqual({ rating: 4.7, count: 1234 });
    expect(pdpRatingSummary(components, reviews)).not.toHaveProperty("five");
    expect(reviews[0].rating).toBe(5);
    expect(components[1].content.rating).toBe(3.2);
  });
  it("permite contenido guardado sin importaciones y cantidades explícitas en cero", () => {
    expect(pdpRating(components, [])).toEqual({ rating: 4.7, count: 1234 });
    expect(pdpRating([{ id: "review-stars", content: { rating: 4.8, count: 0 } }], reviews)).toEqual({ rating: 4.8, count: 0 });
    expect(pdpRating([], [])).toEqual({ rating: null, count: 0 });
  });
  it("conserva el respaldo compatible y resuelve hook → ángulo → default", () => {
    const variants = [
      { key: "default", angle_id: null, hook_id: null, content: { rating: 4.6, count: 12 } },
      { key: "angle", angle_id: "routine", hook_id: null, content: { rating: 4.8, count: 18 } },
      { key: "hook", angle_id: "routine", hook_id: "morning", content: { rating: 4.9, count: 20 } },
    ];
    const source = [{ id: "review-stars", content: variants }];
    expect(pdpRating(source, [], { angle_id: "routine", hook_id: "morning" })).toEqual({ rating: 4.9, count: 20 });
    expect(pdpRating(source, [], { angle_id: "routine", hook_id: "missing" })).toEqual({ rating: 4.8, count: 18 });
    expect(pdpRating(source, [])).toEqual({ rating: 4.6, count: 12 });
    expect(pdpRating(components.slice(1), [])).toEqual({ rating: 4.4, count: 99 });
    expect(pdpRatingSummary(source, []).variants).toHaveLength(3);
  });
  it("acepta solo 4,4–4,9 al guardar el agregado, con ambos extremos incluidos", () => {
    for (const component of [reviewStars, statsWithImage]) {
      for (const rating of [4.4, 4.7, 4.9])
        expect(strictSchema(component.id)!.safeParse({ ...component.examples[0], rating }).success).toBe(true);
      for (const rating of [0, 4.39, 4.91, 5])
        expect(strictSchema(component.id)!.safeParse({ ...component.examples[0], rating }).success).toBe(false);
    }
  });
  it("limita agregados antiguos e importados y conserva las notas individuales", () => {
    expect(pdpRating([], reviews)).toEqual({ rating: 4.9, count: 1 });
    expect(reviews[0].rating).toBe(5);
    expect(pdpRating([], [{ rating: 1 }])).toEqual({ rating: 4.4, count: 1 });
    expect(pdpRating([{ id: "review-stars", content: { rating: 5, count: 8 } }], [])).toEqual({ rating: 4.9, count: 8 });
    expect(pdpRating([{ id: "review-stars", content: { rating: 4.46 } }], []).rating).toBe(4.5);
  });
  it("publicación y preview comparten el agregado aun sin reseñas importadas", () => {
    const input: PublishInput = { components, reviews: [], packs: [], gallery: [], accent: null,
      listing: { title: "Producto", short_name: "Producto", short_description: "Descripción", offer_line: "Oferta", seo_title: "Producto", seo_description: "Descripción" } };
    const fields = productMetafields(input, new Map());
    const summary = JSON.parse(fields.set.find(m => m.key === "review_summary")!.value);
    expect(summary).toMatchObject({ rating: 4.7, count: 1234 });
    expect(previewFacts(input, {}, "CLP")).toMatchObject({ rating: summary.rating, count: summary.count });
    expect(fields.set.find(m => m.key === "reviews")).toBeUndefined();
    expect(landingAtomicKeys(input)).toContain("review_summary");
  });
  it("publica una valoración propia de hook aunque default no tenga cifras", () => {
    const input: PublishInput = { components: [{ id: "review-stars", images: {}, content: [
      { key: "default", angle_id: null, hook_id: null, content: { label: "Opiniones" } },
      { key: "morning", angle_id: "routine", hook_id: "morning", content: { rating: 4.9, count: 18 } },
    ] }], reviews: [], packs: [], gallery: [], accent: null,
      listing: { title: "Producto", short_name: "Producto", short_description: "Descripción", offer_line: "Oferta", seo_title: "Producto", seo_description: "Descripción" } };
    const summary = JSON.parse(productMetafields(input, new Map()).set.find(m => m.key === "review_summary")!.value);
    expect(summary).toMatchObject({ rating: null, count: 0 });
    expect(summary.variants).toContainEqual({ key: "morning", angle_id: "routine", hook_id: "morning", rating: 4.9, count: 18 });
  });
});
