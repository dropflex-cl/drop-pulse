// Catálogo, contexto y estrategia PI, contenido revisable y medios persistidos.
import { storeFacts } from "@/lib/copy/facts";
import { catalogImages } from "@/lib/copy/images";
import { copyProgress } from "@/lib/copy/progress";
import { activeComponents, activeComponentStates, latestCopyRuns, latestCopyRunStates, toComponentViews, type ComponentState, type CopyRunState } from "@/lib/copy/store";
import { activeConcepts, assetsFor, creativeCounts, keptAdCopies, latestCreativeRuns, signedUrls, toConceptView } from "@/lib/creatives/store";
import { publishState } from "@/lib/data/publish";
import { IMAGE_COST_BY_PROVIDER } from "@/lib/image-provider";
import { adminClient } from "@/lib/integrations/admin";
import { getAnthropicConnection } from "@/lib/integrations/anthropic/connection";
import { imageProviderChoice, noProviderReason } from "@/lib/integrations/image-provider";
import { getMetaConnection } from "@/lib/integrations/meta/connection";
import { sessionUser } from "@/lib/integrations/session";
import { GALLERY_MIN, isVisualWorld, VISUAL_WORLD_NAMES } from "@/lib/page-images/catalog";
import { activeShots, latestPageImageRuns, pageImageCounts, pageImageRows, signedPageUrls, toSlotViews } from "@/lib/page-images/store";
import { generationBlocker } from "@/lib/pipeline/page-images";
import { getPublications, type PublicationRow } from "@/lib/pipeline/publish";
import { latestPackLabels, toPackLabelsProposal } from "@/lib/pricing/labels-store";
import { getPricingPlan, pricedProducts, pricingDefaults } from "@/lib/pricing/store";
import { getDifferentiator } from "@/lib/products/differentiator";
import { scheduleHousekeeping } from "@/lib/products/housekeeping";
import { productPosition, type AdsFacts, type CopyFacts, type CreativeFacts, type ImageFacts, type PublishFacts, type ReviewFacts } from "@/lib/products/stages";
import { baseImage, getProductRow, listImageRows, listProductRows, toReferenceImage, toUiStatus, withDisplayUrls, type ImageRow, type ProductRow, } from "@/lib/products/store";
import { customerReviews, latestImport, latestSource, reviewFacts, toReviewImport } from "@/lib/reviews/store";
import type { CopyState, CreativesState, PageImagesState, Product, ProductBase, ProductCopy, ProductCreatives, ProductFilter, ProductMessages, ProductPageImages, ProductReviews, ProductStrategy, StrategyState, UpsellProduct, VideosState } from "@/lib/types";
import { activeScripts, expireStaleVideos, shotsFor, toCardView } from "@/lib/video/store";
import { messagesState } from "@/lib/whatsapp/store";
import { redirect } from "next/navigation";
import { cache } from "react";
import "server-only";
import { getCanonicalProductData, getCanonicalProductStates, getLandingContextStale, getSelectedProductStrategy } from "./product-intelligence";

/** Imágenes lista: portada y el mínimo de galería elegidos (lo mismo que la ruta, lib/products/stages.ts). */
const imagesReady = (i: { cover: boolean; gallery: number }) => i.cover && i.gallery >= GALLERY_MIN;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const userId = cache(async () => {
  const user = await sessionUser();
  if (!user) redirect("/auth/login");
  // Cerrar lo colgado y traer los elegidos del onboarding, después de responder (lib/products/housekeeping.ts).
  scheduleHousekeeping(user.id);
  return user.id;
});

/** La fila del producto, una vez por petición (la piden el producto y la etapa). Un id que no es uuid no existe. */
export const productRow = cache(async (uid: string, id: string): Promise<ProductRow | null> => (UUID.test(id) ? getProductRow(uid, id) : null));

/** La miniatura del producto es su imagen base (o, si todas están excluidas, la primera). */
function cover(images: ImageRow[]): ImageRow | undefined {
  return baseImage(images) ?? images[0];
}

function copyFacts(run: CopyRunState | undefined, rows: ComponentState[] | undefined): CopyFacts | null {
  if (!run && !rows?.length) return null;
  return {
    fromChat: run?.input.source === "mcp_chat",
    run: run ? { status: run.status, error: run.error_message } : null,
    progress: copyProgress((rows ?? []).map((r) => ({ component: r.component, status: toUiStatus(r.status), enabled: r.enabled }))),
  };
}

