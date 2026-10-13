import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LISTING } from "@/lib/copy/listing";
import { fill, reviewProof } from "@/lib/store-preview/facts";
import { EMPTY_FACTS, FIXTURE_FACTS } from "@/lib/store-preview/fixture";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { imageOnlyPdpSlot } from "@/lib/shopify/components/_shared/pdp-content";
import { parseHTML } from "linkedom";
import { PREVIEWS } from "./registry";
import { StoreFrame } from "./store-frame";

const IMAGES = {
  before: ["https://example.test/before.jpg"],
  after: ["https://example.test/after.jpg"],
  cases: ["https://example.test/cases.jpg"],
  steps: ["https://example.test/steps.jpg"],
  main: ["https://example.test/a.jpg"],
  collage: [
    "https://example.test/a.jpg",
    "https://example.test/b.jpg",
    "https://example.test/c.jpg",
  ],
  stories: [
    "https://example.test/s1.jpg",
    "https://example.test/s2.jpg",
    "https://example.test/s3.jpg",
  ],
  videos: ["https://example.test/1.mp4", "https://example.test/2.mp4", "https://example.test/3.mp4"],
};

/** Los textos visibles más largos de un ejemplo (sin claves ni ids), para buscarlos en el render. */
function visibleTexts(value: unknown, key = ""): string[] {
  if (typeof value === "string")
    return /^(icon|policy|requires|topic|basis|fact|fact_id|review_id|excerpt_mode)$/.test(
      key,
    ) || value.length < 8
      ? []
      : [value];
  if (Array.isArray(value)) return value.flatMap((v) => visibleTexts(v, key));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => visibleTexts(v, k));
  return [];
}

/**
 * Con 30 reseñas o más no aplica la proporción («9 de cada 10…»): así se ven las plantillas de la IA.
 * Las reseñas de relleno van al final, para no cambiar las que eligen los ejemplos por id.
 */
const MANY_REVIEWS = {
  ...FIXTURE_FACTS,
  logistics: { min: 2, max: 5, handling: 0, cutoff: 14 },
  policies: { ...FIXTURE_FACTS.policies, warranty_months: 6, whatsapp: "+56912345678", threshold: 29990 },
  gifs: Array.from({ length: 5 }, (_, i) => `https://example.test/${i}.webp`),
  reviews: [
    ...FIXTURE_FACTS.reviews,
    ...Array.from(
      { length: Math.max(0, 30 - FIXTURE_FACTS.reviews.length) },
      (_, i) => ({ ...FIXTURE_FACTS.reviews[0], id: `relleno-${i}` }),
    ),
  ],
};

/** Muestran un estado a la vez (disponible, con cuenta regresiva): basta con que se vea uno de sus textos. */
const ONE_STATE = ["inventory"];

const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");

