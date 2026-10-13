import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Liquid } from "liquidjs";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { listingSchema, LISTING_RULES } from "@/lib/copy/listing";
import {
  productMetafields,
  productSetInput,
  type PublishInput,
} from "@/lib/shopify/publish/mapping";
import { ListingPreview } from "@/components/store-preview/listing";
import type { StoreFacts } from "@/lib/store-preview/facts";
import { componentCapabilityCatalog } from "./component-capabilities";
import { componentGenerationContext } from "./component-generation";
import { visualFixture } from "./visual-fixtures";
import { parseToolInput } from "./validation";
import { publishedSchemas } from "./mcp";

const listing = {
  title: "Pack 2 Contorno de Ojos Caviar SADOER",
  short_name: "Contorno Caviar SADOER",
  short_description:
    "Un paso de cuidado para el contorno de ojos, con caviar y ácido hialurónico.",
  offer_line: "Pack 2 por $24.990 · Paga al recibir",
  seo_title: "Contorno de ojos SADOER con caviar y ácido hialurónico",
  seo_description:
    "Pack de contorno de ojos SADOER con caviar y ácido hialurónico. Consulta el contenido y paga al recibir en tu casa.",
};
const clean = (path: string) =>
  readFileSync(path, "utf8").replace(
    /\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g,
    "",
  );

describe("listing: nombre, bajada y SEO independientes", () => {
  it("expone las mismas reglas en catálogo, contexto y schema de escritura MCP sin invalidar la ficha anterior", () => {
    const f = visualFixture();
    f.state.knowledge = {
      product: {},
      context: null,
      pricing: {},
      policies: {},
      graph: {},
      strategy: null,
      landing: { rows: [], review_count: 0, image_catalog: [], reviews: [] },
    };
    expect(
      componentCapabilityCatalog().find((c) => c.component === "listing")
        ?.rules,
    ).toEqual(LISTING_RULES);
    expect(
      componentGenerationContext(f.state, "listing").component.rules,
    ).toEqual(LISTING_RULES);
    expect(
      JSON.stringify(publishedSchemas().save_landing_content.input),
    ).toContain("Nombre visible del producto (H1 y título nativo de Shopify)");
    expect(listingSchema.parse(listing)).toEqual(listing);
    expect(
      listingSchema.parse({
        ...listing,
        title: "Pack 2 Contorno de Ojos Caviar SADOER | Cuidado de la mirada",
      }).title,
    ).toContain("Cuidado de la mirada");
  });
  it("conserva los tres textos desde escritura MCP hasta payload, Liquid y preview, incluidas variantes", async () => {
    const command = parseToolInput("save_landing_content", {
      product_id: randomUUID(),
      schema_version: "1.1",
      entries: [{ component: "listing", content: listing }],
    });
    const content = command.entries[0].content as typeof listing;
    const input: PublishInput = {
      listing: content,
      listingVariants: [
        { key: "default", angle_id: null, hook_id: null, content },
        {
          key: "routine",
          angle_id: "routine",
          hook_id: null,
          content: {
            ...content,
            short_description:
              "Integra un paso de cuidado para el contorno de ojos en tu rutina diaria.",
          },
        },
      ],
      components: [],
      packs: [],
      reviews: [],
      gallery: [],
      accent: null,
    };
    const native = productSetInput(
      input,
      {
        id: "gid://shopify/Product/1",
        options: [],
        variants: [
          {
            id: "gid://shopify/ProductVariant/1",
            title: "Default Title",
            option: "Default Title",
            sku: "TEST",
          },
        ],
      },
      new Map(),
    );
    expect(native.title).toBe(content.title);
    expect(native.seo).toEqual({
      title: content.seo_title,
      description: content.seo_description,
    });
    const fields = productMetafields(input, new Map()).set;
    expect(fields.find((m) => m.key === "subtitle")?.value).toBe(
      content.short_description,
    );
    const variants = JSON.parse(
      fields.find((m) => m.key === "landing_listing")!.value,
    );
    expect(variants[1].content.short_description).not.toBe(
      variants[0].content.short_description,
    );
    const engine = new Liquid();
    engine.registerFilter("asset_url", (v: string) => v);
    engine.registerFilter("stylesheet_tag", () => "");
    for (const variant of variants) {
      const globals = {
        product: { title: "Nombre anterior", metafields: { dropflex: {} } },
        content: variant.content,
        df_variant: { angle_id: "routine" },
        block: { settings: {} },
      };
      const html =
        (await engine.parseAndRender(
          clean(
            "lib/shopify/components/_landing/snippets/df-title-content.liquid",
          ),
          globals,
        )) +
        (await engine.parseAndRender(
          clean(
            "lib/shopify/components/_landing/snippets/df-subtitle-content.liquid",
          ),
          globals,
        ));
      const doc = parseHTML(html).document;
      expect(doc.querySelector("h1")?.textContent.trim()).toBe(
        variant.content.title,
      );
      expect(doc.querySelector(".df-subtitle")?.textContent.trim()).toBe(
        variant.content.short_description,
      );
      const facts: StoreFacts = {
        productName: "Nombre anterior",
        price: 24990,
        currency: "CLP",
        reviews: [],
        rating: null,
        count: 0,
        policies: { cod: true, free_shipping: true },
        logistics: null,
      };
      const preview = parseHTML(
        renderToStaticMarkup(
          createElement(ListingPreview, {
            content: variant.content,
            facts,
            images: {},
          }),
        ),
      ).document;
      expect(preview.querySelector("h1")?.textContent).toBe(
        doc.querySelector("h1")?.textContent.trim(),
      );
      expect(preview.querySelector(".df-subtitle")?.textContent).toBe(
        doc.querySelector(".df-subtitle")?.textContent.trim(),
      );
    }
  });
});
