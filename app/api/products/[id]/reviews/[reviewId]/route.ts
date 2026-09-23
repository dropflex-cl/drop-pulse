import { NextResponse } from "next/server";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { decideReviews, editReview, type ReviewDecision } from "@/lib/reviews/store";

const ACTIONS: ReviewDecision[] = ["approve", "reject", "reopen"];

/** Aprobar, rechazar o devolver a “Por revisar” una reseña. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  try {
    const { id, reviewId } = await params;
    const { userId } = await ownedProduct(id);
    const { action } = await json<{ action: ReviewDecision }>(req);
    if (!action || !ACTIONS.includes(action)) throw new ProductApiError("Acción no válida.", 400);
    const count = await decideReviews(userId, id, [reviewId], action);
    if (!count) throw new ProductApiError("Esa reseña ya no existe o ya está publicada.", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** “Guardar y aprobar”: corrige el texto (traducción u ortografía) y aprueba. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  try {
    const { id, reviewId } = await params;
    const { userId } = await ownedProduct(id);
    const { text } = await json<{ text: string }>(req);
    if (typeof text !== "string") throw new ProductApiError("Escribe el texto de la reseña.", 400, "text");
    return NextResponse.json({ review: await editReview(userId, id, reviewId, text) });
  } catch (e) {
    return errorResponse(e);
  }
}