/** Meta listo y las campañas de cada producto (etapa Anuncios). */
async function adsFacts(uid: string, ids: string[]): Promise<(productId: string) => AdsFacts> {
  const [meta, { data }] = await Promise.all([
    getMetaConnection(uid),
    adminClient().from("ad_campaigns").select("product_id, status").eq("user_id", uid).in("product_id", ids).in("status", ["launching", "paused", "active"]),
  ]);
  const metaReady = Boolean(meta?.status === "connected" && meta.ad_account_id && meta.page_id && meta.pixel_id);
  const rows = (data ?? []) as { product_id: string; status: string }[];
  return (productId) => {
    const mine = rows.filter((r) => r.product_id === productId);
    return { metaReady, campaigns: mine.filter((r) => r.status !== "launching").length, launching: mine.some((r) => r.status === "launching") };
  };
}

/** El proveedor de imágenes y las piezas de cada producto (etapa Creativos). */
async function creativeFacts(uid: string, ids: string[]): Promise<(productId: string) => CreativeFacts> {
  const [choice, counts] = await Promise.all([imageProviderChoice(uid, "creatives"), creativeCounts(uid, ids)]);
  const connected = choice.value !== null;
  return (productId) => ({ connected, ...counts(productId) });
}

function publicationFacts(p: PublicationRow | undefined): PublishFacts | null {
  return p ? { status: p.status, error: p.error_message } : null;
}

function toProduct(
  row: ProductRow,
  image: string,
  priced: boolean,
  reviews?: ReviewFacts,
  copy?: CopyFacts | null,
  ads?: AdsFacts,
  creatives?: CreativeFacts,
  images?: ImageFacts,
  publish?: PublishFacts | null,
  ai = true,
  intelligence?: { hasContext: boolean; described: boolean; selected: boolean; ready: boolean },
): Product {
  const position = productPosition({
    price: Number(row.price),
    currency: row.currency,
    base: { described: intelligence?.described ?? false, priced },
    intelligence: { selected: intelligence?.selected ?? false, ready: intelligence?.ready ?? false },
    reviews,
    copy,
    ads,
    creatives,
    images,
    publish,
    ai,
  });
  return {
    id: row.id,
    name: row.title,
    image,
    sku: "",
    filter: position.filter,
    meter: position.meter,
    reason: position.reason,
    tone: position.tone,
    nextStage: position.nextStage,
    stages: position.stages,
    summary: position.summary,
    status: position.status,
    anglesPhase: position.anglesPhase,
    copyPhase: position.copyPhase,
    aiConnected: ai,
    supplierCost: row.cost == null ? 0 : Number(row.cost),
    price: Number(row.price),
    currency: row.currency,
  };
}

/**
 * Los productos dados con su posición en la ruta: una ida por tabla, solo con las columnas que la
 * calculan (sin payloads), filtrada a esos productos. Sin cookies ni `after`: la usa también el
 * número de Hoy en caché (lib/data/today.ts). `images: false` salta la miniatura (no firma URLs).
 */
export async function productsWithPositions(uid: string, rows: ProductRow[], { images = true }: { images?: boolean } = {}): Promise<Product[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [imageRows, priced, reviews, copyRuns, copyRows, ads, creatives, pageImages, publications, anthropic, intelligence] = await Promise.all([
    images ? listImageRows(uid, ids) : Promise.resolve([] as ImageRow[]),
    pricedProducts(uid, ids),
    reviewFacts(uid, ids),
    latestCopyRunStates(uid, ids),
    activeComponentStates(uid, ids),
    adsFacts(uid, ids),
    creativeFacts(uid, ids),
    pageImageCounts(uid, ids),
    getPublications(uid, ids),
    getAnthropicConnection(uid),
    getCanonicalProductStates(uid, ids),
  ]);
  const ai = anthropic?.status === "connected";
  const covers = rows.map((r) => cover(imageRows.filter((i) => i.product_id === r.id))).filter((i): i is ImageRow => !!i);
  const urls = await withDisplayUrls(covers);
  return rows.map((r) => {
    const c = covers.find((i) => i.product_id === r.id);
    const copy = copyFacts(copyRuns.get(r.id), copyRows.get(r.id));
    return toProduct(r, c ? (urls.get(c.id) ?? "") : "", priced.has(r.id), reviews.get(r.id), copy, ads(r.id), creatives(r.id), pageImages(r.id), publicationFacts(publications.get(r.id)), ai, intelligence.get(r.id));
  });
}

/** Las filas del comerciante, una vez por petición (las piden la lista, el conteo y los upsell). */
const productRows = cache(async (): Promise<{ uid: string; rows: ProductRow[] }> => {
  const uid = await userId();
  return { uid, rows: await listProductRows(uid) };
});

