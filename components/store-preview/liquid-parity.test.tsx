import { pdpRating } from "@/lib/copy/pdp-rating";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Liquid } from "liquidjs";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { SLOT_METAFIELD } from "@/lib/shopify/publish/mapping";
import { FIXTURE_FACTS, EMPTY_FACTS } from "@/lib/store-preview/fixture";
import type { StoreFacts } from "@/lib/store-preview/facts";
import { settingsOf } from "@/lib/store-preview/settings";
import { PREVIEWS } from "./registry";
import { PackOffersPreview, PricePreview } from "./listing";
import { SocialProofPreview } from "./social-proof";

// Renderiza los snippets originales, no snapshots escritos a mano del JSX que se quiere verificar.
const base = join(process.cwd(), "lib/shopify/components");
const engine = new Liquid({
  root: [...readdirSync(base).map(d => join(base, d, "snippets")).filter(existsSync), join(base, "_landing/blocks")],
  extname: ".liquid", relativeReference: false,
});
const originalRead = engine.options.fs.readFile;
engine.options.fs = { ...engine.options.fs, readFile: async p => p.endsWith("df-accent-vars.liquid") ? "" :
  (await originalRead(p))
    .replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, "")
    .replace(/\{%-?\s*(stylesheet|schema|javascript)\s*-?%\}[\s\S]*?\{%-?\s*end\1\s*-?%\}/g, "")
    // Shopify evalúa el literal asignado nil/blank como nulo. LiquidJS conserva un Drop comparable.
    .replace(/(\bassign\s+\w+\s*=) nil(?=\s*(?:\n|$))/g, "$1 df_null")
    .replace(/(\bassign\s+\w+\s*=) blank(?=\s*(?:\n|$))/g, "$1 ''")
    // LiquidJS usa la pseudopropiedad size del scope si falta el parámetro del snippet.
    .replace(/render 'df-stars', rating: review.rating\s*%}/g, "render 'df-stars', rating: review.rating, size: df_null %}") };
engine.registerFilter("asset_url", (s: string) => s);
engine.registerFilter("stylesheet_tag", () => "");
engine.registerFilter("json", JSON.stringify);
engine.registerFilter("handleize", (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
engine.registerFilter("divided_by", (n: number, d: number) => Number.isInteger(d) ? Math.floor(n / d) : n / d);
engine.registerFilter("image_url", (image: { src?: string } | string) => typeof image === "string" ? image : image?.src ?? "");
engine.registerFilter("image_tag", (src: string, ...args: unknown[]) => `<img src="${src}" ${args.filter(Array.isArray).map(([k, v]) => `${k}="${v}"`).join(" ")}>`);
engine.registerFilter("money", (n: number) => `$${Math.round(n / 100).toLocaleString("es-CL")}`);
engine.registerFilter("money_without_trailing_zeros", (n: number) => `$${Math.round(n / 100).toLocaleString("es-CL")}`);

const media = (src: string) => ({ id: src, src, width: 800, height: 800, media_type: "image", preview_image: { src, width: 800, height: 800 } });
const facts: StoreFacts = {
  ...FIXTURE_FACTS, inventory: { available: true },
  productImage: "https://example.test/product.webp", productImages: ["https://example.test/product.webp"],
  logistics: { min: 2, max: 5, handling: 0, cutoff: 14 },
  gifs: ["https://example.test/demo.webp"],
  reviews: FIXTURE_FACTS.reviews.map((r, i) => ({ ...r, photos: [`https://example.test/review-${i}.webp`] })),
};

async function liquidMarkup(id: string, content: unknown, f: StoreFacts, images: Record<string, string[]>) {
  const values: Record<string, unknown> = {
    review_summary: { count: f.count, rating: f.rating, five: f.reviews.filter(r => r.rating >= 5).length, positive: f.reviews.filter(r => r.rating >= 4).length },
    reviews: { items: f.reviews.map((r, i) => ({ ...r, date: r.iso, image_from: f.reviews.slice(0, i).reduce((n, r) => n + r.photos.length, 0), image_count: r.photos.length })) },
    reviews_images: f.reviews.flatMap(r => r.photos.map(media)),
    offer: { packs: (f.packs ?? []).map(p => ({ ...p, price: p.price * 100, compare_at: (p.compareAt ?? 0) * 100 })) },
    gif_strip_media: (f.gifs ?? []).map(media),
  };
  for (const [slot, spec] of Object.entries(SLOT_METAFIELD[id] ?? {})) {
    if (id === "gif-strip") continue;
    const files = (images[slot] ?? []).map(src => slot === "videos" ? { id: src, sources: [{ mime_type: "video/mp4", url: src, height: 720 }] } : media(src));
    values[spec.key] = spec.type === "file_reference" ? files[0] : files;
  }
  const variant = { id: 1, price: f.price * 100, compare_at_price: (f.compareAt ?? 0) * 100, available: f.inventory?.available ?? true, inventory_quantity: f.inventory?.quantity ?? 100, inventory_management: f.inventory?.management ?? "shopify", inventory_policy: f.inventory?.policy ?? "deny" };
  const product = { id: 1, title: f.productName, url: "/products/example", images: (f.productImages ?? []).map(media), featured_image: f.productImage ? media(f.productImage) : null, variants: [variant], selected_or_first_available_variant: variant,
    metafields: { dropflex: Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value }])) } };
  const shop = { name: "Nuestra tienda", refund_policy: { url: f.policyLinks?.refund }, shipping_policy: { url: f.policyLinks?.shipping }, metafields: { dropflex: {
    policies: { value: { ...f.policies, free_shipping_threshold: f.policies.threshold ?? 0 } },
    logistics: { value: f.logistics ? { handling_days: f.logistics.handling, transit_days_min: f.logistics.min - (f.logistics.handling ?? 0), transit_days_max: f.logistics.max - (f.logistics.handling ?? 0), cutoff_hour: f.logistics.cutoff } : null },
  } } };
  // Estos objetos son globales de Shopify y siguen disponibles en los render aislados.
  engine.options.globals = { product, shop, closest: { product }, request: { page_type: "product", locale: { iso_code: "es" } } };
  const s = settingsOf(id);
  const context = { product, shop, content, section: { id: "audit", index: 3, settings: s, blocks: [] }, block: { settings: s } };
  if ((content as { state?: string })?.state === "empty" && id !== "shipping-timeline")
    return engine.renderFile("df-component-empty", { ...context, component: id });
  const html = await engine.renderFile(id === "price" ? "df-price" : id === "social-proof" ? "df-social-proof" : `df-${id}-content`, context);
  // Los wrappers reales hacen este mismo fallback para las piezas sin contenido o archivos.
  return html.includes('class="df') ? html : engine.renderFile("df-component-empty", { ...context, component: id });
}

