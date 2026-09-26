// Etapa Publicar (docs/spec-publicar.md): lleva a Shopify lo APROBADO de un producto.
//   1. definiciones de metafields (una vez, PUBLIC_READ);
//   2. imágenes a Shopify Files (caché por archivo de origen);
//   3. productSet: título, descripción, SEO, la variante de 1 unidad (los packs van en el metafield
//      dropflex.offer: la variante × N con la oferta por cantidad de EasySell) y galería;
//   4. metafields dropflex.* del producto (y borrar los retirados) y de la tienda (políticas, plazos).
// Corre en segundo plano (after) y deja su estado en product_publications. Publicar dos veces es
// idempotente. El tema se instala aparte (lib/shopify/publish/theme.ts).
import "server-only";
import { after } from "next/server";
import { LISTING, type Listing } from "@/lib/copy/listing";
import { activeComponents, currentContent } from "@/lib/copy/store";
import { adminClient } from "@/lib/integrations/admin";
import { shopifyMutation, shopifyQuery } from "@/lib/integrations/shopify/client";
import { getShopifyConnection, type ShopifyConnection } from "@/lib/integrations/shopify/connection";
import { missingPublishScopes } from "@/lib/integrations/shopify/oauth";
import { COVER, GALLERY, GALLERY_MIN, GIFS, slotKind } from "@/lib/page-images/catalog";
import { PAGE_MEDIA_BUCKET, pageImageRows } from "@/lib/page-images/store";
import { labelsStale } from "@/lib/pricing/labels";
import { latestPackLabels } from "@/lib/pricing/labels-store";
import { getPricingPlan } from "@/lib/pricing/store";
import { ProductApiError } from "@/lib/products/http";
import { getProductRow, listImageRows, REFERENCES_BUCKET, type ImageRow } from "@/lib/products/store";
import { approvedReviewRows, displayText } from "@/lib/reviews/rows";
import { logisticsMetafield, policiesMetafield } from "@/lib/settings/policies";
import { getStorePolicies } from "@/lib/settings/policies-store";
import { componentById } from "@/lib/shopify/components/catalog";
import { EVENT_KEY, publishProductEvent } from "@/lib/events/store";
import { ensureDefinitions } from "@/lib/shopify/publish/definitions";
import { assertNoUserErrors, ensureImages, PublishError, type SourceImage } from "@/lib/shopify/publish/files";
import { deleteMetafields, setMetafields } from "@/lib/shopify/publish/metafields";
import { fingerprint, MappingError, PACK_OPTION, productMetafields, productSetInput, type ExistingProduct, type PublishInput } from "@/lib/shopify/publish/mapping";
import { packCompareAt } from "@/lib/store-preview/facts";
import type { ImagePick } from "@/lib/types";

const TABLE = "product_publications";
/** Una publicación que no terminó en este plazo se da por fallida (la instancia murió). */
const STALE_MS = 10 * 60 * 1000;

export interface PublicationRow {
  product_id: string;
  user_id: string;
  shop_domain: string;
  status: "publishing" | "published" | "error";
  error_message: string | null;
  fingerprint: string | null;
  summary: PublishSummary;
  product_url: string | null;
  published_at: string | null;
  started_at: string;
  updated_at: string;
  /** Huella del metafield dropflex.event publicado (lib/events/store.ts › eventFingerprint). */
  event_fingerprint: string | null;
  events_published_at: string | null;
}

export interface PublishSummary {
  components?: number;
  images?: number;
  packs?: number;
  reviews?: number;
  policies?: boolean;
  logistics?: boolean;
}

export async function getPublications(userId: string, productIds: string[]): Promise<Map<string, PublicationRow>> {
  const out = new Map<string, PublicationRow>();
  if (!productIds.length) return out;
  const { data, error } = await adminClient().from(TABLE).select("*").eq("user_id", userId).in("product_id", productIds);
  if (error) throw new Error(`Leer las publicaciones: ${error.message}`);
  for (const r of (data ?? []) as PublicationRow[]) out.set(r.product_id, r);
  return out;
}

