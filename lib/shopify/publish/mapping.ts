// Publicar, lo puro (docs/spec-publicar.md): de lo APROBADO en DropFlex a lo que recibe Shopify.
// - productSet: título, descripción, SEO, la variante de 1 unidad y la galería (los packs NO son
//   variantes: son esa variante × N, ver productSetInput).
// - metafields dropflex.*: el contenido de cada componente en uso y los datos reales (reseñas,
//   resumen, acento, oferta, bajada). Lo que ya no va se borra: publicar también baja lo retirado.
// Sin red ni base: todo entra por parámetro (con tests).
import { createHash } from "node:crypto";
import type { Listing } from "@/lib/copy/listing";
import { CATALOG, componentById } from "@/lib/shopify/components/catalog";
import { SHARED_METAFIELDS } from "@/lib/shopify/components/define";

/**
 * La opción de los packs cuando eran variantes (antes del 2026-09-26). Solo para reconocerla al
 * volver a publicar: se conserva su variante de 1 unidad y se borran las demás.
 */
export const PACK_OPTION = "Pack";
/** Tope de reseñas publicadas (las mismas que ve la IA, lib/copy/prompts.ts › REVIEWS_MAX). */
export const REVIEWS_MAX = 30;
/**
 * Tope de fotos de reseñas publicadas: las de las 30 reseñas (3 por reseña al importar,
 * lib/reviews/aliexpress.ts › REVIEW_MAX_PHOTOS). Con 40, las reseñas del final quedaban sin fotos y
 * el muro de testimonios (review-wall) elige cualquiera de las 30. Subir más archivos no cuesta:
 * Publicar ya sube las fotos de todas las reseñas aprobadas; esto solo recorta la lista (una lista
 * de Shopify admite hasta 128).
 */
export const REVIEW_PHOTOS_MAX = 90;

/** Metafield de archivos de cada espacio de imagen de un componente (catálogo › imageSlots). */
export const SLOT_METAFIELD: Record<string, Record<string, { key: string; type: "file_reference" | "list.file_reference" }>> = {
  "stats-with-image": { collage: { key: "stats_with_image_images", type: "list.file_reference" } },
  "insta-story": { stories: { key: "insta_story_media", type: "list.file_reference" } },
  "image-with-benefits": { main: { key: "image_with_benefits_image", type: "file_reference" } },
  // Los GIF no se eligen en la página: son los del espacio GIFs de Imágenes, en su orden.
  "gif-strip": { gifs: { key: "gif_strip_media", type: "list.file_reference" } },
};

export interface PublishReview {
  id: string;
  author: string;
  rating: number;
  body: string;
  /** YYYY-MM-DD */
  date?: string;
  country?: string;
  /** Llaves de sus fotos (ver PublishImage.key). */
  photos: string[];
}

export interface PublishPack {
  units: number;
  price: number;
  compareAt?: number;
  label?: string;
  support?: string;
  badge?: string;
}

export interface PublishImage {
  /** «<bucket>/<path>»: la misma llave que la caché de archivos. */
  key: string;
  alt: string;
}

export interface PublishComponent {
  id: string;
  content: unknown;
  /** Por espacio (imageSlots.key), las llaves de las fotos elegidas en orden. */
  images: Record<string, string[]>;
}

export interface PublishInput {
  listing: Listing;
  /** Componentes aprobados y en uso («Usar en la página»). */
  components: PublishComponent[];
  reviews: PublishReview[];
  packs: PublishPack[];
  accent: string | null;
  /** Portada, galería y beneficios, en el orden de la página. */
  gallery: PublishImage[];
}

/** Lo que ya tiene el producto en Shopify (para conservar ids de variantes y SKU). */
export interface ExistingProduct {
  id: string;
  options: { name: string; values: string[] }[];
  variants: { id: string; sku: string | null; title: string; option: string | null }[];
}

/**
 * Toda variante publicada queda a la venta: sin seguimiento de inventario y con venta sin stock.
 * En dropshipping el stock lo tiene el proveedor; una variante con seguimiento y 0 unidades (lo
 * normal al importar) sale «Agotado» con el botón apagado. `tracked` exige write_inventory
 * (PUBLISH_SCOPES); `CONTINUE` es el respaldo si el seguimiento vuelve a encenderse. Igual que v1.
 */
