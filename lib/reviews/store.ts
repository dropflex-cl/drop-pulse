import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/integrations/admin";
import { optimizeImage } from "@/lib/media/optimize";
import { sniffImage } from "@/lib/products/images";
import { ProductApiError } from "@/lib/products/http";
import { REFERENCES_BUCKET, type DbContentStatus } from "@/lib/products/store";
import type { ReviewFacts } from "@/lib/products/stages";
import type { CustomerReview, CustomerReviewState, ReviewImport, RunStatus } from "@/lib/types";
import {
  REVIEW_BODY_MAX,
  REVIEW_IMPORT_MAX,
  REVIEW_MAX_PAGES,
  AE_PAGE_SIZE,
  extractItemId,
  isAliExpressInput,
  isAllowedImageUrl,
  isShortLink,
  parseFeedbackPage,
  parseFilterCount,
  parseStats,
  parseTotalPages,
  passesFilters,
  type ImportFilters,
  type ReviewDraft,
} from "./aliexpress";
import { importErrorMessage, reviewDate, type ImportErrorCode } from "./copy";
import { PAGE_DELAY_MS, fetchFeedbackPage, resolveShortLink } from "./fetch";
import { reviewFlags } from "./flags";
import { REVIEW_COLUMNS, displayText, importedText, listReviewRows, type ReviewPhoto, type ReviewRow } from "./rows";

export { listReviewRows, type ReviewRow };

// Reseñas importadas: lectura, importación en segundo plano y decisiones del comerciante. Siempre
// con service_role filtrando por el dueño (como lib/products/store.ts). Las fotos se copian al bucket
// del producto (<user_id>/<product_id>/review-*.jpg): no dependen del CDN de AliExpress y el borrado
// del producto (lib/products/delete.ts) se las lleva.

const SIGNED_URL_TTL_S = 60 * 60;
/** Una importación que no avanza en este tiempo se da por interrumpida (el proceso murió). */
const IMPORT_STALE_MS = 10 * 60 * 1000;
const PHOTO_TIMEOUT_MS = 15_000;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** Reseñas que se procesan juntas (fotos en paralelo, una inserción). */
const CHUNK = 8;

export interface ImportRow {
  id: string;
  product_id: string;
  user_id: string;
  source_id: string | null;
  url: string;
  min_rating: number;
  photos_only: boolean;
  translate: boolean;
  status: RunStatus;
  step: "reading" | "photos" | null;
  read_count: number;
  total_count: number | null;
  imported_count: number;
  skipped_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface SourceRow {
  id: string;
  url: string;
  avg_rating: number | null;
  total_reviews: number | null;
  last_imported_at: string | null;
}

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ---------------------------------------------------------------- Lectura

const STATE: Partial<Record<DbContentStatus, CustomerReviewState>> = { approved: "approved", rejected: "rejected", published: "published" };
const toState = (s: DbContentStatus): CustomerReviewState => STATE[s] ?? "pending";

export function toCustomerReview(r: ReviewRow, photoUrls: Map<string, string>): CustomerReview {
  const translated = r.use_translation && r.body_translated != null;
  const original = r.body_original ?? undefined;
  return {
    id: r.id,
    author: r.author,
    country: r.country ?? undefined,
    date: reviewDate(r.reviewed_at),
    rating: r.rating,
    variant: r.variant ?? undefined,
    text: displayText(r),
    // El original se ofrece cuando difiere de lo que se ve (traducida o editada).
    original: original && original !== displayText(r) ? original : undefined,
    translated,
    edited: r.body_edited != null,
    photos: r.photos.map((p) => photoUrls.get(p.path)).filter((u): u is string => !!u),
    flags: r.flags,
    state: toState(r.status),
  };
}

/** URLs firmadas (1 h) de las fotos de estas reseñas, por ruta. */
export async function signPhotos(rows: ReviewRow[]): Promise<Map<string, string>> {
  const paths = rows.flatMap((r) => r.photos.map((p) => p.path));
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data, error } = await adminClient().storage.from(REFERENCES_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_S);
  fail("Firmar las fotos de las reseñas", error);
  for (const [i, p] of paths.entries()) {
    const signed = data?.[i]?.signedUrl;
    if (signed) urls.set(p, signed);
  }
  return urls;
}

export async function customerReviews(userId: string, productId: string, ids?: string[]): Promise<CustomerReview[]> {
  let rows = await listReviewRows(userId, productId);
  if (ids) rows = rows.filter((r) => ids.includes(r.id));
  const urls = await signPhotos(rows);
  return rows.map((r) => toCustomerReview(r, urls));
}

