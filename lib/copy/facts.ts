import "server-only";
import { fail } from "@/lib/angles/store";
import { adminClient } from "@/lib/integrations/admin";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import { getPricingPlan } from "@/lib/pricing/store";
import { baseImage, getProductRow, latestBrief, listImageRows, withDisplayUrls } from "@/lib/products/store";
import { reviewDate } from "@/lib/reviews/copy";
import { approvedReviewRows, displayText } from "@/lib/reviews/rows";
import { signPhotos } from "@/lib/reviews/store";
import { averageRating, packCompareAt, type StoreFacts } from "@/lib/store-preview/facts";

// Los datos reales que llenan los componentes en la vista previa de la etapa Página del producto:
// las reseñas aprobadas, el precio, cómo despacha la tienda y los días de garantía de la ficha. Lo
// que todavía no existe (plazos de entrega, meses de garantía) se muestra con un ejemplo marcado.

export async function storeFacts(userId: string, productId: string): Promise<StoreFacts> {
  const [product, pricing, labels, brief, images, reviews, settings] = await Promise.all([
    getProductRow(userId, productId),
    getPricingPlan(userId, productId),
    latestPackLabels(userId, productId),
    latestBrief(userId, productId),
    listImageRows(userId, [productId]),
    approvedReviewRows(userId, productId),
    adminClient().from("merchant_settings").select("free_shipping").eq("user_id", userId).maybeSingle(),
  ]);
  fail("Leer cómo despacha la tienda", settings.error);
  const cover = baseImage(images) ?? images[0];
  const [urls, photos] = await Promise.all([cover ? withDisplayUrls([cover]) : new Map<string, string>(), signPhotos(reviews)]);
  const guarantee = brief?.proof.guarantee_days ?? 0;
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
    policies: {
      cod: true,
      free_shipping: (settings.data as { free_shipping: boolean } | null)?.free_shipping ?? true,
      return_days: guarantee > 0 ? guarantee : undefined,
    },
    logistics: null,
  };
}
