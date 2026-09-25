import { NextResponse, after } from "next/server";
import { competitorViews, deleteCompetitor, getCompetitor, MAX_COMPETITORS, requeueCompetitor } from "@/lib/competitors/store";
import { runCompetitor } from "@/lib/pipeline/competitors";
import { errorResponse, ownedProduct, ProductApiError } from "@/lib/products/http";

// Una tienda de la competencia: «Quitar» (DELETE) y «Reintentar» (POST). Ambas devuelven la lista.
export const maxDuration = 120;

type Params = { params: Promise<{ id: string; competitorId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id, competitorId } = await params;
    const { userId } = await ownedProduct(id);
    await deleteCompetitor(userId, id, competitorId);
    return NextResponse.json({ competitors: await competitorViews(userId, id), max: MAX_COMPETITORS });
  } catch (e) {
    return errorResponse(e, "No pudimos quitar la tienda. Intenta de nuevo.");
  }
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id, competitorId } = await params;
    const { userId } = await ownedProduct(id);
    const row = await requeueCompetitor(userId, id, competitorId);
    if (row) after(() => runCompetitor(row.id));
    else if (!(await getCompetitor(userId, id, competitorId))) throw new ProductApiError("No encontramos esa tienda. Recarga la página.", 404);
    // Si sigue en curso, no se reencola: la lista muestra su avance.
    return NextResponse.json({ competitors: await competitorViews(userId, id), max: MAX_COMPETITORS }, { status: row ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos reintentar. Intenta de nuevo en un momento.");
  }
}
