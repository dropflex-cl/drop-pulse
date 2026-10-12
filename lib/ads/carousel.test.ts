import { describe, expect, it } from "vitest";
import { carouselContentSchema, carouselProblem, activeCarouselCards } from "./carousel";
import { carouselCreative } from "./meta/payloads";
import { planLaunch } from "./plan";
import { buildPreset } from "./presets";
import { carouselFixture } from "./carousel-fixtures";

describe("Carruseles de anuncios", () => {
  it("acepta borradores, preserva campos omitidos y rechaza claves repetidas y más de diez tarjetas", () => {
    const c = carouselFixture(); expect(c.cards[0].asset_id).toBeUndefined(); expect(c.cards[0].enabled).toBeUndefined();
    expect(carouselContentSchema.safeParse({ ...c, cards: [c.cards[0], c.cards[0]] }).success).toBe(false);
    expect(carouselContentSchema.safeParse({ ...c, cards: Array.from({ length: 11 }, (_, i) => ({ ...c.cards[0], key: `c_${i}` })) }).success).toBe(false);
  });
  it("elige las tarjetas activas sin mutar el orden y valida todos sus archivos y formato", () => {
    const c = carouselFixture(); const cards = c.cards.map(card => ({ ...card, storage_path: "file.jpg", width: 1122, height: 1402, size_bytes: 100, problem: null }));
    expect(carouselProblem(c, cards)).toBeNull(); expect(carouselProblem(c, cards.map(x => ({ ...x, width: 1600 })))).toContain("4:5");
    expect(carouselProblem(c, [{ ...cards[0], enabled: false }, cards[1]])).toContain("dos");
    expect(activeCarouselCards([{ key: "b" }, { key: "a", enabled: false }, { key: "c" }]).map(x => x.key)).toEqual(["b", "c"]);
  });
  it("envía títulos, enlaces y orden exactos sin optimización ni tarjeta final de Meta", () => {
    const result = carouselCreative("Prueba", "page", { kind: "carousel", primaryText: "Texto", cta: "SHOP_NOW", ratio: "4:5", cards: [{ imageHash: "b", headline: "Primero", description: "", link: null }, { imageHash: "a", headline: "Oferta", description: "Pack 2", link: "https://datazo.cl/oferta" }] }, "https://datazo.cl/products/test?df_hook=one");
    expect(result.asset_feed_spec).toBeUndefined(); expect(result.object_story_spec.link_data).toMatchObject({ multi_share_optimized: false, multi_share_end_card: false, use_flexible_image_aspect_ratio: true, child_attachments: [{ image_hash: "b", name: "Primero", link: "https://datazo.cl/products/test?df_hook=one" }, { image_hash: "a", link: "https://datazo.cl/oferta" }] });
  });
  it("ABO cuenta el carrusel como una pieza y CBO separa DCO de los carruseles", () => {
    const cfg = buildPreset("impulso", { country: "CL", currency: "CLP", cpaLimit: 5000, creatives: ["c", "i"], texts: { primary_texts: ["General"], headlines: ["Compra"], description: "" } });
    const media = [{ id: "c", name: "Carrusel", kind: "carousel" as const, carousel_content: carouselFixture() }, { id: "i", name: "Imagen", kind: "image" as const }];
    const abo = planLaunch("abo", cfg.launch, media, { product: "Sadoer", date: "12-10-2026" });
    expect(abo.adsets[0].ads[0]).toMatchObject({ mediaIds: ["c"], primaryTexts: ["Pack de dos para tu rutina"] });
    const cbo = planLaunch("cbo", { ...cfg.launch, cbo_ads: "dco" }, media, { product: "Sadoer", date: "12-10-2026" });
    expect(cbo.adsets).toHaveLength(2); expect(cbo.adsets.map(s => s.ads.map(a => a.mediaIds))).toEqual([[["i"]], [["c"]]]);
  });
});
