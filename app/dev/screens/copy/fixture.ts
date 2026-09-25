// Datos de ejemplo de la página del producto (etapa Página del producto): la ficha y cada componente
// con el primer ejemplo de su content.ts, y una tienda con reseñas aprobadas (lib/store-preview/fixture.ts).
import { ACCENT_PALETTE } from "@/lib/copy/accent";
import { LISTING, type Listing } from "@/lib/copy/listing";
import { copyProgress } from "@/lib/copy/progress";
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { FIXTURE_FACTS } from "@/lib/store-preview/fixture";
import type { CatalogImage, ContentStatus, PageComponentView, ProductCopy } from "@/lib/types";

const NOW = "2026-09-24T10:00:00Z";

const LISTING_EXAMPLE: Listing = {
  title: "Corrector de postura ajustable para trabajar sentado",
  short_name: "Corrector de postura",
  short_description: "Te ayuda a mantener la espalda recta mientras trabajas. Se ajusta con velcro y no se nota bajo la ropa.",
  offer_line: "2 por $39.990 · Paga al recibir",
  seo_title: "Corrector de postura ajustable para la oficina",
  seo_description: "Corrector de postura con ajuste de velcro y tela respirable. Paga al recibir en tu casa.",
};

const IMAGES: CatalogImage[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  source: n <= 3 ? "reference" : "page_image",
  id: `img-${n}`,
  src: productImage(n, 1),
  origin: n <= 3 ? "Información base" : "Generada",
}));

/** En uso y aprobados en la revisión de ejemplo. */
const IN_USE = ["review-stars", "benefit-usps", "inventory", "shipping-timeline", "benefit-double-box", "image-with-benefits", "faq-and-text"];

function components(state: string): PageComponentView[] {
  const listingStatus: ContentStatus = state === "done" ? "aprobado" : "generado";
  const used = state === "fresh" ? [] : IN_USE;
  return [
    { id: "p0", component: LISTING, content: LISTING_EXAMPLE, edited: false, enabled: true, status: listingStatus, images: [] },
    ...CATALOG.map((c, i) => ({
      id: `p${i + 1}`,
      component: c.id,
      content: c.examples[0],
      edited: c.id === "faq-and-text" && state === "done",
      enabled: used.includes(c.id),
      status: (used.includes(c.id) ? "aprobado" : "generado") as ContentStatus,
      images: c.id === "image-with-benefits" && used.includes(c.id) ? [{ slot: "main", source: "reference" as const, id: "img-1" }] : [],
    })),
  ];
}

export function fixture(state: string): ProductCopy {
  const withPage = ["review", "done", "stale", "fresh"].includes(state);
  const list = withPage ? components(state) : [];
  const run: ProductCopy["run"] =
    state === "writing"
      ? { id: "r1", status: "running", createdAt: NOW }
      : state === "failed"
        ? { id: "r1", status: "failed", error: "La IA escribió textos que no cumplen las reglas. Toca Reintentar.", createdAt: NOW }
        : withPage
          ? { id: "r1", status: "succeeded", createdAt: NOW }
          : undefined;
  const brief = (slot: number, status: ContentStatus) => ({ slot, name: ["", "La crema sella", "Tengo 38", "Lleva 3"][slot], status, generation: "succeeded" as const });
  const locked = state === "locked";
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    avatar: { status: "aprobado", createdAt: NOW },
    reviews: { pending: 0, approved: 6, total: 6 },
    angles: { ranking: { status: "succeeded", confirmed: true }, briefs: [brief(1, "aprobado"), brief(2, locked ? "revision" : "aprobado")] },
    copy: run ? { run: { status: run.status, error: run.error }, progress: copyProgress(list) } : null,
    // Imágenes va antes de la página: con los ángulos listos, la galería ya está elegida.
    images: locked ? null : { running: false, rendering: 0, options: 8, cover: true, gallery: 5 },
  });
  return {
    product: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Corrector de postura",
      image: productImage(1, 1),
      sku: "",
      filter: pos.filter,
      meter: pos.meter,
      reason: pos.reason,
      tone: pos.tone,
      nextStage: pos.nextStage,
      stages: pos.stages,
      summary: pos.summary,
      status: pos.status,
      anglesPhase: pos.anglesPhase,
      copyPhase: pos.copyPhase,
      supplierCost: 6900,
      price: 24990,
      currency: "CLP",
    },
    // Con la página lista, un color ya elegido (Esmeralda); en los demás, sin elegir.
    accent: state === "done" ? ACCENT_PALETTE[4].hex : null,
    locked: locked ? "angles" : null,
    run,
    components: list,
    images: IMAGES,
    facts: { ...FIXTURE_FACTS, productImage: productImage(1, 1) },
    stale: state === "stale",
  };
}
