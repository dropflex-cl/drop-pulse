import { after, NextResponse } from "next/server";
import { getProduct } from "@/lib/data/products";
import { runLaunch, startLaunch } from "@/lib/pipeline/ads-launch";
import { errorResponse, ownedProduct, ProductApiError } from "@/lib/products/http";

// Crear en Meta puede tardar (subir y procesar videos): corre en segundo plano con el máximo de la función.
export const maxDuration = 300;

/** «Crear en pausa»: valida el borrador y lo crea en Meta en segundo plano. La pantalla sondea el avance. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const view = await getProduct(id);
    if (view?.copyPhase !== "done") throw new ProductApiError("Termina la página del producto antes de lanzar anuncios.", 409);
    const campaign = await startLaunch(userId, id);
    after(() => runLaunch(campaign.id));
    return NextResponse.json({ campaignId: campaign.id }, { status: 202 });
  } catch (e) {
    return errorResponse(e, "No pudimos crear la campaña. Intenta de nuevo.");
  }
}
