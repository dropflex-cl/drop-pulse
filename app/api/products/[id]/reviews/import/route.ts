import { NextResponse, after } from "next/server";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";
import { DEFAULT_FILTERS, type ImportFilters } from "@/lib/reviews/aliexpress";
import { expireStaleImports, latestImport, runImport, startImport, toReviewImport } from "@/lib/reviews/store";

// La importación sigue después de responder (after): hasta 10 páginas y las fotos, ~1 minuto.
export const maxDuration = 300;

const MIN_RATINGS: ImportFilters["minRating"][] = [1, 4, 5];

/** “Importar reseñas”: crea la importación y la corre en segundo plano. Devuelve su estado. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<{ url: string; minRating: number; photosOnly: boolean; translate: boolean }>(req);
    const minRating = MIN_RATINGS.find((r) => r === Number(body.minRating)) ?? DEFAULT_FILTERS.minRating;
    const filters: ImportFilters = {
      minRating,
      photosOnly: typeof body.photosOnly === "boolean" ? body.photosOnly : DEFAULT_FILTERS.photosOnly,
      translate: typeof body.translate === "boolean" ? body.translate : DEFAULT_FILTERS.translate,
    };
    const { job, created } = await startImport(userId, id, typeof body.url === "string" ? body.url : "", filters);
    if (created) after(() => runImport(job.id));
    return NextResponse.json({ job: toReviewImport(job) }, { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a importar. Intenta de nuevo en un momento.");
  }
}

/** Sondeo de la pantalla: la última importación y su avance. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleImports(userId);
    const job = await latestImport(userId, id);
    return NextResponse.json({ job: job ? toReviewImport(job) : null });
  } catch (e) {
    return errorResponse(e);
  }
}
