import { contentVariants, landingSelections, selectVariant, type LandingSelection } from "./variants";

type Component = { id: string; content: unknown };
type Review = { rating: number };
export interface PdpRating { rating: number | null; count: number }
export const PDP_RATING_MIN = 4.4;
export const PDP_RATING_MAX = 4.9;

/** Normaliza agregados anteriores; no modifica las notas individuales de las reseñas. */
export function normalizePdpRating(rating: number | null): number | null {
  return rating === null ? null : Math.round(Math.min(PDP_RATING_MAX, Math.max(PDP_RATING_MIN, rating)) * 10) / 10;
}

/** Una fuente por producto/dirección. Los campos antiguos de Hero son respaldo compatible. */
export function pdpRating(components: Component[], reviews: Review[], selection: LandingSelection = {}): PdpRating {
  const fields = (id: string) => {
    const content = selectVariant(components.find(c => c.id === id)?.content, selection).content;
    return content && typeof content === "object" && !("state" in content && content.state === "empty")
      ? content as { rating?: number; count?: number } : {};
  };
  const stars = fields("review-stars"), legacy = fields("stats-with-image");
  const rating = stars.rating ?? legacy.rating ?? (reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : null);
  return { rating: normalizePdpRating(rating), count: stars.count ?? legacy.count ?? reviews.length };
}

/** Se publica incluso sin importaciones. Las reseñas originales no se modifican. */
export function pdpRatingSummary(components: Component[], reviews: Review[]) {
  const sources = components.filter(c => ["review-stars", "stats-with-image"].includes(c.id));
  const rating = pdpRating(sources, reviews);
  const imported = pdpRating([], reviews);
  const own = sources.some(c => contentVariants(c.content).some(v => v.content && typeof v.content === "object" && ("rating" in v.content || "count" in v.content)));
  return { ...rating,
    ...(reviews.length && rating.rating === imported.rating && rating.count === imported.count ? {
      five: reviews.filter(r => r.rating >= 5).length, positive: reviews.filter(r => r.rating >= 4).length,
    } : {}),
    ...(own ? { variants: landingSelections([...sources].reverse().map(c => c.content)).map(v => ({
      key: v.key, angle_id: v.angle_id, hook_id: v.hook_id, ...pdpRating(sources, reviews, v),
    })) } : {}),
  };
}
