// Lectura de reseñas de AliExpress. PURO (sin I/O): convierte el enlace que pega el comerciante y la
// respuesta cruda del marketplace en borradores. La red vive en lib/reviews/fetch.ts.
// Portado de dropflex v1 (lib/reviews/aliexpress.ts), con los filtros de ReviewImporter.
//
// La respuesta sale del endpoint que usa la propia página del producto:
//   GET https://feedback.aliexpress.com/pc/searchEvaluation.do
//       ?productId=<id>&page=1&pageSize=20&filter=all|image&lang=es_ES&country=CL
// No es un contrato: AliExpress puede agregar, quitar o renombrar campos. Por eso se lee campo por
// campo y a la defensiva: un `skuInfo` que falta cuesta una línea, nunca la importación.

export const AE_PAGE_SIZE = 20;
/** Páginas que se leen como máximo por importación (20 reseñas cada una). */
export const REVIEW_MAX_PAGES = 10;
/** Reseñas que entran como máximo por importación. */
export const REVIEW_IMPORT_MAX = 100;
/** Fotos que se guardan por reseña. */
export const REVIEW_MAX_PHOTOS = 3;
/** Texto más largo que se guarda. */
export const REVIEW_BODY_MAX = 600;

const FEEDBACK_ENDPOINT = "https://feedback.aliexpress.com/pc/searchEvaluation.do";

/**
 * Hosts de donde puede venir una foto. Los enlaces los entrega el marketplace, no una persona:
 * se fijan al CDN de AliExpress antes de descargar nada (la mitad barata de la defensa contra SSRF).
 */
const IMAGE_HOSTS = [".aliexpress-media.com", ".alicdn.com"];

const MONTHS_ES: Record<string, number> = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DIC: 12 };

export interface ReviewDraft {
  externalId: string;
  author: string;
  country: string | null;
  rating: number;
  bodyOriginal: string | null;
  bodyTranslated: string | null;
  variant: string | null;
  /** YYYY-MM-DD */
  reviewedAt: string | null;
  helpfulCount: number;
  photoUrls: string[];
}

export interface ReviewSourceStats {
  avgRating: number | null;
  totalReviews: number | null;
  photoReviews: number | null;
}

export interface ImportFilters {
  /** 1 = todas, 4 = 4★ o más, 5 = solo 5★. */
  minRating: 1 | 4 | 5;
  photosOnly: boolean;
  translate: boolean;
}

export const DEFAULT_FILTERS: ImportFilters = { minRating: 4, photosOnly: false, translate: true };

// ---------------------------------------------------------------- Enlace

/**
 * El id del artículo, desde cualquier dominio de AliExpress (con su cola de parámetros de
 * seguimiento) o el número solo. Null para el enlace corto de la app (a.aliexpress.com/_xxxx), que
 * no lo trae: `isShortLink` lo reconoce para resolver la redirección antes.
 */
export function extractItemId(raw: string): string | null {
  const value = raw.trim();
  const fromUrl = value.match(/aliexpress\.(?:[a-z]{2,}\.)?[a-z]{2,}\/item\/(\d{6,20})\.html/i);
  if (fromUrl) return fromUrl[1]!;
  return /^\d{10,20}$/.test(value) ? value : null;
}

export function isShortLink(raw: string): boolean {
  return /^https?:\/\/a\.aliexpress\.com\/_[A-Za-z0-9]+/i.test(raw.trim());
}

/** Un enlace de otra tienda (Amazon, Temu, Shopify…): el error dice que no es de AliExpress. */
export function isAliExpressInput(raw: string): boolean {
  return extractItemId(raw) != null || isShortLink(raw);
}

export function buildFeedbackUrl(params: { itemId: string; page: number; photosOnly: boolean; lang?: string; country?: string }): string {
  const url = new URL(FEEDBACK_ENDPOINT);
  url.searchParams.set("productId", params.itemId);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(AE_PAGE_SIZE));
  // El filtro propio del marketplace: “all” o “image” (con fotos).
  url.searchParams.set("filter", params.photosOnly ? "image" : "all");
  url.searchParams.set("sort", "complex_default");
  url.searchParams.set("lang", params.lang ?? "es_ES");
  url.searchParams.set("country", params.country ?? "CL");
  return url.toString();
}

// ---------------------------------------------------------------- Lectores defensivos

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function body(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed.slice(0, REVIEW_BODY_MAX) : null;
}

/** `buyerEval` va de 0 a 100; las estrellas son su quinta parte, entre 1 y 5. */
export function toStars(buyerEval: unknown): number {
  const v = num(buyerEval);
  if (v === null) return 5;
  return Math.min(5, Math.max(1, Math.round(v / 20)));
}

