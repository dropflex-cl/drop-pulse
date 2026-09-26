// Acceso a productos desde Supabase (products, product_reference_images, pipeline_runs,
// customer_avatars, las reseñas importadas, la etapa Ángulos: angle_rankings, angle_briefs, y la
// página del producto: copy_runs, page_components). Las imágenes generadas todavía no existen: esa
// lectura devuelve vacío y la pantalla muestra su espera.
import "server-only";
import { GALLERY_MIN } from "@/lib/page-images/catalog";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ANGLES } from "@/lib/angles/catalog";
import { allApproved, chosenAngles, currentBriefs, currentBriefStates, latestRankings, latestRankingStates, toBriefView, toRankingView, type BriefsBySlot, type BriefState, type RankingState } from "@/lib/angles/store";
import { testAngleName } from "@/lib/angles/catalog";
import { competitorViews, confirmedDifferentiator, differentiatorState } from "@/lib/competitors/store";
import { copyProgress } from "@/lib/copy/progress";
import { avatarStamp, differentiatorStamp, staleReasons } from "@/lib/copy/stale";
import { COPY_PROMPT_VERSION } from "@/lib/copy/schemas";
import { storeFacts } from "@/lib/copy/facts";
import { catalogImages } from "@/lib/copy/images";
import { activeComponents, activeComponentStates, copyRunInputs, isStale, latestCopyRuns, latestCopyRunStates, toComponentViews, type ComponentState, type CopyRunState } from "@/lib/copy/store";
import { sessionUser } from "@/lib/integrations/session";
import { latestPackLabels, toPackLabelsProposal } from "@/lib/pricing/labels-store";
import { getPricingPlan, pricingDefaults } from "@/lib/pricing/store";
import { scheduleHousekeeping } from "@/lib/products/housekeeping";
import { productPosition, type AdsFacts, type AngleFacts, type CopyFacts, type CreativeFacts, type ImageFacts, type PublishFacts, type ReviewFacts } from "@/lib/products/stages";
import { getPublications, type PublicationRow } from "@/lib/pipeline/publish";
import { publishState } from "@/lib/data/publish";
import { IMAGE_COST_BY_PROVIDER } from "@/lib/image-provider";
import { activeConcepts, assetsFor, creativeCounts, keptAdCopies, latestCreativeRuns, signedUrls, toConceptView } from "@/lib/creatives/store";
import { activeScripts, expireStaleVideos, shotsFor, toCardView } from "@/lib/video/store";
import { getHiggsfieldConnection } from "@/lib/integrations/higgsfield/connection";
import { activeShots, latestPageImageRuns, pageImageCounts, pageImageRows, signedPageUrls, toSlotViews } from "@/lib/page-images/store";
import { approvedBriefStamp, briefStampOf, generationBlocker } from "@/lib/pipeline/page-images";
import { analyzedCompetitors, getDifferentiator } from "@/lib/competitors/store";
import { imageProviderChoice, noProviderReason } from "@/lib/integrations/image-provider";
import { adminClient } from "@/lib/integrations/admin";
import { getMetaConnection } from "@/lib/integrations/meta/connection";
import { customerReviews, latestImport, latestSource, reviewFacts, toReviewImport } from "@/lib/reviews/store";
import {
  baseImage,
  getProductRow,
  latestAvatars,
  latestAvatarStates,
  latestBrief,
  latestBriefId,
  latestRuns,
  latestRunStates,
  listImageRows,
  listProductRows,
  toProposal,
  toReferenceImage,
  toUiStatus,
  toRun,
  withDisplayUrls,
  type AvatarState,
  type ImageRow,
  type ProductRow,
  type RunState,
} from "@/lib/products/store";
import type { AnglesState, CopyState, CreativesState, VideosState, PageImagesState, Product, ProductPageImages, ProductAngles, ProductBase, ProductCopy, ProductCreatives, ProductFilter, ProductReviews } from "@/lib/types";

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

type Briefs = BriefsBySlot<BriefState>;

