import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/shopify/components/catalog";
import {
  descriptionHtml,
  fingerprint,
  MappingError,
  PACK_OPTION,
  productKeys,
  productMetafields,
  productSetInput,
  SLOT_METAFIELD,
  type ExistingProduct,
  type PublishInput,
} from "./mapping";

const LISTING = {
  title: "Corrector de postura ajustable",
  short_name: "Corrector de postura",
  short_description: "Te ayuda a mantener la espalda recta <mientras> trabajas.",
  offer_line: "2 por $39.990 · Paga al recibir",
  seo_title: "Corrector de postura ajustable",
  seo_description: "Corrector de postura con ajuste de velcro. Paga al recibir.",
};

const example = (id: string) => CATALOG.find((c) => c.id === id)!.examples[0];

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    listing: LISTING,
    components: [
      { id: "benefit-usps", content: example("benefit-usps"), images: {} },
      { id: "image-with-benefits", content: example("image-with-benefits"), images: { main: ["page-media/a.png"] } },
      { id: "insta-story", content: example("insta-story"), images: { stories: ["page-media/s1.png", "page-media/s2.png", "page-media/s3.png"] } },
    ],
    reviews: [
      { id: "r1", author: "M***a", rating: 5, body: "Buenísimo", date: "2026-08-01", country: "CL", photos: ["product-references/r1a.jpg", "product-references/r1b.jpg"] },
      { id: "r2", author: "J***o", rating: 4, body: "Llegó bien", photos: [] },
    ],
    packs: [
      { units: 1, price: 24990, compareAt: 32990, label: "1 unidad", support: "Para probarlo" },
      { units: 2, price: 37990, compareAt: 65980, label: "2 unidades", badge: "Más elegido" },
      { units: 3, price: 49990, compareAt: 98970, label: "3 unidades" },
    ],
    accent: "#1F4BD8",
    gallery: [
      { key: "page-media/cover.png", alt: "Portada" },
      { key: "page-media/g1.png", alt: "Galería 1" },
    ],
    ...over,
  };
}

const gids = new Map(
  ["page-media/a.png", "page-media/s1.png", "page-media/s2.png", "page-media/s3.png", "product-references/r1a.jpg", "product-references/r1b.jpg", "page-media/cover.png", "page-media/g1.png"].map(
    (k, i) => [k, `gid://shopify/MediaImage/${i + 1}`],
  ),
);

const SIMPLE: ExistingProduct = {
  id: "gid://shopify/Product/1",
  options: [{ name: "Title", values: ["Default Title"] }],
  variants: [{ id: "gid://shopify/ProductVariant/10", sku: "CP-01", title: "Default Title", option: "Default Title" }],
};

describe("productSet", () => {
  it("publica los packs como variantes y conserva la variante de siempre", () => {
    const p = productSetInput(input(), SIMPLE, gids);
    expect(p.productOptions).toEqual([{ name: PACK_OPTION, values: [{ name: "1 unidad" }, { name: "2 unidades" }, { name: "3 unidades" }] }]);
    expect(p.variants[0]).toMatchObject({ id: "gid://shopify/ProductVariant/10", price: "24990.00", compareAtPrice: "32990.00", inventoryItem: { sku: "CP-01" } });
    expect(p.variants[1]).not.toHaveProperty("id");
    expect(p.variants[1]).toMatchObject({ price: "37990.00", inventoryItem: { sku: "CP-01-2x" } });
    expect(p.files).toEqual([{ id: "gid://shopify/MediaImage/7" }, { id: "gid://shopify/MediaImage/8" }]);
    expect(p.seo).toEqual({ title: LISTING.seo_title, description: LISTING.seo_description });
  });

  it("al volver a publicar reusa cada variante de pack por su nombre", () => {
    const again: ExistingProduct = {
      ...SIMPLE,
      options: [{ name: PACK_OPTION, values: ["1 unidad", "2 unidades", "3 unidades"] }],
      variants: ["1 unidad", "2 unidades", "3 unidades"].map((o, i) => ({ id: `v${i}`, sku: i ? `CP-01-${i + 1}x` : "CP-01", title: o, option: o })),
    };
    expect(productSetInput(input(), again, gids).variants.map((v) => ("id" in v ? v.id : null))).toEqual(["v0", "v1", "v2"]);
  });

  it("sin packs deja una sola variante con el precio de 1 unidad", () => {
    const p = productSetInput(input({ packs: [{ units: 1, price: 24990 }] }), SIMPLE, gids);
    expect(p.variants).toEqual([
      { id: "gid://shopify/ProductVariant/10", optionValues: [{ optionName: "Title", name: "Default Title" }], price: "24990.00", compareAtPrice: null, inventoryPolicy: "CONTINUE", inventoryItem: { tracked: false } },
    ]);
  });

  it("toda variante queda a la venta sin inventario, también la de 1 unidad", () => {
    for (const packs of [input().packs, [{ units: 1, price: 24990 }], []]) {
      for (const v of productSetInput(input({ packs }), SIMPLE, gids).variants) {
        expect(v).toMatchObject({ inventoryPolicy: "CONTINUE", inventoryItem: { tracked: false } });
      }
    }
  });

  it("no toca un producto con variantes propias", () => {
    const colors: ExistingProduct = { ...SIMPLE, options: [{ name: "Color", values: ["Rojo", "Azul"] }] };
    expect(() => productSetInput(input(), colors, gids)).toThrow(MappingError);
  });

  it("la descripción va escapada, sin marcas de negrita", () => {
    const html = descriptionHtml(input());
    expect(html).toContain("&lt;mientras&gt;");
    expect(html).not.toContain("**");
    expect(html).toMatch(/^<p>.*<\/p><ul><li><strong>/);
  });
});