/** Los productos que se optimizan, con su posición en la ruta (la lista y Hoy). Sin los upsell. */
const allProducts = cache(async (): Promise<Product[]> => {
  const { uid, rows } = await productRows();
  return productsWithPositions(uid, rows.filter((r) => !r.is_upsell));
});

export async function getProducts(filter?: ProductFilter): Promise<Product[]> {
  const all = await allProducts();
  return filter ? all.filter((p) => p.filter === filter) : all;
}

export async function getProductCounts(): Promise<Record<ProductFilter, number> & { upsell: number; total: number }> {
  const [all, { rows }] = await Promise.all([allProducts(), productRows()]);
  const count = (f: ProductFilter) => all.filter((p) => p.filter === f).length;
  return { avanzan: count("avanzan"), detenidos: count("detenidos"), publicados: count("publicados"), upsell: rows.length - all.length, total: rows.length };
}

/** Los upsell del checkout (/products/upsell): solo nombre y miniatura, sin calcular su ruta. */
export const getUpsellProducts = cache(async (): Promise<UpsellProduct[]> => {
  const { uid, rows } = await productRows();
  const upsells = rows.filter((r) => r.is_upsell);
  if (!upsells.length) return [];
  const images = await listImageRows(uid, upsells.map((r) => r.id));
  const covers = upsells.map((r) => cover(images.filter((i) => i.product_id === r.id))).filter((i): i is ImageRow => !!i);
  const urls = await withDisplayUrls(covers);
  return upsells.map((r) => {
    const c = covers.find((i) => i.product_id === r.id);
    return { id: r.id, name: r.title, image: c ? (urls.get(c.id) ?? "") : "" };
  });
});

/** Un producto con su posición en la ruta. Solo lee ese producto (no el catálogo entero). */
export const getProduct = cache(async (id: string): Promise<Product | null> => {
  const uid = await userId();
  const row = await productRow(uid, id);
  if (!row) return null;
  return (await productsWithPositions(uid, [row]))[0] ?? null;
});

/**
 * El producto y el estado de su etapa a la vez: la etapa no espera a la ruta del producto (son
 * independientes). Si el producto no existe, null aunque la etapa haya fallado.
 */
async function withProduct<T>(id: string, state: (uid: string) => Promise<T>): Promise<{ product: Product; state: T } | null> {
  if (!UUID.test(id)) return null;
  const uid = await userId();
  const [product, result] = await Promise.all([
    getProduct(id),
    state(uid).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ]);
  if (!product) return null;
  if (!result.ok) throw result.error;
  return { product, state: result.value };
}

/** La etapa Información base: texto, imágenes de referencia, los datos del producto y el precio. */
export const getProductBase = cache(async (id: string): Promise<ProductBase | null> => {
  if (!UUID.test(id)) return null;
  const uid = await userId();
  // Todo a la vez: la etapa no espera a la ruta del producto; solo los valores por defecto del precio esperan la fila.
  const row$ = productRow(uid, id);
  const [product, row, images, pricing, pricingDefaultsValue, packLabels, differentiator, canonical] = await Promise.all([
    getProduct(id),
    row$,
    listImageRows(uid, [id]),
    getPricingPlan(uid, id),
    row$.then((r) => (r ? pricingDefaults(uid, r) : null)),
    latestPackLabels(uid, id),
    getDifferentiator(uid, id),
    getCanonicalProductData(uid, id),
  ]);
  if (!product || !row || !pricingDefaultsValue) return null;
  const urls = await withDisplayUrls(images);
  return {
    product,
    baseInfo: canonical.hasContext ? canonical.supplierText : row.base_info,
    baseInfoUpdatedAt: canonical.hasContext ? undefined : row.base_info_updated_at ?? undefined,
    fromShopify: !canonical.hasContext && Boolean(row.description?.trim()) && row.base_info.includes(row.description!.trim().slice(0, 40)),
    images: images.filter((i) => urls.has(i.id)).map((i) => toReferenceImage(i, urls.get(i.id)!)),
    productData: canonical,
    pricing: pricing ?? undefined,
    packLabels: packLabels ? toPackLabelsProposal(packLabels, pricing) : undefined,
    pricingDefaults: pricingDefaultsValue,
    hasBrief: canonical.hasContext,
    differentiator,
    imageQa: row.image_qa === true,
  };
});

