// Acceso a productos desde Supabase (products, product_reference_images, pipeline_runs,
// customer_avatars, las reseñas importadas, la etapa Ángulos: angle_rankings, angle_briefs, y la
// página del producto: copy_runs, page_components). Las imágenes generadas todavía no existen: esa
// lectura devuelve vacío y la pantalla muestra su espera.
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ANGLES } from "@/lib/angles/catalog";
import { currentBriefs, expireStaleAngles, latestRankings, toBriefView, toRankingView, type BriefRow, type RankingRow } from "@/lib/angles/store";
import { copyProgress } from "@/lib/copy/progress";
import { storeFacts } from "@/lib/copy/facts";
import { catalogImages } from "@/lib/copy/images";
import { activeComponents, expireStaleCopy, isStale, latestCopyRuns, toComponentViews, type CopyRunRow, type PageComponentRow } from "@/lib/copy/store";
import { sessionUser } from "@/lib/integrations/session";
import { latestPackLabels, toPackLabelsProposal } from "@/lib/pricing/labels-store";
import { getPricingPlan, pricingDefaults } from "@/lib/pricing/store";
import { syncSelectedProducts } from "@/lib/products/sync";
import { productPosition, type AdsFacts, type AngleFacts, type CopyFacts, type CreativeFacts, type ImageFacts, type ReviewFacts } from "@/lib/products/stages";
import { IMAGE_COST_USD } from "@/lib/creatives/catalog";
import { activeConcepts, assetsFor, creativeCounts, expireStaleCreatives, latestCreativeRuns, signedUrls, toConceptView } from "@/lib/creatives/store";
import { activeShots, expireStalePageImages, latestPageImageRuns, pageCopy, pageImageCounts, pageImageRows, signedPageUrls, toSlotViews } from "@/lib/page-images/store";
import { generationBlocker } from "@/lib/pipeline/page-images";
import { getHiggsfieldConnection } from "@/lib/integrations/higgsfield/connection";
import { adminClient } from "@/lib/integrations/admin";
import { getMetaConnection } from "@/lib/integrations/meta/connection";
import { customerReviews, expireStaleImports, latestImport, latestSource, reviewFacts, toReviewImport } from "@/lib/reviews/store";
import {
  baseImage,
  expireStaleRuns,
  getProductRow,
  latestAvatars,
  latestBrief,
  latestRuns,
  listImageRows,
  listProductRows,
  toProposal,
  toReferenceImage,
  toUiStatus,
  toRun,
  withDisplayUrls,
  type AvatarRow,
  type ImageRow,
  type ProductRow,
  type RunRow,
} from "@/lib/products/store";
import type { AnglesState, CopyState, CreativesState, PageImagesState, Product, ProductPageImages, ProductAngles, ProductBase, ProductCopy, ProductCreatives, ProductFilter, ProductReviews } from "@/lib/types";

const userId = cache(async () => {
  const user = await sessionUser();
  if (!user) redirect("/auth/login");
  return user.id;
});

/** La miniatura del producto es su imagen base (o, si todas están excluidas, la primera). */
function cover(images: ImageRow[]): ImageRow | undefined {
  return baseImage(images) ?? images[0];
}

function angleFacts(ranking: RankingRow | undefined, briefs: Partial<Record<"primary" | "secondary", BriefRow>> | undefined): AngleFacts | null {
  if (!ranking) return null;
  return {
    ranking: { status: ranking.status, error: ranking.error_message, confirmed: Boolean(ranking.confirmed_at) },
    briefs: Object.values(briefs ?? {}).map((b) => ({ role: b.role, name: ANGLES[b.angle].name, status: toUiStatus(b.status), generation: b.generation, error: b.error_message })),
  };
}

function copyFacts(run: CopyRunRow | undefined, rows: PageComponentRow[] | undefined, briefs: Partial<Record<"primary" | "secondary", BriefRow>> | undefined): CopyFacts | null {
  if (!run && !rows?.length) return null;
  return {
    run: run ? { status: run.status, error: run.error_message } : null,
    progress: copyProgress(toComponentViews(rows ?? [])),
    stale: isStale(run, briefs ?? {}),
  };
}

