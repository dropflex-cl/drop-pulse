import type { PublishInput } from "@/lib/shopify/publish/mapping";
import type { logisticsMetafield, policiesMetafield } from "@/lib/settings/policies";
import { averageRating, type StoreFacts } from "@/lib/store-preview/facts";
import { reviewDate } from "@/lib/reviews/copy";

/** Hechos visibles derivados del mismo snapshot publicado, sin volver a leer selección ni políticas. */
export function previewFacts(input: PublishInput, urls: Record<string, string>, currency: string, verifiedFacts: StoreFacts["verifiedFacts"] = []): StoreFacts {
  const policies = input.shopFacts?.policies as ReturnType<typeof policiesMetafield> | undefined;
  const logistics = input.shopFacts?.logistics as ReturnType<typeof logisticsMetafield> | undefined;
  const gallery = input.gallery.flatMap(g => urls[g.key] ? [urls[g.key]] : []);
  const unit = input.packs.find(p => p.units === 1);
  return {
    productName: input.listing.title, productImage: gallery[0], productImages: gallery,
    packs: input.packs, price: unit?.price ?? 0, compareAt: unit?.compareAt, currency, verifiedFacts,
    reviews: input.reviews.map(r => ({ ...r, date: reviewDate(r.date), iso: r.date, photos: r.photos.flatMap(key => urls[key] ? [urls[key]] : []) })),
    count: input.reviews.length, rating: averageRating(input.reviews),
    policies: { cod: true, free_shipping: policies?.free_shipping ?? false, threshold: policies?.free_shipping_threshold,
      return_days: policies?.return_days, warranty_months: policies?.warranty_months, whatsapp: policies?.whatsapp },
    logistics: logistics ? { min: logistics.handling_days + logistics.transit_days_min, max: logistics.handling_days + logistics.transit_days_max,
      handling: logistics.handling_days, cutoff: logistics.cutoff_hour, saturdayDispatch: logistics.saturday_dispatch,
      saturdayDelivery: logistics.saturday_delivery, businessDaysOnly: logistics.business_days_only, city: logistics.main_city ?? null, extra: logistics.regions_extra_days ?? 0 } : null,
    gifs: (input.components.find(c => c.id === "gif-strip")?.images.gifs ?? []).flatMap(key => urls[key] ? [urls[key]] : []),
  };
}
