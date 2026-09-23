import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import type { DbContentStatus } from "@/lib/products/store";

// Filas de product_reviews y la lectura que usa la IA. Aparte de ./store para que el pipeline
// (lib/pipeline/optimize.ts) las lea sin depender de las rutas de la API.

/** Reseñas que ve la IA al escribir la ficha. */
const PROMPT_MAX = 30;

export interface ReviewPhoto {
  path: string;
  source_url: string;
}

export interface ReviewRow {
  id: string;
  product_id: string;
  external_id: string;
  author: string;
  country: string | null;
  rating: number;
  body_original: string | null;
  body_translated: string | null;
  use_translation: boolean;
  body_edited: string | null;
  variant: string | null;
  reviewed_at: string | null;
  photos: ReviewPhoto[];
  flags: string[];
  status: DbContentStatus;
  position: number;
  edited_at: string | null;
  created_at: string;
}

export const REVIEW_COLUMNS =
  "id, product_id, external_id, author, country, rating, body_original, body_translated, use_translation, body_edited, variant, reviewed_at, photos, flags, status, position, edited_at, created_at";

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** El texto del cliente en el idioma en que se importó: la traducción de AliExpress o el original. */
export function importedText(r: Pick<ReviewRow, "body_original" | "body_translated" | "use_translation">): string {
  return (r.use_translation ? (r.body_translated ?? r.body_original) : (r.body_original ?? r.body_translated)) ?? "";
}

/** Lo que se muestra y se publica: tu versión si la editaste. */
export const displayText = (r: ReviewRow) => r.body_edited ?? importedText(r);

export async function listReviewRows(userId: string, productId: string): Promise<ReviewRow[]> {
  const { data, error } = await adminClient()
    .from("product_reviews")
    .select(REVIEW_COLUMNS)
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("position", { ascending: true });
  fail("Leer las reseñas", error);
  return (data ?? []) as ReviewRow[];
}

// ---------------------------------------------------------------- Para la IA

/** Reseñas reales para la ficha: primero las aprobadas, después las por revisar; nunca las rechazadas. */
export async function reviewsForPrompt(userId: string, productId: string): Promise<{ rating: number; text: string; country?: string; approved: boolean }[]> {
  const rows = await listReviewRows(userId, productId);
  const usable = rows.filter((r) => r.status !== "rejected" && displayText(r).trim().length >= 12);
  const rank = (r: ReviewRow) => (r.status === "approved" || r.status === "published" ? 0 : 1);
  return usable
    .sort((a, b) => rank(a) - rank(b) || a.position - b.position)
    .slice(0, PROMPT_MAX)
    .map((r) => ({ rating: r.rating, text: displayText(r), country: r.country ?? undefined, approved: rank(r) === 0 }));
}