function angleFacts(ranking: RankingState | undefined, briefs: Briefs | undefined): AngleFacts | null {
  if (!ranking) return null;
  const chosen = chosenAngles(ranking);
  const name = (b: BriefState) => {
    const a = chosen.find((c) => c.slot === b.slot);
    return a ? testAngleName({ ...a, frame: b.angle }) : ANGLES[b.angle].name;
  };
  return {
    ranking: { status: ranking.status, error: ranking.error_message, confirmed: Boolean(ranking.confirmed_at), chosen: chosen.length },
    briefs: Object.values(briefs ?? {})
      .filter((b): b is BriefState => Boolean(b) && (!chosen.length || b!.slot <= chosen.length))
      .sort((a, b) => a.slot - b.slot)
      .map((b) => ({ slot: b.slot, name: name(b), status: toUiStatus(b.status), generation: b.generation, error: b.error_message })),
  };
}

/** Los desarrollos de la elección confirmada, en orden de slot, como huella (lib/angles/approved.ts). */
function stampOfBriefs(ranking: Pick<RankingState, "chosen_angles" | "confirmed_at"> | undefined, briefs: BriefsBySlot<Pick<BriefState, "id" | "edited_at">> | undefined) {
  if (!ranking) return [];
  return chosenAngles(ranking).flatMap((a) => (briefs?.[a.slot] ? [{ id: briefs[a.slot]!.id, edited_at: briefs[a.slot]!.edited_at ?? null }] : []));
}

