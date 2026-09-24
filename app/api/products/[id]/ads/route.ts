import { NextResponse } from "next/server";
import { adsState } from "@/lib/data/ads";
import { getProduct } from "@/lib/data/products";
import { errorResponse, ownedProduct } from "@/lib/products/http";

/** El estado de la etapa Anuncios (sondeo mientras se crea la campaña en Meta). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, product } = await ownedProduct(id);
    const view = await getProduct(id);
    const from = new URL(req.url).searchParams.get("from");
    return NextResponse.json(await adsState(userId, product, view?.copyPhase === "done", from && /^[0-9a-f-]{36}$/.test(from) ? from : null));
  } catch (e) {
    return errorResponse(e, "No pudimos leer los anuncios. Intenta de nuevo.");
  }
}