/** Cierra lo colgado: una publicación que lleva más de 10 minutos «publicando» falló. */
export async function expireStalePublications(userId: string): Promise<void> {
  const { error } = await adminClient()
    .from(TABLE)
    .update({ status: "error", error_message: "La publicación se cortó. Intenta de nuevo.", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "publishing")
    .lt("updated_at", new Date(Date.now() - STALE_MS).toISOString());
  if (error) throw new Error(`Cerrar publicaciones colgadas: ${error.message}`);
}

// ---------------------------------------------------------------- Lo aprobado

const refKey = (r: ImageRow) => (r.storage_path ? `${REFERENCES_BUCKET}/${r.storage_path}` : (r.url ?? ""));
const refSource = (r: ImageRow, alt: string): SourceImage =>
  r.storage_path ? { key: refKey(r), bucket: REFERENCES_BUCKET, path: r.storage_path, alt } : { key: refKey(r), url: r.url ?? undefined, alt };

export interface Prepared {
  input: PublishInput;
  images: SourceImage[];
  /** Lo que falta para poder publicar, en frases para la pantalla. */
  missing: string[];
}

/** Junta lo aprobado del producto tal como se publicaría. No toca Shopify. */
export async function preparePublish(userId: string, productId: string): Promise<Prepared> {
  const [row, rowsByProduct, refs, pageRows, reviews, pricing, labels] = await Promise.all([
    getProductRow(userId, productId),
    activeComponents(userId, [productId]),
    listImageRows(userId, [productId]),
    pageImageRows(userId, [productId]),
    approvedReviewRows(userId, productId),
    getPricingPlan(userId, productId),
    latestPackLabels(userId, productId),
  ]);
  if (!row) throw new ProductApiError("No encontramos ese producto.", 404);
  const rows = rowsByProduct.get(productId) ?? [];
  const missing: string[] = [];

  const listingRow = rows.find((r) => r.component === LISTING && r.status === "approved");
  if (!listingRow) missing.push("Aprueba la ficha en Página del producto.");
  const listing = (listingRow ? currentContent(listingRow) : null) as Listing | null;

  // Imágenes: portada, galería en su orden y los beneficios elegidos en la etapa Imágenes.
  const images: SourceImage[] = [];
  const refById = new Map(refs.map((r) => [r.id, r]));
  const pageSource = (p: (typeof pageRows)[number], alt: string): SourceImage | null => {
    if (p.source === "reference") {
      const ref = p.reference_image_id ? refById.get(p.reference_image_id) : undefined;
      return ref ? refSource(ref, alt) : null;
    }
    return p.storage_path ? { key: `${PAGE_MEDIA_BUCKET}/${p.storage_path}`, bucket: PAGE_MEDIA_BUCKET, path: p.storage_path, alt } : null;
  };
  const chosen = pageRows.filter((p) => p.status === "approved");
  const name = listing?.short_name ?? row.title;
  const cover = chosen.find((p) => p.slot === COVER);
  const gallery = chosen.filter((p) => p.slot === GALLERY).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const benefits = chosen.filter((p) => slotKind(p.slot) === "benefit");
  if (!cover) missing.push("Elige la portada en Imágenes.");
  if (gallery.length < GALLERY_MIN) missing.push(`Elige al menos ${GALLERY_MIN} imágenes de galería en Imágenes.`);
  const galleryImages = [cover, ...gallery, ...benefits]
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p, i) => pageSource(p, i === 0 ? name : `${name}, imagen ${i + 1}`))
    .filter((s): s is SourceImage => Boolean(s));
  images.push(...galleryImages);

  // Componentes en uso con sus fotos.
  const resolvePick = (pick: ImagePick): SourceImage | null => {
    if (pick.source === "reference") {
      const ref = refById.get(pick.id);
      return ref ? refSource(ref, name) : null;
    }
    const p = pageRows.find((x) => x.id === pick.id);
    return p ? pageSource(p, name) : null;
  };
  // Los GIF de Imágenes, en su orden: el GIF N lleva el texto N de gif-strip.
  const gifs = chosen
    .filter((p) => p.slot === GIFS)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((p, i) => pageSource(p, `${name}, en movimiento ${i + 1}`))
    .filter((s): s is SourceImage => Boolean(s));
  const components = rows
    .filter((r) => r.component !== LISTING && r.status === "approved" && r.enabled && componentById(r.component))
    .map((r) => {
      const bySlot: Record<string, string[]> = {};
      for (const pick of (r.images ?? []) as ImagePick[]) {
        const src = resolvePick(pick);
        if (!src) continue;
        images.push(src);
        (bySlot[pick.slot] ??= []).push(src.key);
      }
      if (r.component === "gif-strip" && gifs.length) {
        images.push(...gifs);
        bySlot[GIFS] = gifs.map((g) => g.key);
      }
      return { id: r.component, content: currentContent(r), images: bySlot };
    });

  // Reseñas aprobadas con sus fotos.
  const publishReviews = reviews.map((r) => {
    const photos = r.photos.map((p) => ({ key: `${REFERENCES_BUCKET}/${p.path}`, bucket: REFERENCES_BUCKET, path: p.path, alt: `Foto de ${r.author}` }));
    images.push(...photos);
    return {
      id: r.id,
      author: r.author,
      rating: r.rating,
      body: displayText(r),
      date: r.reviewed_at?.slice(0, 10) ?? undefined,
      country: r.country ?? undefined,
      photos: photos.map((p) => p.key),
    };
  });

  // Packs: el plan de precios y las etiquetas aprobadas.
  if (!pricing) missing.push("Guarda el precio y los packs en Información base.");
  // Las tarjetas de packs de la tienda usan las etiquetas («Uno solo para ti»): si hay una propuesta
  // sin decidir (o quedó vieja porque cambiaron los precios), se decide antes de publicar; si no, la
  // tienda caería en «1 unidad», «2 unidades».
  const labelsReady = labels?.status === "approved" && !labelsStale(labels.prices, pricing);
  if (pricing && pricing.packs.length > 1 && labels && !labelsReady) missing.push("Acepta las etiquetas de los packs en Información base.");
  const approvedLabels = labelsReady ? labels!.payload : [];
  const packs = (pricing?.packs ?? []).map((p) => {
    const l = approvedLabels.find((x) => x.units === p.units);
    return {
      units: p.units,
      price: p.price,
      compareAt: packCompareAt(p.units, p.price, pricing!.salePrice, pricing!.compareAtPrice),
      label: l?.label,
      support: l?.support ?? undefined,
      badge: l?.badge ?? undefined,
    };
  });

  const input: PublishInput = {
    listing: listing ?? { title: row.title, short_name: row.title, short_description: "", offer_line: "", seo_title: "", seo_description: "" },
    components,
    reviews: publishReviews,
    packs,
    accent: row.page_accent_color,
    gallery: galleryImages.map((g) => ({ key: g.key, alt: g.alt })),
  };
  return { input, images, missing };
}

