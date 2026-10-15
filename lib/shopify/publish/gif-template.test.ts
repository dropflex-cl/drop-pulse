import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopifyConnection } from "@/lib/integrations/shopify/connection";
import type { PublishInput } from "./mapping";

const mocks = vi.hoisted(() => ({ installation: vi.fn(), read: vi.fn(), mutation: vi.fn() }));
vi.mock("./theme", () => ({ getThemeInstallation: mocks.installation, readThemeFile: mocks.read }));
vi.mock("@/lib/integrations/shopify/client", () => ({ shopifyMutation: mocks.mutation }));
import { ensureGifTemplateVisible, visibleGifTemplate } from "./gif-template";

const fixture = () => ({ sections: { main: { type: "product-information", settings: { merchant: "Conservar" }, blocks: {
  details: { type: "_product-details", settings: {}, blocks: {
    benefits: { type: "df-benefit-double-box", settings: {} },
    gifs: { type: "df-gif-strip", disabled: true, settings: { radius: 14, heading: "Mi título" } },
    reviews: { type: "df-review-slider", disabled: true, settings: {} },
  }, block_order: ["benefits", "gifs", "reviews"] },
}, block_order: ["details"] } }, order: ["main"] });
const conn = { user_id: "owner", shop_domain: "fixture.myshopify.com" } as ShopifyConnection;
const input = (): Pick<PublishInput, "components" | "disabledConversionComponents"> => ({ components: [{ id: "gif-strip", content: {}, images: { gifs: ["page-media/demo.webp"] } }] });
let remote: string;
beforeEach(() => {
  vi.resetAllMocks(); remote = JSON.stringify(fixture());
  mocks.installation.mockResolvedValue({ theme_gid: "theme", shop_domain: conn.shop_domain });
  mocks.read.mockImplementation(async (_conn, _theme, path) => path.startsWith("templates/") ? remote : "{% schema %}{}{% endschema %}");
  mocks.mutation.mockImplementation(async (_conn, _query, args) => { remote = args.files[0].body.value; return { themeFilesUpsert: { userErrors: [] } }; });
});

describe("el template muestra los GIFs elegidos al publicar", () => {
  it("corrige el disabled de producción y conserva ajustes, orden y otras secciones ocultas", () => {
    const data = fixture();
    const patched = JSON.parse(visibleGifTemplate(`/* Guardado por Shopify */\n${JSON.stringify(data)}`)!);
    data.sections.main.blocks.details.blocks.gifs.disabled = false;
    expect(patched).toEqual(data);
    expect(visibleGifTemplate(JSON.stringify(patched))).toBeNull();
  });
  it("recupera un bloque omitido del orden sin duplicarlo", () => {
    const data = fixture(); data.sections.main.blocks.details.block_order = ["benefits", "reviews"];
    const patched = JSON.parse(visibleGifTemplate(JSON.stringify(data))!);
    expect(patched.sections.main.blocks.details.block_order).toEqual(["benefits", "gifs", "reviews"]);
  });
  it("admite el bloque estático de Horizon, cuyo padre no declara block_order", () => {
    const data = fixture();
    delete (data.sections.main as { block_order?: string[] }).block_order;
    const patched = JSON.parse(visibleGifTemplate(JSON.stringify(data))!);
    expect(patched.sections.main.blocks.details.blocks.gifs.disabled).toBe(false);
    expect(patched.sections.main.block_order).toBeUndefined();
  });
  it("agrega el bloque faltante en la composición reconocida y conserva un ID ajeno", () => {
    const data = fixture();
    const details = data.sections.main.blocks.details;
    const blocks = details.blocks as Record<string, unknown>;
    delete blocks.gifs; blocks.gif_strip = { type: "text", settings: { text: "Del comerciante" } };
    details.block_order = ["benefits", "gif_strip", "reviews"];
    const patched = JSON.parse(visibleGifTemplate(JSON.stringify(data))!);
    expect(patched.sections.main.blocks.details.blocks.gif_strip).toEqual(blocks.gif_strip);
    expect(patched.sections.main.blocks.details.blocks.gif_strip_.type).toBe("df-gif-strip");
    expect(patched.sections.main.blocks.details.block_order).toEqual(["benefits", "gif_strip_", "gif_strip", "reviews"]);
  });
  it("no revela una sección completa oculta ni reemplaza un layout desconocido", () => {
    const data = { ...fixture(), order: [] };
    expect(() => visibleGifTemplate(JSON.stringify(data))).toThrow("oculta");
    expect(() => visibleGifTemplate('{"sections":{},"order":[]}')).toThrow("Actualiza el tema");
    expect(() => visibleGifTemplate("inválido")).toThrow("leer la plantilla");
  });
  it.each(["sin componente", "sin archivos", "oculto"])("%s no consulta ni modifica Shopify", async condition => {
    const page = input();
    if (condition === "sin componente") page.components = [];
    if (condition === "sin archivos") page.components[0].images = {};
    if (condition === "oculto") page.disabledConversionComponents = ["gif-strip"];
    await ensureGifTemplateVisible(conn, page, null);
    expect(mocks.installation).not.toHaveBeenCalled(); expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it("escribe la plantilla aplicada por el producto y verifica que quedó visible", async () => {
    const beforeWrite = vi.fn();
    await ensureGifTemplateVisible(conn, input(), "personalizada", beforeWrite);
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.mutation.mock.calls[0][2].files[0].filename).toBe("templates/product.personalizada.json");
    expect(beforeWrite).toHaveBeenCalledTimes(1);
    await ensureGifTemplateVisible(conn, input(), "personalizada");
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
  });
  it("incluye GIFs de variantes y respeta el respaldo de Shopify a product.json", async () => {
    const page = input(); page.components[0].images = {};
    page.components[0].variantImages = [{ key: "default", images: { gifs: ["demo"] } }];
    mocks.read.mockImplementation(async (_conn, _theme, path) => path.includes(".inexistente.") ? null : path === "templates/product.json" ? remote : "bloque");
    await ensureGifTemplateVisible(conn, page, "inexistente");
    expect(mocks.mutation.mock.calls[0][2].files[0].filename).toBe("templates/product.json");
  });
  it("con plantilla legacy o permiso rechazado informa error de publicación", async () => {
    mocks.read.mockImplementation(async (_conn, _theme, path) => path.endsWith(".liquid") ? "legacy" : null);
    await expect(ensureGifTemplateVisible(conn, input(), "legacy")).rejects.toThrow("Liquid");
    expect(mocks.mutation).not.toHaveBeenCalled();
    mocks.read.mockImplementation(async () => remote);
    mocks.mutation.mockResolvedValue({ themeFilesUpsert: { userErrors: [{ message: "Permiso denegado" }] } });
    await expect(ensureGifTemplateVisible(conn, input(), null)).rejects.toThrow("Permiso denegado");
  });
  it("no declara éxito si Shopify no conserva el archivo o falla la autorización previa", async () => {
    mocks.mutation.mockResolvedValue({ themeFilesUpsert: { userErrors: [] } });
    await expect(ensureGifTemplateVisible(conn, input(), null)).rejects.toThrow("todavía no muestra");
    mocks.mutation.mockClear();
    await expect(ensureGifTemplateVisible(conn, input(), null, async () => { throw new Error("Contenido cambió"); })).rejects.toThrow("Contenido cambió");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
