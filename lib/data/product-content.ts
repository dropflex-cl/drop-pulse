import "server-only";
import { cache } from "react";
import { preparePublish } from "@/lib/pipeline/publish";
import { adminClient } from "@/lib/integrations/admin";
import { verifiedPageFacts } from "@/lib/copy/verified-facts";
import { previewFacts } from "@/lib/products/preview-facts";
import type { ProductPageContent } from "@/lib/types";

/** Una sola preparación por petición para ficha, vista previa, estado y resumen de publicación. */
export const getPreparedProduct = cache(preparePublish);

export const getEffectiveProductContent = cache(async (userId: string, productId: string): Promise<ProductPageContent> => {
  const [prepared, verifiedFacts] = await Promise.all([getPreparedProduct(userId, productId), verifiedPageFacts(userId, productId)]);
  const sources = [...prepared.images, ...prepared.videos ?? []];
  const urls: Record<string, string> = {};
  const buckets = [...new Set(sources.flatMap(s => s.bucket ? [s.bucket] : []))];
  await Promise.all(buckets.map(async bucket => {
    const paths = [...new Set(sources.filter(s => s.bucket === bucket && s.path).map(s => s.path!))];
    const result = await adminClient().storage.from(bucket).createSignedUrls(paths, 3600);
    if (result.error) throw new Error("No pudimos abrir las imágenes guardadas. Actualiza la página.");
    for (const item of result.data ?? []) if (item.path && item.signedUrl) urls[`${bucket}/${item.path}`] = item.signedUrl;
  }));
  for (const source of sources) if (source.url) urls[source.key] = source.url;
  return { input: prepared.input, missing: prepared.missing, urls, facts: previewFacts(prepared.input, urls, prepared.currency, verifiedFacts) };
});