function copyFacts(run: CopyRunState | undefined, rows: ComponentState[] | undefined, briefs: Briefs | undefined, ranking?: RankingState): CopyFacts | null {
  if (!run && !rows?.length) return null;
  return {
    run: run ? { status: run.status, error: run.error_message } : null,
    progress: copyProgress((rows ?? []).map((r) => ({ component: r.component, status: toUiStatus(r.status), enabled: r.enabled }))),
    stale: isStale(run, stampOfBriefs(ranking, briefs)),
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
  run?: RunState,
  avatar?: AvatarState,
  reviews?: ReviewFacts,
  angles?: AngleFacts | null,
  copy?: CopyFacts | null,
  ads?: AdsFacts,
  creatives?: CreativeFacts,
  images?: ImageFacts,
  publish?: PublishFacts | null,
): Product {
  const position = productPosition({
    price: Number(row.price),
    currency: row.currency,
    run: run ? { status: run.status, error: run.error_message, createdAt: run.created_at } : null,
    avatar: avatar ? { status: toUiStatus(avatar.status), createdAt: avatar.created_at } : null,
    reviews,
    angles,
    copy,
    ads,
    creatives,
    images,
    publish,
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

/**
 * Los productos dados con su posición en la ruta: una ida por tabla, solo con las columnas que la
 * calculan (sin payloads), filtrada a esos productos. Sin cookies ni `after`: la usa también el
 * número de Hoy en caché (lib/data/today.ts). `images: false` salta la miniatura (no firma URLs).
 */
export async function productsWithPositions(uid: string, rows: ProductRow[], { images = true }: { images?: boolean } = {}): Promise<Product[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [imageRows, runs, avatars, reviews, rankings, copyRuns, copyRows, ads, creatives, pageImages, publications] = await Promise.all([
    images ? listImageRows(uid, ids) : Promise.resolve([] as ImageRow[]),
    latestRunStates(uid, ids),
    latestAvatarStates(uid, ids),
    reviewFacts(uid, ids),
    latestRankingStates(uid, ids),
    latestCopyRunStates(uid, ids),
    activeComponentStates(uid, ids),
    adsFacts(uid, ids),
    creativeFacts(uid, ids),
    pageImageCounts(uid, ids),
    getPublications(uid, ids),
  ]);
  const covers = rows.map((r) => cover(imageRows.filter((i) => i.product_id === r.id))).filter((i): i is ImageRow => !!i);
  const [briefs, urls] = await Promise.all([
    currentBriefStates(uid, [...rankings.values()].filter((r) => r.confirmed_at).map((r) => r.id)),
    withDisplayUrls(covers),
  ]);
  return rows.map((r) => {
    const c = covers.find((i) => i.product_id === r.id);
    const ranking = rankings.get(r.id);
    const chosen = ranking?.confirmed_at ? briefs.get(ranking.id) : undefined;
    const angles = angleFacts(ranking, chosen);
    const copy = copyFacts(copyRuns.get(r.id), copyRows.get(r.id), chosen, ranking);
    return toProduct(r, c ? (urls.get(c.id) ?? "") : "", runs.get(r.id), avatars.get(r.id), reviews.get(r.id), angles, copy, ads(r.id), creatives(r.id), pageImages(r.id), publicationFacts(publications.get(r.id)));
  });
}

/** Todos los productos del comerciante, con su posición en la ruta (la lista y Hoy). */
const allProducts = cache(async (): Promise<Product[]> => {
  const uid = await userId();
  return productsWithPositions(uid, await listProductRows(uid));
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

/** La etapa Información base: texto, imágenes de referencia, la optimización y el cliente ideal. */
export const getProductBase = cache(async (id: string): Promise<ProductBase | null> => {
  if (!UUID.test(id)) return null;
  const uid = await userId();
  // Todo a la vez: la etapa no espera a la ruta del producto; solo los valores por defecto del precio esperan la fila.
  const row$ = productRow(uid, id);
  const [product, row, images, runs, avatars, brief, pricing, pricingDefaultsValue, packLabels, differentiator, competitors] = await Promise.all([
    getProduct(id),
    row$,
    listImageRows(uid, [id]),
    latestRuns(uid, [id]),
    latestAvatars(uid, [id]),
    latestBrief(uid, id),
    getPricingPlan(uid, id),
    row$.then((r) => (r ? pricingDefaults(uid, r) : null)),
    latestPackLabels(uid, id),
    confirmedDifferentiator(uid, id),
    competitorViews(uid, id),
  ]);
  if (!product || !row || !pricingDefaultsValue) return null;
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
    hasBrief: brief !== null,
    differentiator: differentiatorState(differentiator, brief),
    competitors,
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

/** La etapa Ángulos: el cliente ideal que la alimenta, la evaluación del orquestador y los 2 desarrollos. */
export const getProductAngles = cache(async (id: string): Promise<ProductAngles | null> => {
  const found = await withProduct(id, (uid) => anglesState(uid, id));
  return found && { product: found.product, ...found.state };
});

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/angles). */
export async function anglesState(uid: string, productId: string): Promise<AnglesState> {
  const [avatars, rankings, differentiator, competitors] = await Promise.all([
    latestAvatars(uid, [productId]),
    latestRankings(uid, [productId]),
    getDifferentiator(uid, productId),
    analyzedCompetitors(uid, productId),
  ]);
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
    briefs: ranking ? chosenAngles(ranking).flatMap((a) => (briefs[a.slot] ? [toBriefView(briefs[a.slot]!, a)] : [])) : [],
    differentiator: differentiator.value ? { versus: differentiator.value.versus, claim: differentiator.value.claim, confirmed: differentiator.confirmed } : null,
    competitors: competitors.length,
  };
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
  const [runs, rows, rankings, images, facts, counts, avatars, briefId, differentiator] = await Promise.all([
    latestCopyRuns(uid, [productId]),
    activeComponents(uid, [productId]),
    latestRankings(uid, [productId]),
    catalogImages(uid, productId),
    storeFacts(uid, productId),
    pageImageCounts(uid, [productId]),
    latestAvatars(uid, [productId]),
    latestBriefId(uid, productId),
    getDifferentiator(uid, productId),
  ]);
  const run = runs.get(productId);
  const ranking = rankings.get(productId);
  const briefs = ranking?.confirmed_at ? ((await currentBriefs(uid, [ranking.id])).get(ranking.id) ?? {}) : {};
  const approved = ranking ? allApproved(chosenAngles(ranking), briefs) : false;
  const chosen = counts(productId);
  // Qué cambió desde las escrituras que dejaron la página (lib/copy/stale.ts).
  const pageRows = (rows.get(productId) ?? []).filter((r) => r.enabled);
  const avatar = avatars.get(productId);
  const reasons =
    approved && pageRows.length
      ? staleReasons(await copyRunInputs(uid, [...new Set(pageRows.map((r) => r.run_id))]), {
          briefs: stampOfBriefs(ranking, briefs),
          avatar: avatar?.status === "approved" ? avatarStamp(avatar) : null,
          context: { brief: briefId, differentiator: differentiatorStamp(differentiator.value), prompt_version: COPY_PROMPT_VERSION },
        })
      : [];
  return {
    locked: !approved ? "angles" : imagesReady(chosen) ? null : "images",
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

/** La pestaña Videos (docs/spec-video-ugc.md): una tarjeta por ángulo aprobado. Lo que devuelve su sondeo. */
export async function videosState(uid: string, productId: string): Promise<VideosState> {
  const [rankings, connection, scripts] = await Promise.all([latestRankings(uid, [productId]), getHiggsfieldConnection(uid), activeScripts(uid, productId)]);
  const ranking = rankings.get(productId);
  const briefs = ranking?.confirmed_at ? ((await currentBriefs(uid, [ranking.id])).get(ranking.id) ?? {}) : {};
  const chosen = ranking ? chosenAngles(ranking) : [];
  const anglesDone = ranking ? allApproved(chosen, briefs) : false;
  if (!anglesDone) return { locked: "Aprueba los desarrollos de tus ángulos para hacer videos.", cards: [] };
  if (connection?.status !== "connected") return { locked: "Conecta tu cuenta de Higgsfield en Ajustes para hacer videos: las voces y los clips se generan ahí.", cards: [] };
  const shots = await shotsFor(uid, scripts.map((s) => s.id));
  const cards = await Promise.all(chosen.map((a) => toCardView(a.slot, testAngleName(a), scripts.find((s) => s.angle_slot === a.slot), shots)));
  return { locked: null, cards };
}

/** El estado de la etapa sin el producto: lo que devuelve el sondeo (/api/products/[id]/creatives). */
export async function creativesState(uid: string, productId: string): Promise<CreativesState> {
  const [choice, runs, concepts, rankings] = await Promise.all([imageProviderChoice(uid, "creatives"), latestCreativeRuns(uid, [productId]), activeConcepts(uid, [productId]), latestRankings(uid, [productId])]);
  const ranking = rankings.get(productId);
  const briefs = ranking?.confirmed_at ? ((await currentBriefs(uid, [ranking.id])).get(ranking.id) ?? {}) : {};
  const anglesDone = ranking ? allApproved(chosenAngles(ranking), briefs) : false;
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
    locked: !anglesDone ? "Aprueba los desarrollos de tus ángulos para crear anuncios." : !connected ? noProvider : null,
    connected,
    imageProvider: choice,
    run: run ? { id: run.id, status: run.status, error: run.error_message ?? undefined, createdAt: run.created_at } : undefined,
    concepts: rows.map((c) => toConceptView(c, assets, urls, kept)),
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
  const [choice, briefStamp, runs, shots, rows, refs, blocker] = await Promise.all([
    imageProviderChoice(uid, "page_images"),
    approvedBriefStamp(uid, productId),
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
  const connected = choice.value !== null;
  const noProvider = noProviderReason(choice, "imágenes");
  // Los desarrollos de Ángulos con que se propuso la galería, contra los aprobados hoy.
  const planned = briefStampOf((run?.input as { briefs?: unknown } | undefined)?.briefs);
  return {
    locked: briefStamp ? null : "Aprueba los desarrollos de tus ángulos para preparar las imágenes.",
    connected,
    imageProvider: choice,
    cannotGenerate: blocker ?? (connected ? null : noProvider),
    run: run ? { id: run.id, status: run.status, error: run.error_message ?? undefined, createdAt: run.created_at } : undefined,
    slots: toSlotViews(shots, rows, urls),
    references: inUse.map((r) => ({ id: r.id, src: refUrls.get(r.id) ?? "", alt: r.alt ?? "" })).filter((r) => r.src),
    imageCostUsd: IMAGE_COST_BY_PROVIDER[choice.value ?? "higgsfield"],
    stale: Boolean(run?.status === "succeeded" && shots.length && planned && briefStamp && planned !== briefStamp),
  };
}

/** La etapa Publicar: el producto y el estado de su publicación (lib/data/publish.ts). */
export const getProductPublish = cache(async (id: string) => {
  return withProduct(id, (uid) => publishState(uid, id));
});