function visualTree(html: string, id: string) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  // Estado después del montaje de df-rich-pdp.js, con el control inicial al 50 %.
  const comparison = document.querySelector("[data-df-comparison]");
  if (comparison) {
    comparison.setAttribute("data-df-comparison-ready", "true");
    comparison.setAttribute("style", "--df-comparison-position:50%");
    comparison.querySelector(".df-rich__range")?.removeAttribute("hidden");
  }
  document.querySelectorAll("script, link, template, dialog, .df-visually-hidden, [hidden]").forEach(n => n.remove());
  // El reloj del theme se llena por JS; el preview representa el estado con el reloj ya calculado.
  if (id === "shipping-timeline") document.querySelector("[data-df-title]")?.replaceChildren();
  const walk = (element: Element): unknown => ({
    tag: element.localName, classes: element.getAttribute("class") ?? "",
    style: Object.fromEntries((element.getAttribute("style") ?? "").split(";").filter(s => s.trim()).map(s => s.trim().split(/:\s*/))),
    children: [...element.children].map(walk),
  });
  return [...document.body.children].map(walk);
}

describe("contrato visual Liquid → React", () => {
  it.each([
    { quantity: 100, management: "shopify", urgency_text: undefined },
    { quantity: 3, management: "shopify", urgency_text: "Últimas unidades disponibles" },
    { quantity: 0, management: null, urgency_text: "Últimas unidades disponibles" },
    { quantity: 100, management: "shopify", urgency_text: "" },
  ])("urgencia manual: paridad sin depender de stock ($quantity, $management, $urgency_text)", async ({ quantity, management, urgency_text }) => {
    const content = { ...(CATALOG.find(c => c.id === "inventory")!.examples[0] as object), urgency_text };
    const f = { ...facts, inventory: { available: true, quantity, management, policy: "deny" } };
    const Preview = PREVIEWS.inventory;
    const liquid = await liquidMarkup("inventory", content, f, {});
    const react = renderToStaticMarkup(<Preview content={content} facts={f} images={{}} />);
    expect(visualTree(react, "inventory")).toEqual(visualTree(liquid, "inventory"));
    for (const markup of [liquid, react]) {
      const document = parseHTML(markup).document;
      expect(document.querySelector(".df-inventory-urgency")?.textContent.trim() ?? "").toBe(urgency_text ?? "Últimas unidades disponibles");
      expect(document.querySelector("df-inventory .df-inventory__text")).not.toBeNull();
    }
  });
  it("reseñas: recupera las ocho elegidas y conserva su orden, texto y fotos", async () => {
    const reviews = Array.from({ length: 8 }, (_, index) => ({ ...facts.reviews[index % facts.reviews.length], id: `review-${index}` }));
    const f = { ...facts, reviews, count: 8 };
    const content = { items: [...reviews].reverse().map(review => ({ review_id: review.id })) };
    const Preview = PREVIEWS["review-slider"];
    const liquid = await liquidMarkup("review-slider", content, f, {});
    const react = renderToStaticMarkup(<Preview content={content} facts={f} images={{}} />);
    expect(visualTree(react, "review-slider")).toEqual(visualTree(liquid, "review-slider"));
    for (const markup of [liquid, react]) {
      const document = parseHTML(markup).document;
      const cards = [...document.querySelectorAll(".df-review-slider__card")];
      expect(cards.map(card => card.getAttribute("data-review-id"))).toEqual(content.items.map(item => item.review_id));
      expect(cards.map(card => card.querySelector("blockquote p")?.textContent)).toEqual([...reviews].reverse().map(review => review.body));
      expect(document.querySelectorAll(".df-review-slider__avatar img")).toHaveLength(8);
      expect(cards.every(card => card.querySelector(".df-review-slider__avatar")?.parentElement?.classList.contains("df-review-slider__meta"))).toBe(true);
      expect(document.querySelector("[data-df-empty]")).toBeNull();
      expect(document.querySelectorAll('[data-df-dots] button')).toHaveLength(8);
      expect(document.querySelector('[data-df-dots] [aria-current="true"]')?.getAttribute("aria-label")).toBe("Ir a la reseña 1");
      expect(document.querySelector('[data-df-prev], [data-df-next], [data-df-pause], [data-df-review-page], [data-autoplay]')).toBeNull();
    }
  });
  it("resumen de opiniones: paridad de cifras, avatares y marcado minimalista", async () => {
    const liquid = await liquidMarkup("social-proof", {}, facts, {});
    const react = renderToStaticMarkup(<SocialProofPreview facts={facts} />);
    expect(visualTree(react, "social-proof")).toEqual(visualTree(liquid, "social-proof"));
    for (const markup of [liquid, react]) expect(parseHTML(markup).document.querySelector("strong")?.textContent).toBe(`${facts.count.toLocaleString("es-CL")} opiniones hoy`);
  });
  it.each([0, 1, 2, 3, 4])("resumen de opiniones: prioriza %i fotos aunque lleguen después de reseñas sin foto", async photoCount => {
    const reviews = Array.from({ length: 3 + photoCount }, (_, index) => ({
      ...facts.reviews[0], id: `review-${index}`,
      photos: index < 3 ? [] : [`https://example.test/late-photo-${index}.webp`],
    }));
    const f = { ...facts, reviews, count: reviews.length };
    const liquid = await liquidMarkup("social-proof", {}, f, {});
    const react = renderToStaticMarkup(<SocialProofPreview facts={f} />);
    expect(visualTree(react, "social-proof")).toEqual(visualTree(liquid, "social-proof"));
    for (const markup of [liquid, react]) {
      const avatars = [...parseHTML(markup).document.querySelectorAll(".df-social-proof__avatar")];
      expect(avatars).toHaveLength(3);
      expect(avatars.map(avatar => avatar.querySelector("img")?.getAttribute("src") ?? null)).toEqual([
        ...reviews.slice(3, 6).map(review => review.photos[0]),
        ...Array(Math.max(0, 3 - photoCount)).fill(null),
      ]);
    }
  });
  it.each([{ state: "empty" }, { items: [{ review_id: "missing-review" }] }])("reseñas: un carrusel vacío no niega las opiniones disponibles", async content => {
    const Preview = PREVIEWS["review-slider"];
    const liquid = await liquidMarkup("review-slider", content, facts, {});
    const react = renderToStaticMarkup(<Preview content={content} facts={facts} images={{}} />);
    for (const markup of [liquid, react]) {
      expect(parseHTML(markup).document.querySelector('[data-df-empty="review-slider"]')?.textContent.trim()).toContain("Todavía no hay reseñas en este carrusel.");
      expect(markup).not.toContain("no hay reseñas de este producto");
    }
  });
  for (const id of ["use-cases", "usage-steps"]) {
    it.each([true, false])(`${id} image_only conserva paridad y exige imagen (%s)`, async available => {
      const Preview = PREVIEWS[id], slot = id === "use-cases" ? "cases" : "steps";
      const content = { ...(CATALOG.find(c => c.id === id)!.examples[0] as object), display_mode: "image_only", image_alt: "Tres momentos para incorporar el contorno en tu rutina diaria." };
      const images = { [slot]: available ? ["https://example.test/infographic.webp", "https://example.test/retained.webp"] : [] };
      const liquid = await liquidMarkup(id, content, facts, images);
      const react = renderToStaticMarkup(<Preview content={content} facts={facts} images={images} />);
      expect(visualTree(react, id)).toEqual(visualTree(liquid, id));
      for (const markup of [liquid, react]) {
        const document = parseHTML(markup).document;
        expect(document.querySelectorAll("img")).toHaveLength(available ? 1 : 0);
        expect(document.querySelector("details, summary")).toBeNull();
        if (available) {
          expect(document.querySelector("h2, p, .df-rich__number, .df-rich__card")).toBeNull();
          expect(document.querySelector("img")?.getAttribute("alt")).toBe(content.image_alt);
        } else expect(document.querySelector(".df-pdp-empty")).not.toBeNull();
      }
    });
  }
  const ownContent = [
    { id: "review-slider", content: { items: [{ body: "Encuentro cada útil fácilmente en mi escritorio.", name: "Ana", rating: 4.5 }, { excerpt: "La rutina de trabajo ahora es mucho más simple.", name: "Luis" }] } },
    { id: "review-wall", content: { heading: "En el escritorio de cada día", items: [{ body: "Me gusta tener las herramientas a mano al trabajar.", name: "Ana" }, { body: "Aprovecho mejor el espacio en mi mesa.", name: "Luis" }] } },
    { id: "review-stars", content: { label: "{rating} · {count} opiniones", rating: 4.7, count: 12 } },
    { id: "review-stars", content: { label: "Opiniones sobre el producto" } },
    { id: "stats-with-image", content: { ...(CATALOG.find(c => c.id === "stats-with-image")!.examples[0] as Record<string, unknown>), review_id: undefined,
      rating: 4.7, count: 12, testimonial: { body: "Mantengo mis útiles ordenados y los encuentro fácilmente.", name: "Ana" }, stats: [{ value: "2 minutos", label: "para preparar tu espacio" }] } },
  ];
  it.each(ownContent)("$id: muestra contenido propio sin reseñas importadas", async ({ id, content }) => {
    const Preview = PREVIEWS[id];
    const f = { ...EMPTY_FACTS, ...pdpRating([{ id, content }], []) };
    const liquid = await liquidMarkup(id, content, f, {});
    const react = renderToStaticMarkup(<Preview content={content} facts={f} images={{}} />);
    expect(visualTree(react, id)).toEqual(visualTree(liquid, id));
    expect(react).not.toContain("data-df-empty");
    expect(liquid).not.toContain("data-df-empty");
  });
  for (const [name, f] of Object.entries({ normal: facts, sinAhorro: { ...facts, compareAt: undefined, packs: facts.packs?.map(p => ({ ...p, compareAt: undefined, support: undefined })) }, agotado: { ...facts, inventory: { available: false } } })) {
    it(`packs: ${name}, mismo marcado y medidas que el bloque Shopify`, async () => {
      expect(visualTree(renderToStaticMarkup(<PackOffersPreview packs={f.packs ?? []} facts={f} />), "pack-offers"))
        .toEqual(visualTree(await liquidMarkup("pack-offers", {}, f, {}), "pack-offers"));
    });
    it(`precio: ${name}, mismo marcado y medidas que el bloque Shopify`, async () => {
      expect(visualTree(renderToStaticMarkup(<PricePreview facts={f} />), "price"))
        .toEqual(visualTree(await liquidMarkup("price", {}, f, {}), "price"));
    });
  }
  for (const c of CATALOG) {
    const images = Object.fromEntries((c.imageSlots ?? []).map(slot => [slot.key, Array.from({ length: 3 }, (_, i) => `https://example.test/${slot.key}-${i}.webp`)]));
    for (const [index, content] of c.examples.entries()) it(`${c.id}: ejemplo ${index + 1}, misma estructura, clases y medidas inline`, async () => {
      const Preview = PREVIEWS[c.id];
      const liquid = await liquidMarkup(c.id, content, facts, images);
      const react = renderToStaticMarkup(<Preview content={content} facts={facts} images={images} />);
      expect(visualTree(react, c.id)).toEqual(visualTree(liquid, c.id));
    });
    it(`${c.id}: mismo estado sin contenido ni archivos`, async () => {
      const Preview = PREVIEWS[c.id];
      const liquid = await liquidMarkup(c.id, { state: "empty" }, EMPTY_FACTS, {});
      const react = renderToStaticMarkup(<Preview content={{ state: "empty" }} facts={EMPTY_FACTS} images={{}} />);
      expect(visualTree(react, c.id)).toEqual(visualTree(liquid, c.id));
    });
    it(`${c.id}: contenido guardado sin políticas, reseñas ni archivos`, async () => {
      const Preview = PREVIEWS[c.id];
      const partial = { ...EMPTY_FACTS, inventory: facts.inventory };
      const liquid = await liquidMarkup(c.id, c.examples[0], partial, {});
      const react = renderToStaticMarkup(<Preview content={c.examples[0]} facts={partial} images={{}} />);
      expect(visualTree(react, c.id)).toEqual(visualTree(liquid, c.id));
    });
  }
});