export const SELLABLE = { inventoryPolicy: "CONTINUE" as const, tracked: false } as const;

export class MappingError extends Error {}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const packValue = (units: number) => `${units} ${units === 1 ? "unidad" : "unidades"}`;

/** La descripción nativa (respaldo para Google, apps y el acordeón «Descripción»): la ficha y sus razones, en HTML escapado. */
export function descriptionHtml(input: PublishInput): string {
  const parts = [`<p>${esc(input.listing.short_description)}</p>`];
  const iwb = input.components.find((c) => c.id === "image-with-benefits")?.content as { benefits?: { title: string; body: string }[] } | undefined;
  const benefits = iwb?.benefits ?? [];
  if (benefits.length) {
    parts.push(`<ul>${benefits.map((b) => `<li><strong>${esc(b.title.replaceAll("**", ""))}</strong>: ${esc(b.body.replaceAll("**", ""))}</li>`).join("")}</ul>`);
  }
  return parts.join("");
}

const money = (n: number) => n.toFixed(2);
/** Liquid da los precios en centavos en toda moneda (también CLP): $24.990 → 2499000. */
const cents = (n: number) => Math.round(n * 100);

/**
 * El productSet: una sola variante, la de 1 unidad, con su precio y su tachado, a la venta sin
 * inventario (SELLABLE). Los packs NO son variantes: la tienda los vende como esa variante × N con
 * la oferta por cantidad de EasySell (df-pack-offers). Dropify (Dropi) enlaza el producto entero con
 * un solo id y manda la cantidad de la línea: una variante «2 unidades» llegaba a Dropi como
 * 1 unidad (Datazo, pedido #1006). Si el producto ya tenía los packs como variantes (opción «Pack»),
 * se conserva la de 1 unidad (SKU, historial de pedidos) y las demás se borran. Un producto con
 * variantes propias (Color, Talla) no se toca.
 */
export function productSetInput(input: PublishInput, existing: ExistingProduct, gids: Map<string, string>) {
  const own = existing.options.filter((o) => o.name !== "Title" && o.name !== PACK_OPTION);
  if (own.length) {
    throw new MappingError(`Tu producto tiene variantes propias (${own.map((o) => o.name).join(", ")}). Por ahora DropFlex publica los packs solo en productos sin variantes.`);
  }
  const base = existing.variants.find((v) => v.option === packValue(1)) ?? existing.variants[0];
  if (!base) throw new MappingError("El producto no tiene variantes en Shopify. Revisa que siga existiendo.");
  const listing = input.listing;
  const unit = input.packs.find((p) => p.units === 1);

  const productOptions = [{ name: "Title", values: [{ name: "Default Title" }] }];
  const variants = [
    {
      id: base.id,
      optionValues: [{ optionName: "Title", name: "Default Title" }],
      ...(unit ? { price: money(unit.price), compareAtPrice: unit.compareAt ? money(unit.compareAt) : null } : {}),
      inventoryPolicy: SELLABLE.inventoryPolicy,
      inventoryItem: { tracked: SELLABLE.tracked },
    },
  ];

  const files = input.gallery.map((g) => gids.get(g.key)).filter((id): id is string => Boolean(id)).map((id) => ({ id }));
  return {
    id: existing.id,
    title: listing.title,
    descriptionHtml: descriptionHtml(input),
    seo: { title: listing.seo_title, description: listing.seo_description },
    productOptions,
    variants,
    ...(files.length ? { files } : {}),
  };
}

export interface MetafieldValue {
  namespace: "dropflex";
  key: string;
  type: string;
  value: string;
}

const mf = (key: string, type: string, value: unknown): MetafieldValue => ({
  namespace: "dropflex",
  key,
  type,
  value: typeof value === "string" ? value : JSON.stringify(value),
});