// ---------------------------------------------------------------- Shopify

const PRODUCT = /* GraphQL */ `
  query Product($id: ID!) {
    product(id: $id) {
      id
      handle
      onlineStoreUrl
      options { name optionValues { name } }
      variants(first: 50) { nodes { id sku title selectedOptions { name value } } }
      metafields(first: 100, namespace: "dropflex") { nodes { key } }
    }
  }
`;

interface ProductQuery {
  product: {
    id: string;
    handle: string;
    onlineStoreUrl: string | null;
    options: { name: string; optionValues: { name: string }[] }[];
    variants: { nodes: { id: string; sku: string | null; title: string; selectedOptions: { name: string; value: string }[] }[] };
    metafields: { nodes: { key: string }[] };
  } | null;
}

const PRODUCT_URL = /* GraphQL */ `
  query ProductUrl($id: ID!) {
    product(id: $id) { onlineStoreUrl }
  }
`;

/** El GID del producto en Shopify, o null si el id guardado no es de Shopify. */
function productGid(id: string): string | null {
  if (id.startsWith("gid://")) return id;
  return /^\d+$/.test(id) ? `gid://shopify/Product/${id}` : null;
}

/**
 * La URL pública del producto hoy: Shopify la arma con el dominio principal de la tienda (el propio,
 * no el myshopify). null si el producto no está a la venta en la tienda online o no hay conexión.
 */