describe("vistas previas de los componentes", () => {
  it("cada componente del catálogo y la ficha tienen la suya", () => {
    expect(Object.keys(PREVIEWS).sort()).toEqual(
      [LISTING, ...CATALOG.map((c) => c.id)].sort(),
    );
  });

  for (const c of CATALOG) {
    describe(c.id, () => {
      const Preview = PREVIEWS[c.id];

      it("dibuja cada ejemplo de su content.ts con sus textos", () => {
        for (const example of c.examples) {
          const html = renderToStaticMarkup(
            <StoreFrame accent="#1f4bd8">
              <Preview content={example} facts={c.id === "shipping-timeline" ? { ...MANY_REVIEWS, logistics: { min: 1, max: 3, handling: 0, cutoff: 9 } } : MANY_REVIEWS} images={IMAGES} />
            </StoreFrame>,
          );
          const imageSlot = imageOnlyPdpSlot(c.id, example);
          if (imageSlot) {
            const document = parseHTML(html).document;
            expect(document.querySelector("img")?.getAttribute("alt")).toBe((example as { image_alt: string }).image_alt);
            expect(document.querySelector("img")?.getAttribute("src")).toBe(IMAGES[imageSlot as "cases" | "steps"][0]);
            expect(document.querySelector("h2, p, details, .df-rich__number")).toBeNull();
            continue;
          }
          // Sin logística, mostrar disponibilidad sin fabricar ventas o plazos.
          if (c.id === "inventory") {
            expect(html).toContain("La disponibilidad se actualiza en Shopify");
            expect(html).not.toContain("vendidos esta semana");
            continue;
          }
          if (c.id === "shipping-timeline") {
            const document = parseHTML(html).document;
            expect(document.querySelector(".df-shipping-timeline__ticket")).not.toBeNull();
            expect(document.querySelector(".df-shipping-timeline__parcel")).not.toBeNull();
            expect(document.querySelector("[data-df-seconds]")).not.toBeNull();
            expect(document.querySelector(".df-shipping-timeline__steps")).toBeNull();
            const texts = JSON.parse(document.querySelector("[data-df-texts]")!.textContent);
            const native = example as { countdown_template: string; arrival_template?: string; cutoff_template?: string; dispatch_template?: string };
            expect(texts.countdown).toBe(native.countdown_template);
            expect(texts.arrival).toBe(native.arrival_template ?? "Recíbelo desde {arrive}");
            expect(texts.cutoff).toBe(native.cutoff_template ?? "Confirma antes de {cutoff}");
            expect(texts.dispatch).toBe(native.dispatch_template ?? "Despacho estimado: {ship}");
            continue;
          }
          if (c.id === "review-slider") {
            for (const item of (example as { items: { review_id: string; excerpt: string }[] }).items) {
              if (MANY_REVIEWS.reviews.some(r => r.id === item.review_id)) expect(html).toContain(escape(item.excerpt));
            }
            continue;
          }
          if (c.id === "review-stars") {
            expect(html).toContain("4,7 · 6 reseñas");
            expect(html).toContain("df-review-stars--compact");
            continue;
          }
          const texts = visibleTexts(example).map((t) =>
            fill(t, MANY_REVIEWS).replaceAll("**", ""),
          );
          // Al menos la mitad de los textos del ejemplo se ven (algunos dependen del estado: agotado, sin cuenta regresiva…).
          const shown = texts.filter((t) => html.includes(escape(t)));
          const min = ONE_STATE.includes(c.id)
            ? 1
            : Math.ceil(texts.length / 2);
          expect(
            shown.length,
            `${c.id}: se ven ${shown.length} de ${texts.length}`,
          ).toBeGreaterThanOrEqual(min);
        }
      });

      if(c.id === "review-slider") it("respeta ids, extractos y orden; omite reseñas que ya no existen",()=>{
        const facts = { ...MANY_REVIEWS, reviews: MANY_REVIEWS.reviews.slice(0,3).map((r,i) => ({ ...r, id: `review-${i}`, body: `Texto completo del comprador ${i}` })) };
        const picked = [facts.reviews[1], facts.reviews[0]];
        const content = { items: [...picked.map((r,i)=>({ review_id:r.id, excerpt:`Extracto guardado ${i}`,excerpt_mode:"condensed" })), { review_id:"missing", excerpt:"No debe verse", excerpt_mode:"verbatim" }] };
        const html = renderToStaticMarkup(<Preview content={content} facts={facts} images={{}} />);
        expect(html.indexOf("Extracto guardado 0")).toBeLessThan(html.indexOf("Extracto guardado 1"));
        expect(html).not.toContain("No debe verse");
        for(const review of facts.reviews.slice(2)) expect(html).not.toContain(escape(review.body));
      });

      if (c.id === "review-stars") {
        it("respeta el modo compacto del template aunque haya pocas reseñas", () => {
          const proof = reviewProof(FIXTURE_FACTS.reviews);
          expect(proof).not.toBe("");
          const html = renderToStaticMarkup(
            <Preview
              content={c.examples[0]}
              facts={FIXTURE_FACTS}
              images={IMAGES}
            />,
          );
          expect(html).not.toContain(proof);
          expect(html).toContain("4,7 · 6 reseñas");
        });
      }

      it("no se rompe a medio editar ni sin datos de la tienda", () => {
        expect(() =>
          renderToStaticMarkup(
            <Preview content={{}} facts={EMPTY_FACTS} images={{}} />,
          ),
        ).not.toThrow();
        expect(() =>
          renderToStaticMarkup(
            <Preview content={c.examples[0]} facts={EMPTY_FACTS} images={{}} />,
          ),
        ).not.toThrow();
      });

      it("nunca muestra un token sin llenar", () => {
        const html = renderToStaticMarkup(
          <Preview
            content={c.examples[0]}
            facts={FIXTURE_FACTS}
            images={IMAGES}
          />,
        );
        expect(html).not.toMatch(/\{[a-z_]+\}/);
      });
    });
  }
});

describe("gif-strip: el GIF N lleva el texto N", () => {
  const Preview = PREVIEWS["gif-strip"];
  const example = CATALOG.find((c) => c.id === "gif-strip")!.examples[0] as {
    gifs: { heading: string }[];
  };
  const gifs = [
    "https://example.test/1.webp",
    "https://example.test/2.webp",
    "https://example.test/3.webp",
  ];

  it("con 3 GIF se ven los 3 primeros textos, en orden", () => {
    const html = renderToStaticMarkup(
      <Preview
        content={example}
        facts={{ ...FIXTURE_FACTS, gifs }}
        images={{}}
      />,
    );
    expect(html.match(/df-gif-strip__item/g)).toHaveLength(3);
    // Cada GIF va bajo su título y antes del título siguiente.
    const at = (t: string) => html.indexOf(escape(t));
    gifs.forEach((src, i) => {
      expect(at(example.gifs[i].heading)).toBeGreaterThan(-1);
      expect(html.indexOf(src)).toBeGreaterThan(at(example.gifs[i].heading));
      if (i < gifs.length - 1)
        expect(html.indexOf(src)).toBeLessThan(at(example.gifs[i + 1].heading));
    });
    for (const t of example.gifs.slice(3))
      expect(html).not.toContain(escape(t.heading));
  });

  it("sin GIF muestra el mismo estado vacío que la tienda", () => {
    const html = renderToStaticMarkup(
      <Preview content={example} facts={FIXTURE_FACTS} images={{}} />,
    );
    expect(html).toContain('data-df-empty="gif-strip"');
    expect(html).not.toContain("df-gif-strip__item");
    expect(html).not.toContain("<img");
  });
});
