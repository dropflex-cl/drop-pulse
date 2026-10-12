import { z } from "zod";
import { DESCRIPTION_LIMIT, HEADLINE_LIMIT, PRIMARY_TEXT_LIMIT } from "./schemas";

export const CAROUSEL_MIN_CARDS = 2;
export const CAROUSEL_MAX_CARDS = 10;
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const selector = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const text = z.string().trim().min(1).max(2000);
export const carouselCardSchema = z.strictObject({
  key,
  headline: z.string().trim().max(HEADLINE_LIMIT),
  description: z.string().trim().max(DESCRIPTION_LIMIT).default(""),
  link: z.string().url().max(2000).refine(v => new URL(v).protocol === "https:").nullable().default(null),
  scene: text.max(4000),
  image_texts: z.array(z.strictObject({ text, placement: text })).max(7),
  // Omitir medios o uso conserva la decisión vigente; null quita el archivo explícitamente.
  asset_id: z.string().uuid().nullable().optional(),
  media_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
}).refine(c => !(c.asset_id && c.media_id), "Elige un archivo por tarjeta.");

export const carouselContentSchema = z.strictObject({
  name: text.max(120),
  ratio: z.enum(["1:1", "4:5"]),
  primary_text: z.string().trim().max(PRIMARY_TEXT_LIMIT),
  cta: z.enum(["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "LEARN_MORE"]),
  strategy_id: z.string().uuid().nullable().default(null),
  angle_id: z.string().uuid().nullable().default(null),
  landing_angle_id: selector.nullable().default(null),
  landing_hook_id: selector.nullable().default(null),
  art: z.strictObject({ palette: text, typography: text, lighting: text, photography_style: text, consistency_notes: text }),
  enabled: z.boolean().optional(),
  cards: z.array(carouselCardSchema).min(CAROUSEL_MIN_CARDS).max(CAROUSEL_MAX_CARDS)
    .refine(cards => new Set(cards.map(c => c.key)).size === cards.length, "Cada tarjeta necesita una clave distinta."),
}).refine(c => Boolean(c.landing_angle_id) === Boolean(c.landing_hook_id), "Indica juntos el ángulo y el hook de la página.");
export type CarouselContent = z.infer<typeof carouselContentSchema>;
export type CarouselCard = z.infer<typeof carouselCardSchema>;
export interface ResolvedCarouselCard extends CarouselCard {
  storage_path: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number;
  url?: string;
  problem: string | null;
}
export interface AdCarousel {
  id: string;
  content: CarouselContent;
  etag: string;
  cards: ResolvedCarouselCard[];
  ready: boolean;
  problem: string | null;
}

/** La misma decisión de uso y orden para preview y Meta. */
export function activeCarouselCards<T extends { enabled?: boolean }>(cards: T[]): T[] {
  return cards.filter(c => c.enabled !== false);
}
export function carouselProblem(content: CarouselContent, cards: ResolvedCarouselCard[]): string | null {
  if (content.enabled === false) return "El carrusel está fuera de uso. Recupéralo para anunciarlo.";
  const selected = activeCarouselCards(cards);
  if (selected.length < CAROUSEL_MIN_CARDS) return "Elige al menos dos tarjetas para el carrusel.";
  for (const card of selected) {
    if (card.problem) return card.problem;
    if (!card.storage_path) return "Sube o asigna la imagen de cada tarjeta.";
    if (!card.headline) return "Escribe el título de cada tarjeta.";
    const [w, h] = content.ratio.split(":").map(Number);
    if (!card.width || !card.height || Math.abs(card.width / card.height - w / h) > 0.02) return `Usa imágenes ${content.ratio} en todas las tarjetas.`;
  }
  if (!content.primary_text) return "Escribe el texto principal del carrusel.";
  return null;
}
