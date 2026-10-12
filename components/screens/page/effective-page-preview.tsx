import { ListingPreview } from "@/components/store-preview/listing";
import { StoreFrame } from "@/components/store-preview/store-frame";
import { PREVIEWS } from "@/components/store-preview/registry";
import { LISTING_SLOTS, type ListingSlot } from "@/lib/copy/page-ui";
import { effectiveRating, effectivePage, pagePlacement } from "@/lib/products/effective-page";
import type { LandingSelection } from "@/lib/copy/variants";
import type { ProductPageContent } from "@/lib/types";

/** Sin contenido de ejemplo ni selección paralela: cada archivo y variante salen de la entrada de publicación. */
export function EffectivePagePreview({ page, selection, accent }: { page: ProductPageContent; selection?: LandingSelection; accent?: string | null }) {
  const resolved = effectivePage(page.input, selection);
  const facts = { ...page.facts, productName: resolved.listing.title, ...effectiveRating(page.input, selection) };
  const draw = (component: (typeof resolved.components)[number]) => {
    const Preview = PREVIEWS[component.id];
    if (!Preview) return null;
    const images = Object.fromEntries(Object.entries(component.images).map(([slot, keys]) => [slot, keys.flatMap(key => page.urls[key] ? [page.urls[key]] : [])]));
    return <Preview key={component.id} content={component.content} facts={facts} images={images} />;
  };
  const slots: Partial<Record<ListingSlot, React.ReactNode>> = {};
  for (const slot of ["top", "afterPrice", "afterButton"] as const) {
    slots[slot] = resolved.components.filter(c => pagePlacement(c.id) === "hero" && (LISTING_SLOTS[c.id] ?? "afterButton") === slot).map(draw);
  }
  return <StoreFrame accent={accent === undefined ? page.input.accent : accent}>
    <ListingPreview content={resolved.listing} facts={facts} images={{}} slots={slots} />
    {resolved.components.filter(c => pagePlacement(c.id) === "body").map(draw)}
  </StoreFrame>;
}