/** Meta listo y las campañas de cada producto (etapa Anuncios). */
async function adsFacts(uid: string): Promise<(productId: string) => AdsFacts> {
  const [meta, { data }] = await Promise.all([getMetaConnection(uid), adminClient().from("ad_campaigns").select("product_id, status").eq("user_id", uid).in("status", ["launching", "paused", "active"])]);
  const metaReady = Boolean(meta?.status === "connected" && meta.ad_account_id && meta.page_id && meta.pixel_id);
  const rows = (data ?? []) as { product_id: string; status: string }[];
  return (productId) => {
    const mine = rows.filter((r) => r.product_id === productId);
    return { metaReady, campaigns: mine.filter((r) => r.status !== "launching").length, launching: mine.some((r) => r.status === "launching") };
  };
}

/** La clave de Higgsfield y las piezas de cada producto (etapa Creativos). */
async function creativeFacts(uid: string, ids: string[]): Promise<(productId: string) => CreativeFacts> {
  const [conn, counts] = await Promise.all([getHiggsfieldConnection(uid), creativeCounts(uid, ids)]);
  const connected = conn?.status === "connected";
  return (productId) => ({ connected, ...counts(productId) });
}

function toProduct(
  row: ProductRow,
  image: string,
  run?: RunRow,
  avatar?: AvatarRow,
  reviews?: ReviewFacts,
  angles?: AngleFacts | null,
  copy?: CopyFacts | null,
  ads?: AdsFacts,
  creatives?: CreativeFacts,
  images?: ImageFacts,
): Product {
  const position = productPosition({
    price: Number(row.price),
    currency: row.currency,
    run: run ? { status: run.status, error: run.error_message, createdAt: run.created_at } : null,
    avatar: avatar ? { status: toProposal(avatar).status, createdAt: avatar.created_at } : null,
    reviews,
    angles,
    copy,
    ads,
    creatives,
    images,
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
    supplierCost: row.cost == null ? 0 : Number(row.cost),
    price: Number(row.price),
    currency: row.currency,
  };
}

/** Todos los productos del comerciante, con su posición en la ruta. Una sola ida por tabla. */
const allProducts = cache(async (): Promise<Product[]> => {
  const uid = await userId();
  // Los elegidos en el onboarding que aún no se crearon (p. ej., antes de esta versión).
  await syncSelectedProducts(uid).catch((e) => console.error("[data/products] sincronizar", e));
  await Promise.all([expireStaleRuns(uid), expireStaleImports(uid), expireStaleAngles(uid), expireStaleCopy(uid), expireStaleCreatives(uid), expireStalePageImages(uid)]);
  const rows = await listProductRows(uid);
  const ids = rows.map((r) => r.id);
  const [images, runs, avatars, reviews, rankings, copyRuns, copyRows, ads, creatives, pageImages] = await Promise.all([
    listImageRows(uid, ids),
    latestRuns(uid, ids),
    latestAvatars(uid, ids),
    reviewFacts(uid, ids),
    latestRankings(uid, ids),
    latestCopyRuns(uid, ids),
    activeComponents(uid, ids),
    adsFacts(uid),
    creativeFacts(uid, ids),
    pageImageCounts(uid, ids),
  ]);
  const briefs = await currentBriefs(uid, [...rankings.values()].filter((r) => r.confirmed_at).map((r) => r.id));
  const covers = rows.map((r) => cover(images.filter((i) => i.product_id === r.id))).filter((i): i is ImageRow => !!i);
  const urls = await withDisplayUrls(covers);
  return rows.map((r) => {
    const c = covers.find((i) => i.product_id === r.id);
    const ranking = rankings.get(r.id);
    const chosen = ranking?.confirmed_at ? briefs.get(ranking.id) : undefined;
    const angles = angleFacts(ranking, chosen);
    const copy = copyFacts(copyRuns.get(r.id), copyRows.get(r.id), chosen);
    return toProduct(r, c ? (urls.get(c.id) ?? "") : "", runs.get(r.id), avatars.get(r.id), reviews.get(r.id), angles, copy, ads(r.id), creatives(r.id), pageImages(r.id));
  });
});

export async function getProducts(filter?: ProductFilter): Promise<Product[]> {
  const all = await allProducts();
  return filter ? all.filter((p) => p.filter === filter) : all;
}

export async function getProductCounts(): Promise<Record<ProductFilter, number> & { total: number }> {
  const all = await allProducts();
  const count = (f: ProductFilter) => all.filter((p) => p.filter === f).length;
  return { avanzan: count("avanzan"), detenidos: count("detenidos"), publicados: count("publicados"), total: all.length };
}

export const getProduct = cache(async (id: string): Promise<Product | null> => {
  return (await allProducts()).find((p) => p.id === id) ?? null;
});

/** La etapa Información base: texto, imágenes de referencia, la optimización y el cliente ideal. */
export const getProductBase = cache(async (id: string): Promise<ProductBase | null> => {
  const uid = await userId();
  const [product, row] = await Promise.all([getProduct(id), getProductRow(uid, id)]);
  if (!product || !row) return null;
  const [images, runs, avatars, brief, pricing, pricingDefaultsValue, packLabels] = await Promise.all([
    listImageRows(uid, [id]),
    latestRuns(uid, [id]),
    latestAvatars(uid, [id]),
    latestBrief(uid, id),
    getPricingPlan(uid, id),
    pricingDefaults(uid, row),
    latestPackLabels(uid, id),
  ]);
  const urls = await withDisplayUrls(images);
  const run = runs.get(id);
  const avatar = avatars.get(id);
  return {
    product,
    baseInfo: row.base_info,
    baseInfoUpdatedAt: row.base_info_updated_at ?? undefined,
    fromShopify: Boolean(row.description?.trim()) && row.base_info.includes(row.description!.trim().slice(0, 40)),
    images: images.filter((i) => urls.has(i.id)).map((i) => toReferenceImage(i, urls.get(i.id)!)),
    run: run ? toRun(run) : undefined,
    avatar: avatar ? toProposal(avatar) : undefined,
    pricing: pricing ?? undefined,
    packLabels: packLabels ? toPackLabelsProposal(packLabels, pricing) : undefined,
    pricingDefaults: pricingDefaultsValue,
    missingInputs: brief?.missing_inputs ?? [],
  };
});

/** La etapa Reseñas: las reseñas importadas, su listado de AliExpress y la última importación. */
export const getProductReviews = cache(async (id: string): Promise<ProductReviews | null> => {
  const uid = await userId();
  const product = await getProduct(id);
  if (!product) return null;
  const [reviews, source, job] = await Promise.all([customerReviews(uid, id), latestSource(uid, id), latestImport(uid, id)]);
  return {
    product,
    reviews,
    source: source
      ? { url: source.url, avgRating: source.avg_rating == null ? undefined : Number(source.avg_rating), totalReviews: source.total_reviews ?? undefined }
      : undefined,
    lastImport: job ? toReviewImport(job) : undefined,
  };
});

/** La etapa Ángulos: el cliente ideal que la alimenta, la evaluación del orquestador y los 2 desarrollos. */
export const getProductAngles = cache(async (id: string): Promise<ProductAngles | null> => {
  const uid = await userId();
  const product = await getProduct(id);
  if (!product) return null;
  return { product, ...(await anglesState(uid, id)) };
});

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/angles). */
export async function anglesState(uid: string, productId: string): Promise<AnglesState> {
  const [avatars, rankings] = await Promise.all([latestAvatars(uid, [productId]), latestRankings(uid, [productId])]);
  const avatar = avatars.get(productId);
  const ranking = rankings.get(productId);
  const briefs = ranking?.confirmed_at ? ((await currentBriefs(uid, [ranking.id])).get(ranking.id) ?? {}) : {};
  const a = avatar?.payload;
  return {
    avatar: a
      ? {
          summary: a.summary,
          tags: [a.demographics.age_range, a.demographics.occupation_or_role, a.demographics.location].map((t) => t?.trim()).filter(Boolean).slice(0, 3),
          approved: avatar.status === "approved",
        }
      : undefined,
    ranking: ranking ? toRankingView(ranking, avatar?.status === "approved" ? avatar.id : undefined) : undefined,
    briefs: {
      primary: briefs.primary ? toBriefView(briefs.primary) : undefined,
      secondary: briefs.secondary ? toBriefView(briefs.secondary) : undefined,
    },
  };
}

