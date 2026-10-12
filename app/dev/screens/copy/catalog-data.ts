import { componentName, componentPitch } from "@/lib/copy/page-ui";
import { productImage } from "@/lib/mock/images";
import { CATALOG } from "@/lib/shopify/components/catalog";
import type { StoreFacts } from "@/lib/store-preview/facts";
import { fixture } from "./fixture";

export const CATALOG_GROUPS = [
  { id: "listing", title: "Ficha del producto", description: "Galería, título, beneficios, precio y packs en su orden de tienda." },
  { id: "purchase", title: "Bloques de compra", description: "Piezas de la columna del producto: confianza, disponibilidad, entrega y medios." },
  { id: "benefits", title: "Secciones de beneficios y uso", description: "Qué resuelve el producto, cómo funciona y qué incluye." },
  { id: "demonstration", title: "Secciones de demostración", description: "Comparación visual e historias del producto en uso." },
  { id: "social-proof", title: "Secciones de prueba social", description: "Reseñas, testimonios, resultados y respaldo." },
  { id: "closing", title: "Secciones de oferta y cierre", description: "Comparativa, garantías, preguntas frecuentes y oferta final." },
] as const;
export type CatalogPreviewGroup = (typeof CATALOG_GROUPS)[number];

export interface CatalogPreviewEntry {
  id: string;
  name: string;
  description: string;
  kind: "listing" | "block" | "section";
  group: (typeof CATALOG_GROUPS)[number]["id"];
  examples: { content: unknown; images: Record<string, string[]> }[];
}

const SECTION_GROUP: Record<string, CatalogPreviewEntry["group"]> = {
  "before-after": "demonstration", "insta-story": "demonstration",
  "stats-with-image": "social-proof", "customer-stories": "social-proof",
  "review-wall": "social-proof", "expert-endorsement": "social-proof",
  "comparison-table": "closing", guarantee: "closing",
  "faq-and-text": "closing", "offer-summary": "closing",
};

/** Fixtures exclusivas de /dev: no guardan ni seleccionan contenido del comerciante. */
export function previewCatalogData(): { entries: CatalogPreviewEntry[]; groups: readonly CatalogPreviewGroup[]; facts: StoreFacts; accent: string | null } {
  const data = fixture("done");
  const photos = Array.from({ length: 6 }, (_, i) => productImage(i, 1));
  const facts: StoreFacts = {
    ...data.facts,
    productImages: photos,
    inventory: { available: true, quantity: 30, management: "shopify", policy: "deny" },
    policies: { ...data.facts.policies, warranty_months: 6, whatsapp: "+56912345678", threshold: 29990 },
    logistics: { min: 2, max: 5, handling: 1, cutoff: 14, businessDaysOnly: true },
    gifs: photos.slice(0, 5),
  };
  const listing = data.components.find(c => c.component === "listing")!;
  return {
    facts, accent: data.accent, groups: CATALOG_GROUPS,
    entries: [
      {
        id: "listing", name: componentName("listing"), kind: "listing", group: "listing",
        description: CATALOG_GROUPS[0].description,
        examples: [{ content: { ...(listing.content as Record<string, unknown>), gallery_benefits: [
          { icon: "feather", text: "Ligero y discreto" },
          { icon: "ruler", text: "Ajuste a tu medida" },
          { icon: "shield", text: "Apoyo para tu postura" },
        ] }, images: {} }],
      },
      ...CATALOG.map(c => ({
        id: c.id, name: componentName(c.id), description: componentPitch(c), kind: c.kind,
        group: c.kind === "block" ? "purchase" as const : SECTION_GROUP[c.id] ?? "benefits",
        examples: c.examples.map(content => {
          const values = content as Record<string, unknown>;
          const images: Record<string, string[]> = Object.fromEntries((c.imageSlots ?? []).map(slot => {
            const list = values[slot.key];
            const count = Math.min(slot.max, Math.max(slot.min, Array.isArray(list) ? list.length : 3));
            return [slot.key, Array.from({ length: count }, (_, i) => photos[i % photos.length])];
          }));
          if (c.id === "ugc-slider") {
            const count = Array.isArray(values.captions) ? values.captions.length : 3;
            // StoreFrame es inerte: muestra las tarjetas y sus pósters, sin solicitar videos.
            images.videos = Array.from({ length: count }, () => "about:blank");
            images.posters = photos.slice(0, count);
          }
          return { content, images };
        }),
      })),
    ],
  };
}
