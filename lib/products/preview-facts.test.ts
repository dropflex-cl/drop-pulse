import { describe, expect, it } from "vitest";
import { previewFacts } from "./preview-facts";
import type { PublishInput } from "@/lib/shopify/publish/mapping";

function input(): PublishInput {
  return { listing: { title: "Producto guardado", short_name: "Producto", short_description: "Descripción", offer_line: "Oferta", seo_title: "Producto", seo_description: "Descripción" }, components: [], gallery: [{ key: "chosen", alt: "Portada" }], accent: null,
    packs: [{ units: 1, price: 24990, compareAt: 32990 }, { units: 2, price: 37990, label: "Para compartir" }],
    reviews: [{ id: "review", author: "M***a", rating: 5, body: "Reseña guardada", date: "2026-10-01", photos: ["photo"] }],
    shopFacts: { policies: { cod: true, free_shipping: false, return_days: 15 }, logistics: { handling_days: 1, transit_days_min: 2, transit_days_max: 5, cutoff_hour: 13, business_days_only: true, saturday_dispatch: false, saturday_delivery: false, main_city: "Santiago", regions_extra_days: 2 } } };
}
describe("Hechos de la vista previa desde la publicación efectiva", () => {
  it("utiliza el mismo precio, orden, reseñas y políticas, sin referencias de respaldo", () => {
    const page = input(), facts = previewFacts(page, { chosen: "signed-cover", photo: "signed-review", unused: "old-reference" }, "CLP");
    expect(facts).toMatchObject({ productName: page.listing.title, productImage: "signed-cover", productImages: ["signed-cover"], price: 24990, compareAt: 32990, currency: "CLP", count: 1, rating: 4.9,
      policies: { cod: true, free_shipping: false, return_days: 15 }, logistics: { min: 3, max: 6, city: "Santiago", extra: 2 } });
    expect(facts.packs).toEqual(page.packs); expect(facts.reviews[0]).toMatchObject({ photos: ["signed-review"], date: "oct 2026", iso: "2026-10-01" });
  });
  it("sin datos no inventa portada, reseñas, envíos gratis, plazos o inventario", () => {
    const page = input(); page.gallery = []; page.reviews = []; page.packs = []; delete page.shopFacts;
    expect(previewFacts(page, { unused: "old-reference" }, "CLP")).toMatchObject({ productImages: [], packs: [], reviews: [], count: 0, rating: null, logistics: null, policies: { free_shipping: false } });
    expect(previewFacts(page, {}, "CLP").inventory).toBeUndefined();
  });
});