/** La etapa Página del producto: la ficha y los componentes de conversión. */
export const getProductCopy = cache(async (id: string): Promise<ProductCopy | null> => {
  const uid = await userId();
  const [product, row] = await Promise.all([getProduct(id), getProductRow(uid, id)]);
  if (!product || !row) return null;
  return { product, accent: row.page_accent_color ?? null, ...(await copyState(uid, id)) };
});

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/copy). */
export async function copyState(uid: string, productId: string): Promise<CopyState> {
  const [runs, rows, rankings, images, facts] = await Promise.all([
    latestCopyRuns(uid, [productId]),
    activeComponents(uid, [productId]),
    latestRankings(uid, [productId]),
    catalogImages(uid, productId),
    storeFacts(uid, productId),
  ]);
  const run = runs.get(productId);
  const ranking = rankings.get(productId);
  const briefs = ranking?.confirmed_at ? ((await currentBriefs(uid, [ranking.id])).get(ranking.id) ?? {}) : {};
  const approved = (["primary", "secondary"] as const).every((r) => briefs[r]?.generation === "succeeded" && briefs[r]?.status === "approved");
  return {
    locked: !approved,
    run: run ? { id: run.id, status: run.status, error: run.error_message ?? undefined, createdAt: run.created_at } : undefined,
    components: toComponentViews(rows.get(productId) ?? []),
    images,
    facts,
    stale: approved && isStale(run, briefs),
  };
}

