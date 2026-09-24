import "server-only";
import { listImageRows, withDisplayUrls } from "@/lib/products/store";
import { GIFS } from "@/lib/page-images/catalog";
import { pageImageRows, signedPageUrls } from "@/lib/page-images/store";
import type { CatalogImage } from "@/lib/types";

// El catálogo de imágenes del producto para los componentes que llevan fotos (docs/spec-pagina-
// componentes.md › 4): las fotos de Información base en uso y las imágenes de la etapa Imágenes
// (generadas y subidas, listas y no descartadas). La IA nunca elige imágenes. Los GIF no entran: van
// solo al componente gif-strip, en el orden de la etapa Imágenes.

/** `sign`: con URLs firmadas para mostrarlas; sin firmar solo sirve para validar ids. */
export async function catalogImages(userId: string, productId: string, sign = true): Promise<CatalogImage[]> {
  const [refs, rows] = await Promise.all([listImageRows(userId, [productId]), pageImageRows(userId, [productId])]);
  const inUse = refs.filter((r) => !r.excluded);
  const seen = new Set<string>();
  const page = rows.filter((r) => {
    if (r.slot === GIFS || r.source === "reference" || r.render_status !== "succeeded" || r.status === "rejected" || !r.storage_path) return false;
    // La misma imagen puede estar en varios espacios de Imágenes: se ofrece una vez.
    if (seen.has(r.storage_path)) return false;
    seen.add(r.storage_path);
    return true;
  });
  const [refUrls, pageUrls] = sign
    ? await Promise.all([withDisplayUrls(inUse), signedPageUrls(page.map((r) => r.storage_path!))])
    : [new Map<string, string>(), new Map<string, string>()];
  return [
    ...inUse.map((r): CatalogImage => ({ source: "reference", id: r.id, src: refUrls.get(r.id) ?? "", origin: "Información base", alt: r.alt ?? undefined })),
    ...page.map((r): CatalogImage => ({ source: "page_image", id: r.id, src: pageUrls.get(r.storage_path!) ?? "", origin: r.source === "ai" ? "Generada" : "Subida" })),
  ].filter((i) => !sign || i.src);
}