export async function latestSource(userId: string, productId: string): Promise<SourceRow | null> {
  const { data, error } = await adminClient()
    .from("review_sources")
    .select("id, url, avg_rating, total_reviews, last_imported_at")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("last_imported_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  fail("Leer el listado de reseñas", error);
  return data as SourceRow | null;
}

export async function latestImport(userId: string, productId: string): Promise<ImportRow | null> {
  const { data, error } = await adminClient()
    .from("review_imports")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail("Leer la importación", error);
  return data as ImportRow | null;
}

export function toReviewImport(r: ImportRow): ReviewImport {
  return {
    id: r.id,
    status: r.status,
    step: r.step ?? undefined,
    read: r.read_count,
    total: r.total_count ?? undefined,
    imported: r.imported_count,
    skipped: r.skipped_count,
    error: r.status === "failed" ? (r.error_message ?? importErrorMessage(r.error_code)) : undefined,
    createdAt: r.created_at,
    finishedAt: r.finished_at ?? undefined,
  };
}

/** Cierra las importaciones que quedaron colgadas (el proceso murió a la mitad). */
export async function expireStaleImports(userId: string): Promise<void> {
  const { error } = await adminClient()
    .from("review_imports")
    .update({ status: "failed", error_code: "stale", error_message: importErrorMessage("stale"), finished_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("status", ["queued", "running"])
    .lt("updated_at", new Date(Date.now() - IMPORT_STALE_MS).toISOString());
  fail("Cerrar importaciones colgadas", error);
}

/** Cuántas reseñas tiene cada producto y en qué estado (para la ruta y la lista). */
export async function reviewFacts(userId: string, productIds: string[]): Promise<Map<string, ReviewFacts>> {
  const facts = new Map<string, ReviewFacts>();
  if (!productIds.length) return facts;
  const db = adminClient();
  const [reviews, imports] = await Promise.all([
    db.from("product_reviews").select("product_id, status").eq("user_id", userId).in("product_id", productIds),
    db.from("review_imports").select("product_id").eq("user_id", userId).in("product_id", productIds).in("status", ["queued", "running"]),
  ]);
  fail("Contar las reseñas", reviews.error);
  fail("Leer las importaciones", imports.error);
  const get = (id: string) => facts.get(id) ?? (facts.set(id, { pending: 0, approved: 0, total: 0 }), facts.get(id)!);
  for (const r of (reviews.data ?? []) as { product_id: string; status: DbContentStatus }[]) {
    const f = get(r.product_id);
    f.total++;
    const s = toState(r.status);
    if (s === "pending") f.pending++;
    else if (s === "approved" || s === "published") f.approved++;
  }
  for (const r of (imports.data ?? []) as { product_id: string }[]) get(r.product_id).importing = true;
  return facts;
}

// ---------------------------------------------------------------- Importar

/** Crea la importación (una activa por producto). La corre `runImport` en segundo plano. */
export async function startImport(userId: string, productId: string, url: string, filters: ImportFilters): Promise<{ job: ImportRow; created: boolean }> {
  const raw = url.trim();
  // Se valida antes de encolar: el error vuelve al campo, no a la tarjeta.
  if (!isAliExpressInput(raw)) throw new ProductApiError(importErrorMessage("not_aliexpress"), 400, "url");
  await expireStaleImports(userId);
  const db = adminClient();
  const { data, error } = await db
    .from("review_imports")
    .insert({ product_id: productId, user_id: userId, url: raw.slice(0, 2048), min_rating: filters.minRating, photos_only: filters.photosOnly, translate: filters.translate })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const active = await latestImport(userId, productId);
    if (active && (active.status === "queued" || active.status === "running")) return { job: active, created: false };
  }
  fail("Crear la importación", error);
  return { job: data as ImportRow, created: true };
}

async function patchImport(id: string, patch: Partial<ImportRow>) {
  const { error } = await adminClient()
    .from("review_imports")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  fail("Actualizar la importación", error);
}

class ImportFailure extends Error {
  constructor(public code: ImportErrorCode) {
    super(code);
  }
}

/** Copia una foto del CDN de AliExpress al bucket del producto. Null si no se puede: la reseña sigue. */
async function copyPhoto(userId: string, productId: string, url: string): Promise<ReviewPhoto | null> {
  if (!isAllowedImageUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS), headers: { Accept: "image/webp,image/jpeg,image/png" } });
    // La redirección también tiene que quedar en el CDN permitido.
    if (!res.ok || !isAllowedImageUrl(res.url || url)) return null;
    if (Number(res.headers.get("content-length") ?? 0) > PHOTO_MAX_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > PHOTO_MAX_BYTES) return null;
    if (!sniffImage(bytes)) return null;
    // Las fotos de reseñas se ven en tarjetas del carrusel: 1600 px sobran.
    const img = await optimizeImage(bytes, { maxSide: 1600 });
    const path = `${userId}/${productId}/review-${randomUUID()}.${img.ext}`;
    const up = await adminClient().storage.from(REFERENCES_BUCKET).upload(path, img.data, { contentType: img.mime, upsert: false });
    return up.error ? null : { path, source_url: url };
  } catch {
    return null;
  }
}