/** La etapa Creativos: los conceptos del generador y sus piezas generadas con Higgsfield. */
export const getProductCreatives = cache(async (id: string): Promise<ProductCreatives | null> => {
  const uid = await userId();
  const product = await getProduct(id);
  if (!product) return null;
  return { product, ...(await creativesState(uid, id)) };
});

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/creatives). */
export async function creativesState(uid: string, productId: string): Promise<CreativesState> {
  const [conn, runs, concepts, rankings] = await Promise.all([getHiggsfieldConnection(uid), latestCreativeRuns(uid, [productId]), activeConcepts(uid, [productId]), latestRankings(uid, [productId])]);
  const ranking = rankings.get(productId);
  const briefs = ranking?.confirmed_at ? ((await currentBriefs(uid, [ranking.id])).get(ranking.id) ?? {}) : {};
  const anglesDone = (["primary", "secondary"] as const).every((r) => briefs[r]?.generation === "succeeded" && briefs[r]?.status === "approved");
  const connected = conn?.status === "connected";
  const rows = concepts.get(productId) ?? [];
  const assets = await assetsFor(uid, rows.map((c) => c.id));
  const urls = await signedUrls(assets.map((a) => a.storage_path).filter((p): p is string => Boolean(p)));
  const run = runs.get(productId);
  return {
    locked: !anglesDone ? "Aprueba los 2 desarrollos de Ángulos para crear anuncios." : !connected ? (conn?.last_error ?? "Conecta tu cuenta de Higgsfield en Ajustes para generar anuncios.") : null,
    connected,
    run: run ? { id: run.id, status: run.status, error: run.error_message ?? undefined, createdAt: run.created_at } : undefined,
    concepts: rows.map((c) => toConceptView(c, assets, urls)),
    imageCostUsd: IMAGE_COST_USD,
  };
}

/** La etapa Imágenes: los espacios de la página con sus opciones (generadas, subidas y fotos). */
export const getProductPageImages = cache(async (id: string): Promise<ProductPageImages | null> => {
  const uid = await userId();
  const product = await getProduct(id);
  if (!product) return null;
  return { product, ...(await pageImagesState(uid, id)) };
});

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/page-images). */
export async function pageImagesState(uid: string, productId: string): Promise<PageImagesState> {
  const [conn, copy, runs, shots, rows, refs, blocker] = await Promise.all([
    getHiggsfieldConnection(uid),
    pageCopy(uid, productId),
    latestPageImageRuns(uid, [productId]),
    activeShots(uid, productId),
    pageImageRows(uid, [productId]),
    listImageRows(uid, [productId]),
    generationBlocker(uid, productId),
  ]);
  const inUse = refs.filter((r) => !r.excluded);
  const [urls, refUrls] = await Promise.all([signedPageUrls([...new Set(rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p)))]), withDisplayUrls(inUse)]);
  for (const [id, src] of refUrls) urls.set(`ref:${id}`, src);
  const run = runs.get(productId);
  const connected = conn?.status === "connected";
  // Los beneficios con que se propuso la galería, contra los aprobados hoy.
  const planned = ((run?.input as { copy?: { benefits?: { id: string }[] } } | undefined)?.copy?.benefits ?? []).map((b) => b.id).join();
  return {
    locked: copy.complete ? null : "Aprueba la página del producto para preparar sus imágenes.",
    connected,
    cannotGenerate: blocker ?? (connected ? null : (conn?.last_error ?? "Conecta tu cuenta de Higgsfield en Ajustes para generar imágenes.")),
    run: run ? { id: run.id, status: run.status, error: run.error_message ?? undefined, createdAt: run.created_at } : undefined,
    slots: toSlotViews(copy, shots, rows, urls),
    references: inUse.map((r) => ({ id: r.id, src: refUrls.get(r.id) ?? "", alt: r.alt ?? "" })).filter((r) => r.src),
    imageCostUsd: IMAGE_COST_USD,
    stale: Boolean(run?.status === "succeeded" && shots.length && planned !== copy.benefits.map((b) => b.id).join()),
  };
}