/** `evalDate` (“13 AGO 2026” con lang=es_ES) → fecha ISO. Null antes que adivinar. */
export function parseEvalDate(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú.]+)\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS_ES[m[2]!.replace(/\./g, "").toUpperCase()];
  if (!month || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isAllowedImageUrl(value: unknown): boolean {
  const raw = str(value);
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return IMAGE_HOSTS.some((suffix) => host.endsWith(suffix));
}

/**
 * Autor anonimizado: primera y última letra con “***” (“M***a”). AliExpress ya suele enmascararlo;
 * esto lo garantiza. Sin nombre usable: “Cliente”.
 */
export function anonymize(name: string | null): string {
  const letters = [...(name ?? "").replace(/[*\s]+/g, "")].filter((c) => /\p{L}|\p{N}/u.test(c));
  if (!letters.length || /^an[oó]nimo$/i.test(letters.join(""))) return "Cliente";
  const first = letters[0]!.toUpperCase();
  return letters.length === 1 ? `${first}***` : `${first}***${letters[letters.length - 1]!.toLowerCase()}`;
}

// ---------------------------------------------------------------- Respuesta

/** Lo que el listado dice de sí mismo: promedio de TODAS sus reseñas y cuántas traen foto. */
export function parseStats(payload: unknown): ReviewSourceStats {
  const data = obj(obj(payload)?.data);
  const stat = obj(data?.productEvaluationStatistic);
  let photoReviews: number | null = null;
  const stats = obj(data?.filterInfo)?.filterStatistic;
  if (Array.isArray(stats)) {
    for (const entry of stats) {
      const row = obj(entry);
      if (str(row?.filterCode) === "image") {
        photoReviews = num(row?.filterCount);
        break;
      }
    }
  }
  return { avgRating: num(stat?.evarageStar), totalReviews: num(stat?.totalNum), photoReviews };
}

/** Cuántas reseñas trae el filtro pedido (para el avance “112 de 204”). */
export function parseFilterCount(payload: unknown, photosOnly: boolean): number | null {
  const data = obj(obj(payload)?.data);
  const stats = obj(data?.filterInfo)?.filterStatistic;
  if (Array.isArray(stats)) {
    for (const entry of stats) {
      const row = obj(entry);
      if (str(row?.filterCode) === (photosOnly ? "image" : "all")) return num(row?.filterCount);
    }
  }
  return photosOnly ? null : num(obj(data?.productEvaluationStatistic)?.totalNum);
}

export function parseTotalPages(payload: unknown): number {
  const total = num(obj(obj(payload)?.data)?.totalPage);
  return total && total > 0 ? total : 1;
}

/** Una página de la respuesta → borradores. Sin foto permitida, la reseña queda sin fotos. */
export function parseFeedbackPage(payload: unknown): ReviewDraft[] {
  const list = obj(obj(payload)?.data)?.evaViewList;
  if (!Array.isArray(list)) return [];
  const drafts: ReviewDraft[] = [];
  for (const entry of list) {
    const row = obj(entry);
    if (!row) continue;
    const externalId = str(row.evaluationIdStr) ?? str(row.evaluationId);
    if (!externalId) continue;
    const photos = Array.isArray(row.images) ? row.images.filter(isAllowedImageUrl).map((u) => String(u).trim()) : [];
    const bodyOriginal = body(row.buyerFeedback);
    const translated = body(row.buyerTranslationFeedback);
    const country = str(row.buyerCountry)?.slice(0, 2).toUpperCase() ?? null;
    drafts.push({
      externalId,
      author: anonymize(str(row.buyerName)),
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      rating: toStars(row.buyerEval),
      bodyOriginal,
      bodyTranslated: translated && translated !== bodyOriginal ? translated : null,
      variant: str(row.skuInfo),
      reviewedAt: parseEvalDate(row.evalDate),
      helpfulCount: num(row.upVoteCount) ?? 0,
      photoUrls: photos.slice(0, REVIEW_MAX_PHOTOS),
    });
  }
  return drafts;
}

/** ¿Entra con estos filtros? Una reseña sin texto ni foto no le sirve a nadie. */
export function passesFilters(d: ReviewDraft, f: ImportFilters): boolean {
  if (d.rating < f.minRating) return false;
  if (f.photosOnly && !d.photoUrls.length) return false;
  return Boolean(d.bodyOriginal || d.bodyTranslated || d.photoUrls.length);
}