export async function liveProductUrl(userId: string, productId: string): Promise<string | null> {
  const [conn, row] = await Promise.all([getShopifyConnection(userId), getProductRow(userId, productId)]);
  const gid = row ? productGid(row.shopify_product_id) : null;
  if (!conn || conn.status !== "connected" || !gid) return null;
  const data = await shopifyQuery<{ product: { onlineStoreUrl: string | null } | null }>(conn, PRODUCT_URL, { id: gid });
  return data.product?.onlineStoreUrl ?? null;
}

const PRODUCT_SET = /* GraphQL */ `
  mutation ProductSet($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product { id handle onlineStoreUrl }
      userErrors { field message }
    }
  }
`;

const SHOP_METAFIELDS = /* GraphQL */ `
  query ShopMeta {
    shop { id metafields(first: 20, namespace: "dropflex") { nodes { key } } }
  }
`;

/** Los datos de la tienda (políticas y plazos de Ajustes): se publican con cada producto. */
async function publishShopFacts(conn: ShopifyConnection): Promise<{ policies: boolean; logistics: boolean }> {
  const settings = await getStorePolicies(conn.user_id);
  if (!settings) return { policies: false, logistics: false };
  const shop = await shopifyQuery<{ shop: { id: string; metafields: { nodes: { key: string }[] } } }>(conn, SHOP_METAFIELDS);
  const logistics = logisticsMetafield(settings.policies, settings.timezone ?? conn.timezone);
  const list = [{ namespace: "dropflex", key: "policies", type: "json", value: JSON.stringify(policiesMetafield(settings.policies, settings.locale)) }];
  if (logistics) list.push({ namespace: "dropflex", key: "logistics", type: "json", value: JSON.stringify(logistics) });
  await setMetafields(conn, shop.shop.id, list);
  if (!logistics && shop.shop.metafields.nodes.some((n) => n.key === "logistics")) await deleteMetafields(conn, shop.shop.id, ["logistics"]);
  return { policies: true, logistics: Boolean(logistics) };
}

async function savePublication(userId: string, productId: string, shop: string, patch: Partial<PublicationRow>) {
  const { error } = await adminClient()
    .from(TABLE)
    .upsert({ product_id: productId, user_id: userId, shop_domain: shop, ...patch, updated_at: new Date().toISOString() }, { onConflict: "product_id" });
  if (error) throw new Error(`Guardar la publicación: ${error.message}`);
}

/** Por qué no se puede publicar ahora (conexión y permisos), o null. */
export function connectionProblem(conn: ShopifyConnection | null): string | null {
  if (!conn || conn.status !== "connected") return "Conecta tu tienda Shopify en Ajustes.";
  if (missingPublishScopes(conn.scopes).length) return "Dale permiso a DropFlex para instalar el tema, subir imágenes y dejar tus productos a la venta.";
  return null;
}

/** Valida y deja el producto «publicando»; el trabajo sigue en segundo plano. */
export async function startPublish(userId: string, productId: string): Promise<void> {
  const conn = await getShopifyConnection(userId);
  const problem = connectionProblem(conn);
  if (problem) throw new ProductApiError(problem, 409);
  const { missing } = await preparePublish(userId, productId);
  if (missing.length) throw new ProductApiError(missing[0], 409);
  const current = (await getPublications(userId, [productId])).get(productId);
  if (current?.status === "publishing" && Date.now() - Date.parse(current.updated_at) < STALE_MS) throw new ProductApiError("Ya se está publicando.", 409);
  await savePublication(userId, productId, conn!.shop_domain, { status: "publishing", error_message: null, started_at: new Date().toISOString() });
  after(() => runPublish(userId, productId).catch((e) => console.error("[publish]", e)));
}

