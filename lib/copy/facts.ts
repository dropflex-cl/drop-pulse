import "server-only";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import { GIFS } from "@/lib/page-images/catalog";
import { pageImageRows, signedPageUrls } from "@/lib/page-images/store";
import { getPricingPlan } from "@/lib/pricing/store";
import { baseImage, getProductRow, listImageRows, withDisplayUrls } from "@/lib/products/store";
import { reviewDate } from "@/lib/reviews/copy";
import { approvedReviewRows, displayText } from "@/lib/reviews/rows";
import { signPhotos } from "@/lib/reviews/store";
import { deliveryDays, type StorePolicies } from "@/lib/settings/policies";
import { getStorePolicies } from "@/lib/settings/policies-store";
import { averageRating, packCompareAt, type StoreFacts } from "@/lib/store-preview/facts";

// Los datos reales que llenan los componentes en la vista previa de la etapa Página del producto:
// las reseñas aprobadas, el precio y los packs, los envíos y políticas de Ajustes y los GIF de
// Imágenes. Lo que la tienda todavía no tiene cargado se muestra con un ejemplo marcado.

export async function storeFacts(userId: string, productId: string): Promise<StoreFacts> {
  const [product, pricing, labels, images, reviews, settings, pageRows] = await Promise.all([
    getProductRow(userId, productId),
    getPricingPlan(userId, productId),
    latestPackLabels(userId, productId),
    listImageRows(userId, [productId]),
    approvedReviewRows(userId, productId),
    getStorePolicies(userId),
    pageImageRows(userId, [productId]),
  ]);
  const cover = baseImage(images) ?? images[0];
  // Los GIF en uso, en su orden (los mismos que publica gif-strip).
  const gifPaths = pageRows
    .filter((r) => r.slot === GIFS && r.status === "approved" && r.storage_path)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((r) => r.storage_path!);
  const [urls, photos, gifUrls] = await Promise.all([
    cover ? withDisplayUrls([cover]) : new Map<string, string>(),
    signPhotos(reviews),
    signedPageUrls(gifPaths),
  ]);
  const p = settings?.policies;
  // Solo las etiquetas aprobadas llegan a la tienda (igual que a los prompts).
  const approved = labels?.status === "approved" ? labels.payload : [];
  return {
    productName: product?.title ?? "",
    productImage: cover ? urls.get(cover.id) : undefined,
    price: pricing?.salePrice ?? Number(product?.price ?? 0),
    compareAt: pricing?.compareAtPrice ?? (product?.compare_at_price == null ? undefined : Number(product.compare_at_price)),
    currency: pricing?.currency ?? product?.currency ?? "CLP",
    packs: (pricing?.packs ?? []).map((p) => {
      const l = approved.find((x) => x.units === p.units);
      return {
        units: p.units,
        price: p.price,
        compareAt: packCompareAt(p.units, p.price, pricing!.salePrice, pricing!.compareAtPrice),
        label: l?.label,
        support: l?.support ?? undefined,
        badge: l?.badge ?? undefined,
      };
    }),
    reviews: reviews.map((r) => ({
      id: r.id,
      author: r.author,
      rating: r.rating,
      body: displayText(r),
      country: r.country ?? undefined,
      date: reviewDate(r.reviewed_at),
      photos: r.photos.map((p) => photos.get(p.path)).filter((u): u is string => Boolean(u)),
    })),
    rating: averageRating(reviews),
    count: reviews.length,
    // Lo mismo que se publica en shop.metafields.dropflex.policies y .logistics (Ajustes › Envíos y políticas).
    policies: {
      cod: true,
      free_shipping: p?.freeShipping ?? true,
      threshold: p?.freeShipping ? (p.freeShippingThreshold ?? undefined) : undefined,
      return_days: p?.returnDays ?? undefined,
      warranty_months: p?.warrantyMonths ?? undefined,
      whatsapp: p?.whatsapp ?? undefined,
    },
    logistics: logisticsFacts(p),
    gifs: gifPaths.map((path) => gifUrls.get(path)).filter((u): u is string => Boolean(u)),
  };
}

/** Los plazos que ve la vista previa, los mismos que publica logisticsMetafield. */
function logisticsFacts(p: StorePolicies | null | undefined): StoreFacts["logistics"] {
  const days = p ? deliveryDays(p) : null;
  if (!p || !days) return null;
  const extra = p.regionsExtraDays && p.mainCity ? p.regionsExtraDays : 0;
  return {
    ...days,
    handling: p.handlingDays ?? 0,
    cutoff: p.cutoffHour,
    saturdayDispatch: p.saturdayDispatch,
    saturdayDelivery: p.saturdayDelivery,
    businessDaysOnly: p.businessDaysOnly,
    city: extra ? p.mainCity : null,
    extra,
  };
}
