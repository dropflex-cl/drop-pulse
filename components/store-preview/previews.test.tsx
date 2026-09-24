import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LISTING } from "@/lib/copy/listing";
import { fill } from "@/lib/store-preview/facts";
import { EMPTY_FACTS, FIXTURE_FACTS } from "@/lib/store-preview/fixture";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { PREVIEWS } from "./registry";
import { StoreFrame } from "./store-frame";

const IMAGES = { main: ["https://example.test/a.jpg"], collage: ["https://example.test/a.jpg", "https://example.test/b.jpg", "https://example.test/c.jpg"], stories: ["https://example.test/s1.jpg", "https://example.test/s2.jpg", "https://example.test/s3.jpg"] };

/** Los textos visibles más largos de un ejemplo (sin claves ni ids), para buscarlos en el render. */
function visibleTexts(value: unknown, key = ""): string[] {
  if (typeof value === "string") return /^(icon|policy|requires|topic|basis|fact|review_id|excerpt_mode)$/.test(key) || value.length < 8 ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((v) => visibleTexts(v, key));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => visibleTexts(v, k));
  return [];
}

/** Muestran un estado a la vez (disponible, con cuenta regresiva): basta con que se vea uno de sus textos. */
const ONE_STATE = ["inventory"];

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

describe("vistas previas de los componentes", () => {
  it("cada componente del catálogo y la ficha tienen la suya", () => {
    expect(Object.keys(PREVIEWS).sort()).toEqual([LISTING, ...CATALOG.map((c) => c.id)].sort());
  });

  for (const c of CATALOG) {
    describe(c.id, () => {
      const Preview = PREVIEWS[c.id];

      it("dibuja cada ejemplo de su content.ts con sus textos", () => {
        for (const example of c.examples) {
          const html = renderToStaticMarkup(
            <StoreFrame accent="#1f4bd8">
              <Preview content={example} facts={FIXTURE_FACTS} images={IMAGES} />
            </StoreFrame>,
          );
          const texts = visibleTexts(example).map((t) => fill(t, FIXTURE_FACTS).replaceAll("**", ""));
          // Al menos la mitad de los textos del ejemplo se ven (algunos dependen del estado: agotado, sin cuenta regresiva…).
          const shown = texts.filter((t) => html.includes(escape(t)));
          const min = ONE_STATE.includes(c.id) ? 1 : Math.ceil(texts.length / 2);
          expect(shown.length, `${c.id}: se ven ${shown.length} de ${texts.length}`).toBeGreaterThanOrEqual(min);
        }
      });

      it("no se rompe a medio editar ni sin datos de la tienda", () => {
        expect(() => renderToStaticMarkup(<Preview content={{}} facts={EMPTY_FACTS} images={{}} />)).not.toThrow();
        expect(() => renderToStaticMarkup(<Preview content={c.examples[0]} facts={EMPTY_FACTS} images={{}} />)).not.toThrow();
      });

      it("nunca muestra un token sin llenar", () => {
        const html = renderToStaticMarkup(<Preview content={c.examples[0]} facts={FIXTURE_FACTS} images={IMAGES} />);
        expect(html).not.toMatch(/\{[a-z_]+\}/);
      });
    });
  }
});

describe("gif-strip: el GIF N lleva el texto N", () => {
  const Preview = PREVIEWS["gif-strip"];
  const example = CATALOG.find((c) => c.id === "gif-strip")!.examples[0] as { gifs: { heading: string }[] };
  const gifs = ["https://example.test/1.webp", "https://example.test/2.webp", "https://example.test/3.webp"];

  it("con 3 GIF se ven los 3 primeros textos, en orden", () => {
    const html = renderToStaticMarkup(<Preview content={example} facts={{ ...FIXTURE_FACTS, gifs }} images={{}} />);
    expect(html.match(/df-gif-strip__item/g)).toHaveLength(3);
    // Cada GIF va bajo su título y antes del título siguiente.
    const at = (t: string) => html.indexOf(escape(t));
    gifs.forEach((src, i) => {
      expect(at(example.gifs[i].heading)).toBeGreaterThan(-1);
      expect(html.indexOf(src)).toBeGreaterThan(at(example.gifs[i].heading));
      if (i < gifs.length - 1) expect(html.indexOf(src)).toBeLessThan(at(example.gifs[i + 1].heading));
    });
    for (const t of example.gifs.slice(3)) expect(html).not.toContain(escape(t.heading));
  });

  it("sin GIF muestra los 5 textos para revisarlos", () => {
    const html = renderToStaticMarkup(<Preview content={example} facts={FIXTURE_FACTS} images={{}} />);
    expect(html.match(/df-gif-strip__item/g)).toHaveLength(5);
    expect(html).not.toContain("<img");
  });
});