/** Todas las llaves de producto que publica DropFlex (para borrar las que ya no van). */
export function productKeys(): string[] {
  const keys = new Set<string>();
  for (const c of CATALOG) {
    if (c.metafield) keys.add(c.metafield.key);
    for (const m of c.media) keys.add(m.key);
  }
  for (const slots of Object.values(SLOT_METAFIELD)) for (const s of Object.values(slots)) keys.add(s.key);
  for (const m of Object.values(SHARED_METAFIELDS)) if (m.owner === "product") keys.add(m.key);
  return [...keys].sort();
}

/** Los metafields del producto y los que hay que borrar (componentes retirados, datos vacíos). */
export function productMetafields(input: PublishInput, gids: Map<string, string>): { set: MetafieldValue[]; remove: string[] } {
  const set: MetafieldValue[] = [];
  const gid = (key: string) => gids.get(key);

  set.push(mf(SHARED_METAFIELDS.subtitle.key, SHARED_METAFIELDS.subtitle.type, input.listing.short_description));
  const packs = input.packs.length > 1 ? input.packs : [];
  set.push(
    mf(SHARED_METAFIELDS.offer.key, "json", {
      offer_line: input.listing.offer_line,
      // price y compare_at en centavos, como los precios de Liquid: la tarjeta de cada pack los
      // muestra y df-pack-offers.js los compara con lo que cobra EasySell.
      packs: packs.map((p) => ({
        units: p.units,
        label: p.label ?? packValue(p.units),
        price: cents(p.price),
        ...(p.compareAt && p.compareAt > p.price ? { compare_at: cents(p.compareAt) } : {}),
        ...(p.support ? { support: p.support } : {}),
        ...(p.badge ? { badge: p.badge } : {}),
      })),
    }),
  );
  if (input.accent) set.push(mf(SHARED_METAFIELDS.accent.key, "color", input.accent.toLowerCase()));

  const reviews = input.reviews.slice(0, REVIEWS_MAX);
  if (reviews.length) {
    const photos: string[] = [];
    const items = reviews.map((r) => {
      const mine = r.photos.map(gid).filter((g): g is string => Boolean(g)).slice(0, Math.max(0, REVIEW_PHOTOS_MAX - photos.length));
      const from = photos.length;
      photos.push(...mine);
      return { id: r.id, author: r.author, rating: r.rating, body: r.body, ...(r.date ? { date: r.date } : {}), ...(r.country ? { country: r.country } : {}), image_from: from, image_count: mine.length };
    });
    const rating = Math.round((reviews.reduce((n, r) => n + r.rating, 0) / reviews.length) * 10) / 10;
    set.push(mf(SHARED_METAFIELDS.reviews.key, "json", { items }));
    // Sin origen visible: por decisión del comerciante la tienda no nombra la plataforma de las reseñas.
    // five/positive: para la proporción que se muestra con pocas reseñas (snippets/df-review-proof).
    const five = input.reviews.filter((r) => r.rating >= 5).length;
    const positive = input.reviews.filter((r) => r.rating >= 4).length;
    set.push(mf(SHARED_METAFIELDS.reviewSummary.key, "json", { rating, count: input.reviews.length, five, positive }));
    if (photos.length) set.push(mf(SHARED_METAFIELDS.reviewsImages.key, "list.file_reference", photos));
  }

  for (const c of input.components) {
    const def = componentById(c.id);
    if (!def?.metafield) continue;
    set.push(mf(def.metafield.key, "json", c.content));
    for (const [slot, meta] of Object.entries(SLOT_METAFIELD[c.id] ?? {})) {
      const files = (c.images[slot] ?? []).map(gid).filter((g): g is string => Boolean(g));
      if (!files.length) continue;
      set.push(meta.type === "file_reference" ? mf(meta.key, meta.type, files[0]) : mf(meta.key, meta.type, files));
    }
  }

  const written = new Set(set.map((m) => m.key));
  return { set, remove: productKeys().filter((k) => !written.has(k)) };
}

/** Huella de lo aprobado: si cambia después de publicar, la pantalla dice «Hay cambios sin publicar». */
export function fingerprint(input: PublishInput, extra: unknown = null): string {
  return createHash("md5").update(JSON.stringify([input, extra])).digest("hex");
}
