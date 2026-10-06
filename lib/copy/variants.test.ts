import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { productMetafields, productKeys, type PublishInput } from "@/lib/shopify/publish/mapping";
import { listingSchema } from "./listing";
import { pageProblems, schemaProblems } from "./page-schema";
import { contentVariants, landingQuery, selectVariant, variantsSchema } from "./variants";
import { parseToolInput } from "@/lib/product-intelligence/validation";

const listing = { title: "Organizador para tu escritorio", short_name: "Organizador", short_description: "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",
  offer_line: "Organiza tu escritorio · Paga al recibir", seo_title: "Organizador para escritorio", seo_description: "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa." };
const variants = [
  { key: "default", angle_id: null, hook_id: null, content: listing },
  { key: "comfort", angle_id: "angle_1", hook_id: null, content: { ...listing, title: "Organiza tus útiles con comodidad" } },
  { key: "opening", angle_id: "angle_1", hook_id: "hook_2", content: { ...listing, title: "Encuentra tus útiles en el escritorio" } },
];

describe("Landing · contenido condicionado por URL", () => {
  it("selecciona combinación exacta, ángulo, default y objetos legacy", () => {
    expect(selectVariant(variants, { angle_id: "angle_1", hook_id: "hook_2" }).key).toBe("opening");
    expect(selectVariant(variants, { angle_id: "angle_1", hook_id: "unknown" }).key).toBe("comfort");
    expect(selectVariant(variants, { angle_id: "unknown", hook_id: "hook_2" }).key).toBe("default");
    expect(selectVariant(variants, { hook_id: "hook_2" }).key).toBe("default");
    expect(selectVariant([...variants].reverse()).key).toBe("default");
    expect(selectVariant(listing).content).toEqual(listing);
    expect(landingQuery(variants[2])).toBe("df_angle=angle_1&df_hook=hook_2");
  });
  it("exige default, selectores únicos y hook ligado a un ángulo", () => {
    const schema = variantsSchema(listingSchema);
    expect(schema.safeParse(variants).success).toBe(true);
    for (const input of [variants.slice(1), [...variants, variants[1]], [variants[0], { ...variants[2], angle_id: null }],
      [variants[0], { ...variants[1], key: "default" }], [variants[0], { ...variants[1], angle_id: "<script>" }], Array(13).fill(variants[0])]) {
      expect(schema.safeParse(input).success).toBe(false);
    }
  });
  it("todos los componentes conservan sus límites dentro de cada variante", () => {
    for (const c of CATALOG) {
      const value = [{ ...variants[0], content: c.examples[0] }, { ...variants[1], content: c.examples[0] }];
      expect(schemaProblems(c.id, value), c.id).toEqual([]);
      expect(() => parseToolInput("save_landing_content", { product_id: "00000000-0000-4000-8000-000000000001", schema_version: "1.1", expected_revision: 0,
        expected_landing_etag: "a".repeat(64), idempotency_key: "variants-test-1", entries: [{ component: c.id, content: value }] })).not.toThrow();
    }
  });
  it("valida montos y reseñas de las variantes que no son default", () => {
    const bad = variants.map((v) => v.key === "opening" ? { ...v, content: { ...v.content, offer_line: "$99.999 · Paga al recibir" } } : v);
    expect(pageProblems({ listing: bad, components: {} }, ["listing"], { currency: "CLP", amounts: [19990], reviewIds: [] }).join(" ")).toContain("99999");
    const wall = CATALOG.find((c) => c.id === "review-wall")!;
    expect(pageProblems({ listing: null, components: { [wall.id]: contentVariants(wall.examples[0]) } }, [wall.id], { currency: "CLP", amounts: [], reviewIds: [] }).join(" ")).toContain("RESEÑAS APROBADAS");
  });
  it("publica arrays y pools de archivos sin exponer picks privados ni alterar precios", () => {
    const def = CATALOG.find((c) => c.id === "image-with-benefits")!;
    const content = [{ ...variants[0], content: def.examples[0], images: [] }, { ...variants[1], content: def.examples[0], images: [] }];
    const input: PublishInput = { listing, listingVariants: variants, components: [{ id: def.id, content, images: { main: ["base"] },
      variantImages: [{ key: "default", images: { main: ["base"] } }, { key: "comfort", images: { main: ["other"] } }] }],
      reviews: [], packs: [{ units: 1, price: 19990 }, { units: 2, price: 29990 }], gallery: [], accent: null };
    const result = productMetafields(input, new Map([["base", "gid://shopify/MediaImage/1"], ["other", "gid://shopify/MediaImage/2"]]));
    const json = (key: string) => JSON.parse(result.set.find((m) => m.key === key)!.value);
    expect(json("image_with_benefits")[1]).toMatchObject({ media_indices: { main: [1] } });
    expect(json("image_with_benefits")[1]).not.toHaveProperty("images");
    expect(json("image_with_benefits_image_variants")).toHaveLength(2);
    expect(json("landing_listing")).toHaveLength(3);
    expect(json("offer").packs[1].price).toBe(2999000);
    expect(productKeys()).toContain("image_with_benefits_image_variants");
    expect(productMetafields({ ...input, listingVariants: undefined, components: [] }, new Map()).remove).toContain("landing_listing");
  });
  it("pain-block desarrolla un solo ángulo con uno o varios momentos", () => {
    const def = CATALOG.find((c) => c.id === "pain-block")!;
    const example = def.examples[0] as { moments: unknown[] };
    expect(schemaProblems(def.id, { ...example, moments: example.moments.slice(0, 1) })).toEqual([]);
  });
});
