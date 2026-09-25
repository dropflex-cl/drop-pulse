// Publicar, lo puro (docs/spec-publicar.md): de lo APROBADO en DropFlex a lo que recibe Shopify.
// - productSet: título, descripción, SEO, los packs como variantes y la galería.
// - metafields dropflex.*: el contenido de cada componente en uso y los datos reales (reseñas,
//   resumen, acento, oferta, bajada). Lo que ya no va se borra: publicar también baja lo retirado.
// Sin red ni base: todo entra por parámetro (con tests).
import { createHash } from "node:crypto";
import type { Listing } from "@/lib/copy/listing";
import { CATALOG, componentById } from "@/lib/shopify/components/catalog";
import { SHARED_METAFIELDS } from "@/lib/shopify/components/define";

/** Nombre de la opción de los packs en Shopify (lo ve el comprador en el carrito). */
export const PACK_OPTION = "Pack";
/** Tope de reseñas publicadas (las mismas que ve la IA, lib/copy/prompts.ts › REVIEWS_MAX). */
export const REVIEWS_MAX = 30;
/** Tope de fotos de reseñas publicadas: pesan y el carrusel no muestra más. */
export const REVIEW_PHOTOS_MAX = 40;

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

/**
 * El productSet: packs como variantes de una opción «Pack» (1, 2, 3 unidades), con precio y tachado.
 * La primera conserva la variante que ya existía (SKU, historial de pedidos). Todas quedan a la
 * venta sin inventario (SELLABLE). Un producto
 * con variantes propias (Color, Talla) no se toca: sus packs quedarían mezclados.
 */
export function productSetInput(input: PublishInput, existing: ExistingProduct, gids: Map<string, string>) {
  const own = existing.options.filter((o) => o.name !== "Title" && o.name !== PACK_OPTION);
  if (own.length) {
    throw new MappingError(`Tu producto tiene variantes propias (${own.map((o) => o.name).join(", ")}). Por ahora DropFlex publica los packs solo en productos sin variantes.`);
  }
  const base = existing.variants.find((v) => v.option === packValue(1)) ?? existing.variants[0];
  if (!base) throw new MappingError("El producto no tiene variantes en Shopify. Revisa que siga existiendo.");
  const packs = input.packs.length ? input.packs : [];
  const listing = input.listing;

  let productOptions;
  let variants;
  if (packs.length > 1) {
    productOptions = [{ name: PACK_OPTION, values: packs.map((p) => ({ name: packValue(p.units) })) }];
    variants = packs.map((p, i) => {
      const same = existing.variants.find((v) => v.option === packValue(p.units)) ?? (i === 0 ? base : undefined);
      const sku = base.sku ? (p.units === 1 ? base.sku : `${base.sku}-${p.units}x`) : undefined;
      return {
        ...(same ? { id: same.id } : {}),
        optionValues: [{ optionName: PACK_OPTION, name: packValue(p.units) }],
        price: money(p.price),
        compareAtPrice: p.compareAt ? money(p.compareAt) : null,
        inventoryPolicy: SELLABLE.inventoryPolicy,
        position: i + 1,
        inventoryItem: { tracked: SELLABLE.tracked, ...(sku ? { sku } : {}) },
      };
    });
  } else {
    const p = packs[0];
    productOptions = [{ name: "Title", values: [{ name: "Default Title" }] }];
    variants = [
      {
        id: base.id,
        optionValues: [{ optionName: "Title", name: "Default Title" }],
        ...(p ? { price: money(p.price), compareAtPrice: p.compareAt ? money(p.compareAt) : null } : {}),
        inventoryPolicy: SELLABLE.inventoryPolicy,
        inventoryItem: { tracked: SELLABLE.tracked },
      },
    ];
  }

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
      packs: packs.map((p) => ({ units: p.units, label: p.label ?? packValue(p.units), ...(p.support ? { support: p.support } : {}), ...(p.badge ? { badge: p.badge } : {}) })),
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
