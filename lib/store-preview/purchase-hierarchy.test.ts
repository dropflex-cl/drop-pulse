import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { Liquid } from "liquidjs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { ListingPreview, PricePreview, PurchaseConfidencePreview } from "@/components/store-preview/listing";
import { LISTING_SLOTS } from "@/lib/copy/page-ui";
import { FIXTURE_FACTS } from "./fixture";

describe("oferta antes del despacho", () => {
  it("representa la misma composición en template y React", () => {
    const template = JSON.parse(readFileSync("lib/shopify/themes/DropPulse/templates/product.json", "utf8"));
    const order: string[] = template.sections.main.blocks["product-details"].block_order;
    const positions = ["title", "price", "subtitle", "buy_buttons", "purchase_confidence", "shipping_timeline", "benefit_double_box", "inventory"].map(id => order.indexOf(id));
    expect(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1]))).toBe(true);
    expect(LISTING_SLOTS["shipping-timeline"]).toBe("afterTrust");
    expect(LISTING_SLOTS["benefit-double-box"]).toBe("afterTrust");
    const markup = renderToStaticMarkup(createElement(ListingPreview, {
      content: { title: "Nombre del producto", short_description: "Bajada" }, facts: { ...FIXTURE_FACTS, packs: [] }, images: {},
      slots: { afterTrust: createElement("div", { id: "dispatch" }), afterButton: createElement("div", { id: "inventory" }) },
    }));
    expect(markup.indexOf("Pídelo ahora")).toBeLessThan(markup.indexOf("Sin adelantos"));
    expect(markup.indexOf("Sin adelantos")).toBeLessThan(markup.indexOf('id="dispatch"'));
    expect(markup.indexOf('id="dispatch"')).toBeLessThan(markup.indexOf('id="inventory"'));
  });

  it.each([[true, true], [true, false], [false, true], [false, false]])("solo afirma políticas activas (%s, %s), en Liquid y React", async (cod, free_shipping) => {
    const source = readFileSync("lib/shopify/components/_landing/blocks/df-purchase-confidence.liquid", "utf8").split("{% stylesheet %}")[0].replace(/\{%[-]?\s*doc\s*[-]?%\}[\s\S]*?\{%[-]?\s*enddoc\s*[-]?%\}/g, "");
    const liquid = new Liquid({ root: "lib/shopify/themes/DropPulse/snippets", extname: ".liquid" });
    const read = liquid.options.fs.readFile;
    liquid.options.fs = { ...liquid.options.fs, readFile: async path => (await read(path)).replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, "") };
    liquid.registerFilter("stylesheet_tag", () => "");
    const policies = { cod, free_shipping };
    const html = await liquid.parseAndRender(source, { shop: { metafields: { dropflex: { policies: { value: policies } } } }, block: {}, closest: {} });
    const react = renderToStaticMarkup(createElement(PurchaseConfidencePreview, { facts: { ...FIXTURE_FACTS, policies } }));
    for (const markup of [html, react]) {
      expect(markup.includes("Sin adelantos")).toBe(cod);
      expect(markup.includes("Envío sin costo")).toBe(free_shipping);
      expect(markup.includes("df-purchase-confidence")).toBe(cod || free_shipping);
    }
  });

  it("mantiene los destinos del runtime de precio dentro del nuevo grupo secundario", () => {
    const { document } = parseHTML(renderToStaticMarkup(createElement(PricePreview, { facts: FIXTURE_FACTS })));
    expect(document.querySelector("[data-df-now]")?.textContent).toBe("$24.990");
    const details = document.querySelector(".df-price__details")!;
    expect(details.querySelector("[data-df-was]")?.textContent).toBe("$32.990");
    expect(details.querySelector("[data-df-badge]")?.textContent).toBe("Ahorras $8.000");
  });
});
