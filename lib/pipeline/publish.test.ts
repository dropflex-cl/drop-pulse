import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visual: vi.fn(),
  admin: vi.fn(),
  after: vi.fn(),
  mutation: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/product-intelligence/visual-publication", () => ({ assertVisualBindingsPublishable: mocks.visual }));
vi.mock("@/lib/product-intelligence/persuasion-publication", () => ({ prepareExperienceManifest: vi.fn() }));
vi.mock("@/lib/pipeline/theme", () => ({ themeView: vi.fn(async () => ({ status: "published", outdated: false })) }));
vi.mock("@/lib/integrations/admin", () => ({ adminClient: mocks.admin }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/integrations/shopify/client", () => ({ shopifyMutation: mocks.mutation, shopifyQuery: mocks.query }));
vi.mock("@/lib/integrations/shopify/connection", () => ({
  getShopifyConnection: vi.fn(async () => ({
    status: "connected",
    shop_domain: "fixture.myshopify.com",
    scopes: ["write_products", "write_themes", "write_files", "write_inventory"],
  })),
}));
vi.mock("@/lib/products/store", () => ({
  REFERENCES_BUCKET: "product-references",
  getProductRow: vi.fn(async () => ({ title: "Producto", page_accent_color: null })),
  listImageRows: vi.fn(async () => []),
}));
vi.mock("@/lib/copy/store", () => ({
  currentContent: (r: { content: unknown }) => r.content,
  activeComponents: vi.fn(async () => new Map([["product", [{
    component: "listing", status: "approved", enabled: true, images: [],
    content: { title: "Ficha aprobada", short_name: "Producto", short_description: "Mantén los útiles juntos y encuentra lo que necesitas en tu escritorio.", offer_line: "Paga al recibir", seo_title: "Organizador para escritorio", seo_description: "Organiza los útiles en tu escritorio y encuentra cada cosa en su lugar. Paga al recibir en casa." },
  }]]])),
}));
vi.mock("@/lib/page-images/store", () => ({
  PAGE_MEDIA_BUCKET: "page-media",
  pageImageRows: vi.fn(async () => ["cover", "gallery", "gallery", "gallery", "gallery"].map((slot, i) => ({
    id: `image-${i}`, slot, position: i, status: "approved", render_status: "succeeded",
    source: "upload", storage_path: `fixture/image-${i}.webp`, visual_binding_id: `binding-${i}`,
  }))),
}));
vi.mock("@/lib/reviews/rows", () => ({ approvedReviewRows: vi.fn(async () => []), displayText: vi.fn() }));
vi.mock("@/lib/pricing/store", () => ({
  getPricingPlan: vi.fn(async () => ({ salePrice: 24990, compareAtPrice: null, packs: [{ units: 1, price: 24990 }] })),
}));
vi.mock("@/lib/pricing/labels-store", () => ({ latestPackLabels: vi.fn(async () => null) }));
vi.mock("@/lib/settings/policies-store", () => ({
  getStorePolicies: vi.fn(async () => ({
    timezone: "America/Santiago",
    policies: { handlingDays: 1, transitDaysMin: 2, transitDaysMax: 3, cutoffHour: 13 },
  })),
}));

import { ProductIntelligenceError } from "@/lib/product-intelligence/errors";
import { assertCurrent, makeVisualRecord, type VisualState } from "@/lib/product-intelligence/visual-domain";
import { canonicalHash } from "@/lib/product-intelligence/concurrency";
import { publishState } from "@/lib/data/publish";
import { preparePublish, startPublish } from "./publish";
import { pageImageRows } from "@/lib/page-images/store";
import { activeComponents } from "@/lib/copy/store";
import { effectivePage } from "@/lib/products/effective-page";
import { productMetafields } from "@/lib/shopify/publish/mapping";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.visual.mockReset().mockResolvedValue(undefined);
  mocks.admin.mockImplementation(() => ({
    storage: { from: () => ({ exists: async () => ({ data: true, error: null }) }) },
    from: (table: string) => {
      if (!["video_scripts", "product_publications"].includes(table)) throw new Error(`Escritura o lectura inesperada: ${table}`);
      const chain = {
        select: () => chain, eq: () => chain, is: () => chain, not: () => chain, in: () => chain,
        then: (resolve: (r: unknown) => void) => resolve({
          data: table === "video_scripts" ? [] : [{ product_id: "product", status: "published", fingerprint: "old", published_at: "2026-10-10T23:00:00Z" }],
          error: null,
        }),
      };
      return chain;
    },
  }));
});