describe("metafields", () => {
  it("publica el contenido de cada componente en uso, sus fotos y los datos reales", () => {
    const { set } = productMetafields(input(), gids);
    const by = new Map(set.map((m) => [m.key, m]));
    expect(JSON.parse(by.get("benefit_usps")!.value)).toEqual(example("benefit-usps"));
    expect(by.get("image_with_benefits_image")).toEqual({ namespace: "dropflex", key: "image_with_benefits_image", type: "file_reference", value: "gid://shopify/MediaImage/1" });
    expect(JSON.parse(by.get("insta_story_media")!.value)).toHaveLength(3);
    expect(by.get("accent")!.value).toBe("#1f4bd8");
    expect(by.get("subtitle")!.value).toBe(LISTING.short_description);
    const offer = JSON.parse(by.get("offer")!.value);
    expect(offer.offer_line).toBe(LISTING.offer_line);
    expect(offer.packs[1]).toEqual({ units: 2, label: "2 unidades", badge: "Más elegido" });
    const reviews = JSON.parse(by.get("reviews")!.value);
    expect(reviews.items[0]).toMatchObject({ id: "r1", image_from: 0, image_count: 2, date: "2026-08-01" });
    expect(reviews.items[1]).toMatchObject({ id: "r2", image_from: 2, image_count: 0 });
    expect(JSON.parse(by.get("review_summary")!.value)).toEqual({ rating: 4.5, count: 2, five: 1, positive: 2 });
    expect(JSON.parse(by.get("reviews_images")!.value)).toHaveLength(2);
  });

  it("borra lo que ya no va: componentes retirados, reseñas y acento vacíos", () => {
    const { set, remove } = productMetafields(input({ components: [], reviews: [], accent: null }), gids);
    expect(set.map((m) => m.key).sort()).toEqual(["offer", "subtitle"]);
    expect(remove).toContain("benefit_usps");
    expect(remove).toContain("insta_story_media");
    expect(remove).toContain("reviews");
    expect(remove).toContain("accent");
    expect(remove).not.toContain("subtitle");
  });

  it("cada espacio de imagen tiene su metafield y el catálogo lo declara", () => {
    for (const c of CATALOG) {
      for (const slot of c.imageSlots ?? []) {
        const meta = SLOT_METAFIELD[c.id]?.[slot.key];
        expect(meta, `${c.id}.${slot.key}`).toBeDefined();
        expect(c.media.map((m) => m.key)).toContain(meta!.key);
      }
    }
    expect(new Set(productKeys()).size).toBe(productKeys().length);
  });

  it("gif-strip publica sus textos y los GIF de Imágenes en su orden", () => {
    const gifGids = new Map([...gids, ["page-media/gif-2.webp", "gid://shopify/MediaImage/92"], ["page-media/gif-1.webp", "gid://shopify/MediaImage/91"]]);
    const gif = { id: "gif-strip", content: example("gif-strip"), images: { gifs: ["page-media/gif-2.webp", "page-media/gif-1.webp"] } };
    const { set, remove } = productMetafields(input({ components: [gif] }), gifGids);
    expect(JSON.parse(set.find((m) => m.key === "gif_strip")!.value)).toEqual(example("gif-strip"));
    const media = set.find((m) => m.key === "gif_strip_media")!;
    expect(media.type).toBe("list.file_reference");
    expect(JSON.parse(media.value)).toEqual(["gid://shopify/MediaImage/92", "gid://shopify/MediaImage/91"]);
    // Sin el componente en uso, sus dos metafields se bajan de la tienda.
    const off = productMetafields(input({ components: [] }), gifGids);
    expect(off.remove).toEqual(expect.arrayContaining(["gif_strip", "gif_strip_media"]));
    expect(remove).not.toContain("gif_strip_media");
  });

  it("la huella cambia con lo aprobado", () => {
    expect(fingerprint(input())).toBe(fingerprint(input()));
    expect(fingerprint(input())).not.toBe(fingerprint(input({ accent: "#000000" })));
  });
});
