import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { EMPTY_FACTS, FIXTURE_FACTS } from "@/lib/store-preview/fixture";
import { PREVIEWS } from "./registry";

describe("PDP siempre visible y honesta", () => {
  for (const c of CATALOG)
    it(`${c.id}: el estado vacío se ve sin simular pruebas`, () => {
      const Preview = PREVIEWS[c.id];
      const html = renderToStaticMarkup(
        <Preview
          content={{ state: "empty" }}
          facts={EMPTY_FACTS}
          images={{}}
        />,
      );
      expect(html).toContain(`data-df-empty="${c.id}"`);
      expect(html).not.toMatch(
        /DropFlex|AliExpress|\{[a-z_]+\}|reseñas aprobadas|generar|\$\d/,
      );
    });
  it("las historias muestran reseñas reales y omiten IDs que ya no existen", () => {
    const Preview = PREVIEWS["customer-stories"];
    const html = renderToStaticMarkup(
      <Preview
        content={{
          heading: "Experiencias reales",
          stories: [
            { title: "En su rutina", review_id: FIXTURE_FACTS.reviews[0].id },
            { title: "Una historia falsa", review_id: "fake" },
          ],
        }}
        facts={FIXTURE_FACTS}
        images={{}}
      />,
    );
    expect(html).toContain(FIXTURE_FACTS.reviews[0].author);
    expect(html).toContain(FIXTURE_FACTS.reviews[0].body);
    expect(html).not.toContain("Una historia falsa");
  });
  it("antes/después exige ambas fotos y conserva etiquetas accesibles", () => {
    const Preview = PREVIEWS["before-after"],
      content = CATALOG.find((c) => c.id === "before-after")!.examples[0];
    expect(
      renderToStaticMarkup(
        <Preview
          content={content}
          facts={FIXTURE_FACTS}
          images={{ before: ["/before.webp"] }}
        />,
      ),
    ).toContain('data-df-empty="before-after"');
    const html = renderToStaticMarkup(
      <Preview
        content={content}
        facts={FIXTURE_FACTS}
        images={{ before: ["/before.webp"], after: ["/after.webp"] }}
      />,
    );
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-label="Proporción visible');
  });
  it("el cierre calcula precios y ahorros desde los packs", () => {
    const Preview = PREVIEWS["offer-summary"];
    const html = renderToStaticMarkup(
      <Preview
        content={{ heading: "Elige tu pack", body: "Revisa tus opciones." }}
        facts={{
          ...FIXTURE_FACTS,
          packs: [{ units: 2, price: 39990, compareAt: 59980 }],
        }}
        images={{}}
      />,
    );
    expect(html).toContain("$39.990");
    expect(html).toContain("$19.990");
    expect(html).toContain("Paga al recibir");
    expect(html).not.toMatch(/Quedan \d|termina hoy|gratis.*regalo/i);
  });
});