describe("Publicar con contenido vigente y archivos elegidos", () => {
  it("conserva la ficha y la galería cuando cambian las políticas usadas por una imagen", async () => {
    const policies = { free_shipping: true, handling_days: null, cutoff_hour: null };
    const state: VisualState = {
      product_id: "product", revision: 1, etag: "fixture", dependency_stamp: "fixture",
      records: [], history: [], references: [], targets: [], files: [],
      live: { "policy:current": { hash: canonicalHash({ ...policies, handling_days: 1, cutoff_hour: 13 }), value: policies, blocked: false } },
    };
    const binding = makeVisualRecord(state, "binding", {
      dependencies: [{ kind: "policy", key: "current", usage: "overlay", content_hash: canonicalHash(policies) }],
    }, "selected");
    mocks.visual.mockImplementationOnce(async () => assertCurrent(binding, state));

    const prepared = await preparePublish("owner", "product");
    expect(prepared.input.listing.title).toBe("Ficha aprobada");
    expect(prepared.input.gallery).toHaveLength(5);
    expect(prepared.missing).toEqual([]);
    expect(mocks.visual).toHaveBeenCalledWith("owner", "product", ["binding-0", "binding-1", "binding-2", "binding-3", "binding-4"]);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rechaza publicar sin guardar ni programar trabajo cuando falta un archivo elegido", async () => {
    mocks.visual.mockRejectedValue(new ProductIntelligenceError("VALIDATION_ERROR", "El archivo de una imagen elegida no está disponible."));
    await expect(startPublish("owner", "product")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Imágenes") });
    expect(mocks.admin).toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("abre el estado de Publicar y conserva la publicación anterior con el aviso pendiente", async () => {
    mocks.visual.mockRejectedValueOnce(new ProductIntelligenceError("VALIDATION_ERROR", "El archivo de una imagen elegida no está disponible."));
    const state = await publishState("owner", "product");
    expect(state.plan.title).toBe("Ficha aprobada");
    expect(state.plan.images).toBe(5);
    expect(state.publication).toMatchObject({ status: "published", publishedAt: "2026-10-10T23:00:00Z" });
    expect(state.missing).toEqual([expect.stringContaining("Imágenes")]);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("muestra una referencia visual retirada como requisito pendiente", async () => {
    mocks.visual.mockRejectedValueOnce(new ProductIntelligenceError("INVALID_REFERENCE", "La versión no pertenece a este producto o ya no está disponible."));
    expect((await preparePublish("owner", "product")).missing).toEqual([expect.stringContaining("Imágenes")]);
  });

  it("sigue propagando los errores de infraestructura y de acceso", async () => {
    for (const error of [new Error("Sin conexión"), new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer"), new ProductIntelligenceError("FORBIDDEN", "Sin permiso")]) {
      mocks.visual.mockRejectedValueOnce(error);
      await expect(preparePublish("owner", "product")).rejects.toBe(error);
    }
  });

  it("mantiene habilitada la preparación cuando las imágenes están vigentes", async () => {
    const prepared = await preparePublish("owner", "product");
    expect(prepared.missing).toEqual([]);
    expect(prepared.input.gallery).toHaveLength(5);
  });

  it.each(["use-cases", "usage-steps"].flatMap(id => [false, true].map(variant => ({ id, variant }))))("$id image_only llega a página efectiva y Shopify (variante: $variant)", async ({ id, variant }) => {
    const slot = id === "use-cases" ? "cases" : "steps";
    const baseline = (await activeComponents("owner", ["product"])).get("product")!;
    const content = { display_mode: "image_only", image_alt: "Tres usos del organizador dentro de tu rutina diaria." };
    const pick = { source: "page_image", id: "image-1", slot };
    for (const available of [false, true]) {
      const images = available ? [pick] : [];
      const rows = [...baseline, { ...baseline[0], component: id, images: variant ? [] : images,
        content: variant ? [{ key: "default", angle_id: null, hook_id: null, content, images }] : content }];
      vi.mocked(activeComponents).mockResolvedValueOnce(new Map([["product", rows]]) as unknown as Awaited<ReturnType<typeof activeComponents>>);
      const prepared = await preparePublish("owner", "product");
      if (!available) expect(prepared.missing.join(" ")).toContain("elige al menos 1 imágenes");
      else {
        expect(prepared.missing).toEqual([]);
        const component = effectivePage(prepared.input).components.find(c => c.id === id)!;
        expect(component.content).toEqual(content);
        expect(component.images[slot]).toHaveLength(1);
        const files = new Map(prepared.images.map(image => [image.key, `gid://shopify/MediaImage/${image.key}`]));
        const mapped = productMetafields(prepared.input, files);
        const value = JSON.parse(mapped.set.find(m => m.key === id.replaceAll("-", "_"))!.value);
        expect(variant ? value[0].content : value).toEqual(content);
      }
    }
  });

  it("no valida usos visuales de secciones omitidas aunque compartan archivo con la portada", async () => {
    const gallery = await pageImageRows("owner", ["product"]);
    vi.mocked(pageImageRows).mockResolvedValueOnce([...gallery, { ...gallery[0], id: "unused-image", slot: "visual-unused", visual_binding_id: "unused-binding" }]);
    const prepared = await preparePublish("owner", "product");
    expect(prepared.missing).toEqual([]);
    expect(mocks.visual).toHaveBeenCalledWith("owner", "product", gallery.map(p => p.visual_binding_id));
    expect(prepared.images).toHaveLength(5);
  });
});
