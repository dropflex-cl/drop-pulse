import { NextResponse } from "next/server";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { decideReviews, type ReviewDecision } from "@/lib/reviews/store";

const ACTIONS: ReviewDecision[] = ["approve", "reject", "reopen"];
const MAX_IDS = 200;

/** Decisión en lote: “Aprobar 9” y su “Deshacer” (reopen con los mismos ids). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { ids, action } = await json<{ ids: string[]; action: ReviewDecision }>(req);
    if (!action || !ACTIONS.includes(action)) throw new ProductApiError("Acción no válida.", 400);
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS || !ids.every((i) => typeof i === "string")) {
      throw new ProductApiError("Elige las reseñas.", 400);
    }
    return NextResponse.json({ count: await decideReviews(userId, id, ids, action) });
  } catch (e) {
    return errorResponse(e);
  }
}