/** Mensaje para el comerciante: lo nuestro tal cual; lo técnico, en una frase accionable. */
function publishMessage(e: unknown): string {
  if (e instanceof MappingError || e instanceof PublishError || e instanceof ProductApiError) return e.message;
  if (e instanceof Error && /ACCESS_DENIED|401|403/.test(e.message)) return "Shopify rechazó el permiso. Vuelve a dar permisos a DropFlex y reintenta.";
  return "No pudimos publicar en Shopify. Intenta de nuevo en unos minutos.";
}

export async function runPublish(userId: string, productId: string): Promise<void> {
  const conn = await getShopifyConnection(userId);
  const shop = conn?.shop_domain ?? "";
  try {
    const problem = connectionProblem(conn);
    if (problem || !conn) throw new PublishError(problem ?? "Conecta tu tienda Shopify.");
    const row = await getProductRow(userId, productId);
    if (!row) throw new PublishError("No encontramos ese producto.");
    const { input, images, missing } = await preparePublish(userId, productId);
    if (missing.length) throw new PublishError(missing[0]);

    const gid = productGid(row.shopify_product_id);
    const found = gid ? await shopifyQuery<ProductQuery>(conn, PRODUCT, { id: gid }) : { product: null };
    if (!found.product) throw new PublishError("Este producto ya no existe en tu tienda Shopify. Sincroniza tus productos.");
    const existing: ExistingProduct = {
      id: found.product.id,
      options: found.product.options.map((o) => ({ name: o.name, values: o.optionValues.map((v) => v.name) })),
      variants: found.product.variants.nodes.map((v) => ({
        id: v.id,
        sku: v.sku,
        title: v.title,
        option: v.selectedOptions.find((o) => o.name === PACK_OPTION || o.name === "Title")?.value ?? null,
      })),
    };

    await ensureDefinitions(conn);
    const gids = await ensureImages(conn, productId, images);
    const set = await shopifyMutation<{ productSet: { product: { handle: string; onlineStoreUrl: string | null } | null; userErrors: { message: string }[] } }>(conn, PRODUCT_SET, {
      input: productSetInput(input, existing, gids),
    });
    assertNoUserErrors("Actualizar el producto", set.productSet.userErrors);

    const meta = productMetafields(input, gids);
    await setMetafields(conn, existing.id, meta.set);
    const present = new Set(found.product.metafields.nodes.map((n) => n.key));
    // El evento va aparte (publishProductEvent): lo escribe o lo borra después de guardar la publicación.
    await deleteMetafields(conn, existing.id, meta.remove.filter((k) => present.has(k) && k !== EVENT_KEY));
    const shopFacts = await publishShopFacts(conn);

    await savePublication(userId, productId, shop, {
      status: "published",
      error_message: null,
      fingerprint: fingerprint(input),
      // Con el dominio principal. null = no está a la venta en la tienda online: no se inventa el myshopify.
      product_url: set.productSet.product?.onlineStoreUrl ?? null,
      published_at: new Date().toISOString(),
      summary: {
        components: input.components.length,
        images: input.gallery.length,
        packs: input.packs.length > 1 ? input.packs.length : 0,
        reviews: input.reviews.length,
        ...shopFacts,
      },
    });
    // Eventos: el metafield dropflex.event (Cyber, Black Friday…) con lo que tenga activado hoy.
    await publishProductEvent(conn, userId, productId, existing.id, present.has(EVENT_KEY));
  } catch (e) {
    console.error("[publish]", productId, e);
    await savePublication(userId, productId, shop, { status: "error", error_message: publishMessage(e) });
  }
}
