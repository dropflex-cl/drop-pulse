import { NextResponse, after } from "next/server";
import { competitorViews, MAX_COMPETITORS } from "@/lib/competitors/store";
import { runCompetitor, startCompetitor } from "@/lib/pipeline/competitors";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

// Tiendas de la competencia (Información base). El análisis sigue después de responder (after):
// leer la página (≤ 10 s) y una llamada chica a Claude.
export const maxDuration = 120;

/** Sondeo de la pantalla: la lista con su estado. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    return NextResponse.json({ competitors: await competitorViews(userId, id), max: MAX_COMPETITORS });
  } catch (e) {
    return errorResponse(e);
  }
}

/** «Agregar»: { url } → en cola y análisis en segundo plano. Devuelve la lista. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { url } = await json<{ url: string }>(req);
    const row = await startCompetitor(userId, id, typeof url === "string" ? url : "");
    after(() => runCompetitor(row.id));
    return NextResponse.json({ competitors: await competitorViews(userId, id), max: MAX_COMPETITORS }, { status: 202 });
  } catch (e) {
    return errorResponse(e, "No pudimos agregar la tienda. Intenta de nuevo en un momento.");
  }
}