/** La etapa Reseñas: las reseñas importadas, su listado de AliExpress y la última importación. */
export const getProductReviews = cache(async (id: string): Promise<ProductReviews | null> => {
  const found = await withProduct(id, (uid) => Promise.all([customerReviews(uid, id), latestSource(uid, id), latestImport(uid, id)]));
  if (!found) return null;
  const {
    product,
    state: [reviews, source, job],
  } = found;
  return {
    product,
    reviews,
    source: source
      ? { url: source.url, avgRating: source.avg_rating == null ? undefined : Number(source.avg_rating), totalReviews: source.total_reviews ?? undefined }
      : undefined,
    lastImport: job ? toReviewImport(job) : undefined,
  };
});

/** La etapa Estrategia: selección PI canónica y contenidos históricos para consulta. */
export const getProductStrategy = cache(async (id: string): Promise<ProductStrategy | null> => {
  const found = await withProduct(id, (uid) => strategyState(uid, id));
  return found && { product: found.product, ...found.state };
});

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/strategy). */
export async function strategyState(uid: string, productId: string): Promise<StrategyState> {
  const selection = await getSelectedProductStrategy(uid, productId);
  return { selection, blocker: null, chosen: selection?.snapshot.angles.map((angle, index) => ({ slot: index + 1, title: angle.name, hook: angle.hook })) ?? [] };
}

/** La etapa Página del producto: la ficha y los componentes de conversión. */
export const getProductCopy = cache(async (id: string): Promise<ProductCopy | null> => {
  const found = await withProduct(id, (uid) => Promise.all([productRow(uid, id), copyState(uid, id)]));
  if (!found) return null;
  const [row, state] = found.state;
  if (!row) return null;
  return { product: found.product, accent: row.page_accent_color ?? null, ...state };
});

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/copy). */
export async function copyState(uid: string, productId: string): Promise<CopyState> {
  const [runs, rows, images, facts, counts] = await Promise.all([
    latestCopyRuns(uid, [productId]), activeComponents(uid, [productId]), catalogImages(uid, productId), storeFacts(uid, productId), pageImageCounts(uid, [productId]),
  ]);
  const run = runs.get(productId);
  const chosen = counts(productId);
  const pageRows = (rows.get(productId) ?? []).filter((r) => r.enabled);
  const reasons: import("@/lib/copy/stale").CopyStaleReason[] = [];
  if (run?.input.source === "mcp_chat" && await getLandingContextStale(uid, productId)) reasons.push("product_context");
  const videoRows = await activeScripts(uid, productId);
  const videos = videoRows.filter((s) => s.final_status === "approved" && s.approved_at && s.final_storage_path).map((s) => ({ id: s.id, name: `${s.format === "mascot" ? "Mascota" : "Persona"} · ${String(s.input.angle_name ?? `Ángulo ${s.angle_slot}`)}` }));
  return {
    videos,
    locked: pageRows.length || run?.input.source === "mcp_chat" ? null : imagesReady(chosen) ? null : "images",
    fromChat: run?.input.source === "mcp_chat",
    run: run ? { id: run.id, status: run.status, error: run.error_message ?? undefined, createdAt: run.created_at } : undefined,
    components: toComponentViews(rows.get(productId) ?? []),
    images,
    facts,
    stale: reasons.length > 0,
    staleReasons: reasons,
  };
}

/** La etapa Creativos: los conceptos del generador y sus piezas generadas (Higgsfield o Gemini). */
export const getProductCreatives = cache(async (id: string): Promise<ProductCreatives | null> => {
  const found = await withProduct(id, async (uid) => {
    await expireStaleVideos(uid).catch((e) => console.error("[video] cerrar lo colgado", e));
    const [creatives, videos] = await Promise.all([creativesState(uid, id), videosState(uid, id)]);
    return { ...creatives, videos };
  });
  return found && { product: found.product, ...found.state };
});

