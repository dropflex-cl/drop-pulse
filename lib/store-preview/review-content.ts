import type { StoreReview } from "./facts";

export interface ReviewContent {
  review_id?: string;
  body?: string;
  name?: string;
  rating?: number;
  excerpt?: string;
}

/** La misma prioridad que Liquid: texto propio, después reseña reutilizada. */
export function contentReview(item: ReviewContent, reviews: StoreReview[], index: number): StoreReview | undefined {
  const original = reviews.find(review => review.id === item.review_id);
  if (item.review_id && !original && !item.body) return undefined;
  if (!original && !item.body && !item.excerpt) return undefined;
  return {
    ...original,
    id: original?.id ?? `authored-${index}`,
    author: item.name ?? original?.author ?? "",
    body: item.body ?? original?.body ?? item.excerpt ?? "",
    rating: item.rating ?? original?.rating ?? 0,
    photos: original?.photos ?? [],
  };
}
