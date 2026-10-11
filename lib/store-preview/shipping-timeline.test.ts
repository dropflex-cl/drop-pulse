import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PREVIEWS } from "@/components/store-preview/registry";
import type { StoreFacts } from "./facts";

const facts: StoreFacts = {
  productName: "Producto",
  price: 24990,
  currency: "CLP",
  reviews: [],
  rating: null,
  count: 0,
  policies: { cod: true, free_shipping: true },
  logistics: { min: 1, max: 3, handling: 0, cutoff: 9 },
};

function preview(content: unknown, logistics = facts.logistics) {
  return renderToStaticMarkup(createElement(PREVIEWS["shipping-timeline"], {
    content, facts: { ...facts, logistics }, images: {},
  }));
}

describe("entrega permanente", () => {
  it("usa los textos del bloque con logística real aunque el contenido esté vacío", () => {
    for (const content of [null, {}, { state: "empty" }]) {
      const html = preview(content);
      expect(html).toContain("<df-shipping-timeline");
      expect(html).toContain("data-df-delivery");
      expect(html).not.toContain("Consulta el plazo de entrega");
    }
  });

  it("no calcula fechas de ejemplo sin logística completa", () => {
    for (const logistics of [null, { min: 1, max: 3 }, { ...facts.logistics!, cutoff: null }]) {
      const html = preview({}, logistics);
      expect(html).not.toContain("<df-shipping-timeline");
      expect(html).toContain("Consulta el plazo de entrega antes de confirmar tu pedido.");
      expect(html).not.toContain("ingresar tu dirección");
    }
  });
});