async function readListing(job: ImportRow, itemId: string, filters: ImportFilters) {
  const first = await fetchFeedbackPage(itemId, 1, filters.photosOnly);
  if (first === null) throw new ImportFailure("fetch_failed");
  const stats = parseStats(first);
  const drafts: ReviewDraft[] = parseFeedbackPage(first);
  // Respondió, pero sin decir nada del listado ni traer reseñas: así se ve un bloqueo, no un “sin reseñas”.
  if (!drafts.length && stats.totalReviews === null) throw new ImportFailure("blocked");
  if (!drafts.length) throw new ImportFailure("no_reviews");

  const pages = Math.min(parseTotalPages(first), REVIEW_MAX_PAGES);
  const total = Math.min(parseFilterCount(first, filters.photosOnly) ?? pages * AE_PAGE_SIZE, REVIEW_MAX_PAGES * AE_PAGE_SIZE);
  await patchImport(job.id, { step: "reading", read_count: drafts.length, total_count: total });

  const wanted = () => drafts.filter((d) => passesFilters(d, filters)).length;
  for (let page = 2; page <= pages && wanted() < REVIEW_IMPORT_MAX; page++) {
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    const payload = await fetchFeedbackPage(itemId, page, filters.photosOnly);
    if (payload === null) break; // algo es mejor que nada
    drafts.push(...parseFeedbackPage(payload));
    await patchImport(job.id, { read_count: Math.min(drafts.length, total) });
  }

  // El endpoint puede repetir una reseña entre páginas si el orden cambia.
  const seen = new Set<string>();
  const unique = drafts.filter((d) => !seen.has(d.externalId) && seen.add(d.externalId));
  return { stats, drafts: unique.filter((d) => passesFilters(d, filters)) };
}

