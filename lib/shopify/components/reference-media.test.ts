import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Drop, Liquid } from "liquidjs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { productMetafields, type PublishInput } from "@/lib/shopify/publish/mapping";
import { settingsOf } from "@/lib/store-preview/settings";

// Shopify: la lista de referencias se puede recorrer y cuenta con count; no expone size ni [i].
// Los filtros de arrays sí materializan su enumeración. No usar arrays JS como sustituto de ella.
class ReferenceList extends Drop {
  constructor(readonly files: Record<string, unknown>[]) { super(); }
  get count() { return this.files.length; }
  *[Symbol.iterator]() { yield* this.files; }
}
const base = __dirname;
function renderer() {
  const engine = new Liquid({ root: readdirSync(base).map(d => join(base, d, "snippets")).filter(existsSync), extname: ".liquid", relativeReference: false });
  const read = engine.options.fs.readFile;
  engine.options.fs = { ...engine.options.fs, readFile: async path => path.endsWith("df-accent-vars.liquid") ? "" : (await read(path))
    .replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, "")
    .replace(/(\bassign\s+\w+\s*=) nil(?=\s*(?:\n|$))/g, "$1 df_null") };
  engine.registerFilter("where", (value: unknown, property: string, expected?: unknown) => {
    const array = value instanceof ReferenceList ? [...value] : Array.isArray(value) ? value : [];
    return array.filter(item => expected === undefined ? Boolean(item[property]) : item[property] === expected);
  });
  engine.registerFilter("asset_url", (value: string) => value);
  engine.registerFilter("stylesheet_tag", () => "");
  engine.registerFilter("image_url", (image: { src?: string; preview_image?: { src?: string } }) => image?.src ?? image?.preview_image?.src ?? "");
  engine.registerFilter("image_tag", (src: string, ...args: unknown[]) => `<img src="${src}" ${args.filter(Array.isArray).map(([key, value]) => `${key}="${value}"`).join(" ")}>`);
  engine.registerFilter("video_tag", (video: { id: string }) => `<video data-file="${video.id}"></video>`);
  return engine;
}
const ids = ["mechanism", "use-cases", "usage-steps", "insta-story", "image-with-benefits"];
const slots: Record<string, string> = { mechanism: "main", "use-cases": "cases", "usage-steps": "steps", "insta-story": "stories", "image-with-benefits": "main" };
const content = (id: string) => CATALOG.find(c => c.id === id)!.examples[0];
const input: PublishInput = { listing: {} as PublishInput["listing"], packs: [], reviews: [], accent: null, gallery: [], components: ids.map(id => ({ id, content: content(id), images: { [slots[id]]: id === "insta-story" ? ["story-a", "story-b", "story-c"] : [id] } })) };

async function render(id: string, variant = false, empty = false, override?: unknown) {
  const engine = renderer();
  const selected = { ...input.components.find(c => c.id === id)!, ...(override ? { content: override } : {}) };
  const keys = selected.images[slots[id]];
  const mapped = productMetafields({ ...input, components: [{ ...selected, ...(variant ? { content: [{ key: "default", angle_id: null, hook_id: null, content: selected.content }], variantImages: [{ key: "default", images: { [slots[id]]: empty ? [] : [...keys].reverse() } }] } : {}) }] }, new Map(keys.map(key => [key, `gid://shopify/MediaImage/${key}`])));
  const values = Object.fromEntries(mapped.set.map(m => [m.key, { value: m.type === "json" ? JSON.parse(m.value) : m.type.includes("file_reference") ? (() => {
    const files = (m.type.startsWith("list.") ? JSON.parse(m.value) : [m.value]).map((gid: string) => ({ id: gid, media_type: "image", preview_image: { src: `/files/${gid.split("/").pop()}.webp`, width: 800, height: 1200 } }));
    return m.type.startsWith("list.") ? new ReferenceList(files) : files[0];
  })() : m.value }]));
  const product = { title: "Producto", url: "/products/test", metafields: { dropflex: values } };
  engine.options.globals = { product, closest: { product }, shop: { metafields: { dropflex: {} } }, request: { locale: { iso_code: "es" } } };
  return parseHTML(await engine.renderFile(`df-${id}-content`, { product, content: selected.content, ...(variant ? { df_variant: values[CATALOG.find(c => c.id === id)!.metafield!.key].value[0] } : {}), section: { id: "test", settings: settingsOf(id), blocks: [] } })).document;
}

describe("MCP/UI → archivos de Shopify → imágenes de la PDP", () => {
  it.each([false, true])("image_only muestra un solo archivo sin repetir texto (variante: %s)", async variant => {
    const data = { ...(content("use-cases") as object), display_mode: "image_only", image_alt: "Tres momentos para usar el contorno en tu rutina diaria." };
    const document = await render("use-cases", variant, false, data);
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelector("img")?.getAttribute("alt")).toBe(data.image_alt);
    expect(document.querySelector("h2, summary, details, p")).toBeNull();
    expect(document.querySelector(".df-rich__visual")).not.toBeNull();
  });
  it("image_only con selección vacía no recupera archivos de otra variante ni textos retenidos", async () => {
    const document = await render("use-cases", true, true, { ...(content("use-cases") as object), display_mode: "image_only", image_alt: "Tres momentos para usar el contorno en tu rutina diaria." });
    expect(document.querySelector("img, details")).toBeNull();
    expect(document.querySelector(".df-pdp-empty")).not.toBeNull();
  });
  it.each(ids)("renderiza los archivos asignados a %s con una lista de referencias realista", async id => {
    const document = await render(id);
    const expected = input.components.find(c => c.id === id)!.images[slots[id]].map(key => `/files/${key}.webp`);
    const sources = [...document.querySelectorAll("img")].map(image => image.getAttribute("src"));
    for (const source of expected) expect(sources).toContain(source);
    expect(document.querySelector(".df-pdp-empty")).toBeNull();
  });
  it("mantiene el orden elegido de las historias por variante", async () => {
    const document = await render("insta-story", true);
    expect([...document.querySelectorAll(".df-insta-story__slide img")].map(image => image.getAttribute("src"))).toEqual(["/files/story-c.webp", "/files/story-b.webp", "/files/story-a.webp"]);
  });
  it.each(["mechanism", "insta-story"])("una selección vacía de %s no recupera imágenes de otra variante", async id => {
    expect((await render(id, true, true)).querySelectorAll("img").length).toBe(0);
  });
});
