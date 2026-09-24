import { NextResponse } from "next/server";
import { adsState } from "@/lib/data/ads";
import { getProduct } from "@/lib/data/products";
import { expireStaleLaunches } from "@/lib/pipeline/ads-launch";
import { errorResponse, ownedProduct } from "@/lib/products/http";

/** El estado de la etapa Anuncios (sondeo mientras se crea la campaña en Meta). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, product } = await ownedProduct(id);
    // Un lanzamiento colgado se revierte antes de leer: el sondeo lo ve volver al borrador con su motivo.
    await expireStaleLaunches(userId);
    const view = await getProduct(id);
    const from = new URL(req.url).searchParams.get("from");
    return NextResponse.json(await adsState(userId, product, view?.copyPhase === "done", from && /^[0-9a-f-]{36}$/.test(from) ? from : null));
  } catch (e) {
    return errorResponse(e, "No pudimos leer los anuncios. Intenta de nuevo.");
  }
}