/** La pestaña Videos (docs/spec-video-ugc.md): una tarjeta por ángulo aprobado y formato. Lo que devuelve su sondeo. */
export async function videosState(uid: string, productId: string): Promise<VideosState> {
  const scripts = await activeScripts(uid, productId);
  const shots = await shotsFor(uid, scripts.map((s) => s.id));
  const cards = await Promise.all(scripts.map((s) => toCardView(s.angle_slot, String(s.input.angle_name ?? s.execution_key ?? `Ángulo ${s.angle_slot}`), s.format, s, shots)));
  return { locked: null, cards };

}

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/creatives). */
export async function creativesState(uid: string, productId: string): Promise<CreativesState> {
  const [choice, runs, concepts, selection] = await Promise.all([imageProviderChoice(uid, "creatives"), latestCreativeRuns(uid, [productId]), activeConcepts(uid, [productId]), getSelectedProductStrategy(uid, productId)]);
  const connected = choice.value !== null;
  const noProvider = noProviderReason(choice, "anuncios");
  const rows = concepts.get(productId) ?? [];
  const assets = await assetsFor(uid, rows.map((c) => c.id));
  const [urls, kept] = await Promise.all([
    signedUrls(assets.map((a) => a.storage_path).filter((p): p is string => Boolean(p))),
    keptAdCopies(assets.map((a) => a.ad_media_id).filter((id): id is string => Boolean(id))),
  ]);
  const run = runs.get(productId);
  return {
    locked: !connected ? noProvider : null,
    connected,
    imageProvider: choice,
    run: run ? { id: run.id, status: run.status, error: run.error_message ?? undefined, createdAt: run.created_at } : undefined,
    concepts: rows.map((c) => toConceptView(c, assets, urls, kept)),
    angles: selection?.snapshot.angles.map((angle, i) => ({ slot: i + 1, name: angle.name })) ?? [],
    imageCostUsd: IMAGE_COST_BY_PROVIDER[choice.value ?? "higgsfield"],
  };
}

/** La etapa Imágenes: los espacios de la página con sus opciones (generadas, subidas y fotos). */
export const getProductPageImages = cache(async (id: string): Promise<ProductPageImages | null> => {
  const found = await withProduct(id, (uid) => pageImagesState(uid, id));
  return found && { product: found.product, ...found.state };
});

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/page-images). */
export async function pageImagesState(uid: string, productId: string): Promise<PageImagesState> {
  const [choice, runs, shots, rows, refs, blocker, anthropic] = await Promise.all([
    imageProviderChoice(uid, "page_images"),
    latestPageImageRuns(uid, [productId]),
    activeShots(uid, productId),
    pageImageRows(uid, [productId]),
    listImageRows(uid, [productId]),
    generationBlocker(uid, productId),
    getAnthropicConnection(uid),
  ]);
  const inUse = refs.filter((r) => !r.excluded);
  // Anthropic solo participa en la revisión visual opcional; el blocker comprueba ese switch.
  const aiConnected = anthropic?.status === "connected";
  const [urls, refUrls] = await Promise.all([signedPageUrls([...new Set(rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p)))]), withDisplayUrls(inUse)]);
  for (const [id, src] of refUrls) urls.set(`ref:${id}`, src);
  const run = runs.get(productId);
  const connected = choice.value !== null;
  const noProvider = noProviderReason(choice, "imágenes");
  // La galería del chat conserva la identidad de la estrategia seleccionada.
  const canonicalSelection = run?.input.source === "mcp_chat" ? await getSelectedProductStrategy(uid, productId) : null;
  const chatPlan = run?.input.source === "mcp_chat" ? (run.input.content as { plan?: { visual_world?: string; visual_world_why?: string } } | undefined)?.plan : null;
  const world = chatPlan?.visual_world ?? run?.world, worldWhy = chatPlan?.visual_world_why ?? run?.world_why;
  const canonicalStale = run?.input.source === "mcp_chat" && (!canonicalSelection?.readiness.ready_for_execution || canonicalSelection.id !== (run.input.content as { strategy_id?: string } | undefined)?.strategy_id);
  return {
    locked: null,
    connected,
    aiConnected,
    imageProvider: choice,
    cannotGenerate: blocker ?? (connected ? null : noProvider),
    run: run ? { id: run.id, status: run.status, error: run.error_message ?? undefined, createdAt: run.created_at } : undefined,
    style: run?.status === "succeeded" && shots.length && isVisualWorld(world) && worldWhy ? { name: VISUAL_WORLD_NAMES[world], why: worldWhy } : undefined,
    slots: toSlotViews(shots, rows, urls),
    references: inUse.map((r) => ({ id: r.id, src: refUrls.get(r.id) ?? "", alt: r.alt ?? "" })).filter((r) => r.src),
    imageCostUsd: IMAGE_COST_BY_PROVIDER[choice.value ?? "higgsfield"],
    stale: Boolean(canonicalStale),
  };
}

/** La etapa WhatsApp: los mensajes de los pedidos con los datos del producto y el consejo de uso. */
export const getProductMessages = cache(async (id: string): Promise<ProductMessages | null> => {
  const found = await withProduct(id, async (uid) => {
    const row = await productRow(uid, id);
    return row ? messagesState(uid, row) : null;
  });
  return found?.state ? { product: found.product, ...found.state } : null;
});

/** La etapa Publicar: el producto y el estado de su publicación (lib/data/publish.ts). */
export const getProductPublish = cache(async (id: string) => {
  return withProduct(id, (uid) => publishState(uid, id));
});