/** Ejecuta la importación. Pensada para `after()`: nunca lanza; deja el resultado en review_imports. */
export async function runImport(importId: string): Promise<void> {
  const db = adminClient();
  const { data: claimed } = await db
    .from("review_imports")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", importId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  const job = claimed as ImportRow | null;
  if (!job) return;
  const { user_id: userId, product_id: productId } = job;
  const filters: ImportFilters = { minRating: job.min_rating as ImportFilters["minRating"], photosOnly: job.photos_only, translate: job.translate };

  try {
    let itemId = extractItemId(job.url);
    if (!itemId && isShortLink(job.url)) {
      itemId = await resolveShortLink(job.url);
      if (!itemId) throw new ImportFailure("short_link_unresolved");
    }
    if (!itemId) throw new ImportFailure("not_aliexpress");

    const { stats, drafts } = await readListing(job, itemId, filters);

    const { data: source, error: sourceError } = await db
      .from("review_sources")
      .upsert(
        {
          product_id: productId,
          user_id: userId,
          source: "aliexpress",
          source_product_id: itemId,
          url: job.url,
          avg_rating: stats.avgRating,
          total_reviews: stats.totalReviews,
          photo_reviews: stats.photoReviews,
          last_imported_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,source,source_product_id" },
      )
      .select("id")
      .single();
    fail("Guardar el listado", sourceError);
    const sourceId = (source as { id: string }).id;

    // Importar otra vez no duplica: las que ya están se cuentan y se saltan.
    const { data: existing, error: existingError } = await db.from("product_reviews").select("external_id, position").eq("product_id", productId);
    fail("Leer las reseñas", existingError);
    const known = new Set((existing ?? []).map((r) => r.external_id as string));
    const fresh = drafts.filter((d) => !known.has(d.externalId)).slice(0, REVIEW_IMPORT_MAX);
    const skipped = drafts.length - drafts.filter((d) => !known.has(d.externalId)).length;
    if (!fresh.length && !skipped) throw new ImportFailure("none_match");

    let position = Math.max(-1, ...(existing ?? []).map((r) => r.position as number)) + 1;
    await patchImport(job.id, { source_id: sourceId, step: "photos", read_count: 0, total_count: fresh.length });

    let imported = 0;
    for (let i = 0; i < fresh.length; i += CHUNK) {
      const chunk = fresh.slice(i, i + CHUNK);
      const photos = await Promise.all(chunk.map(async (d) => (await Promise.all(d.photoUrls.map((u) => copyPhoto(userId, productId, u)))).filter((p): p is ReviewPhoto => !!p)));
      const rows = chunk
        .map((d, n) => ({ d, photos: photos[n]! }))
        // “Solo con fotos”: si ninguna foto se pudo copiar, la reseña no entra.
        .filter(({ photos: p }) => !filters.photosOnly || p.length > 0)
        .map(({ d, photos: p }) => {
          const text = (filters.translate ? (d.bodyTranslated ?? d.bodyOriginal) : (d.bodyOriginal ?? d.bodyTranslated)) ?? "";
          return {
            product_id: productId,
            user_id: userId,
            source_id: sourceId,
            source: "aliexpress",
            external_id: d.externalId,
            author: d.author,
            country: d.country,
            rating: d.rating,
            body_original: d.bodyOriginal,
            body_translated: d.bodyTranslated,
            use_translation: filters.translate,
            variant: d.variant,
            reviewed_at: d.reviewedAt,
            helpful_count: d.helpfulCount,
            photos: p,
            flags: reviewFlags(text),
            position: position++,
          };
        });
      if (rows.length) {
        const { data, error } = await db
          .from("product_reviews")
          .upsert(rows, { onConflict: "product_id,source,external_id", ignoreDuplicates: true })
          .select("id");
        fail("Guardar las reseñas", error);
        imported += data?.length ?? 0;
      }
      await patchImport(job.id, { read_count: Math.min(i + CHUNK, fresh.length), imported_count: imported });
    }

    if (!imported && !skipped) throw new ImportFailure("none_match");
    await patchImport(job.id, { status: "succeeded", step: null, imported_count: imported, skipped_count: skipped, finished_at: new Date().toISOString() });
  } catch (e) {
    const code: ImportErrorCode = e instanceof ImportFailure ? e.code : "failed";
    if (!(e instanceof ImportFailure)) console.error("[reviews/import]", importId, e);
    await patchImport(job.id, { status: "failed", step: null, error_code: code, error_message: importErrorMessage(code), finished_at: new Date().toISOString() }).catch((err) =>
      console.error("[reviews/import] no se pudo cerrar", importId, err),
    );
  }
}

// ---------------------------------------------------------------- Decisiones

export type ReviewDecision = "approve" | "reject" | "reopen";
const DECISION_STATUS: Record<ReviewDecision, DbContentStatus> = { approve: "approved", reject: "rejected", reopen: "in_review" };

/** Aprueba, rechaza o devuelve a “Por revisar” una o varias reseñas. Las publicadas no cambian aquí. */
export async function decideReviews(userId: string, productId: string, ids: string[], decision: ReviewDecision): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await adminClient()
    .from("product_reviews")
    .update({ status: DECISION_STATUS[decision], decided_at: decision === "reopen" ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("product_id", productId)
    .in("id", ids)
    .neq("status", "published")
    .select("id");
  fail("Guardar la decisión", error);
  return data?.length ?? 0;
}

/**
 * “Guardar y aprobar”: solo el texto, nunca la calificación, el autor ni la fecha. El original queda
 * guardado; volver al texto importado quita la marca “Editada por ti”.
 */
export async function editReview(userId: string, productId: string, reviewId: string, text: string): Promise<CustomerReview> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new ProductApiError("Escribe el texto de la reseña.", 400, "text");
  if (clean.length > REVIEW_BODY_MAX) throw new ProductApiError(`Hasta ${REVIEW_BODY_MAX} caracteres.`, 400, "text");
  const db = adminClient();
  const { data: current, error: readError } = await db
    .from("product_reviews")
    .select(REVIEW_COLUMNS)
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("id", reviewId)
    .maybeSingle();
  fail("Leer la reseña", readError);
  if (!current) throw new ProductApiError("Esa reseña ya no existe.", 404);
  const row = current as ReviewRow;
  if (row.status === "published") throw new ProductApiError("Esta reseña ya está publicada en tu tienda.", 409);
  const edited = clean === importedText(row) ? null : clean;
  const { data, error } = await db
    .from("product_reviews")
    .update({
      body_edited: edited,
      edited_at: edited ? new Date().toISOString() : null,
      flags: reviewFlags(clean),
      status: "approved",
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .select(REVIEW_COLUMNS)
    .single();
  fail("Guardar la reseña", error);
  const saved = data as ReviewRow;
  return toCustomerReview(saved, await signPhotos([saved]));
}
