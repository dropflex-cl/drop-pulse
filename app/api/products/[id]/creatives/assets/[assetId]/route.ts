import { NextResponse } from "next/server";
import { creativesState } from "@/lib/data/products";
import { decideAsset, type AssetDecision } from "@/lib/pipeline/creatives";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

const ACTIONS: AssetDecision[] = ["approve", "reject", "reopen"];

/** Aprobar (pasa a Anuncios), descartar o volver a revisar (Deshacer) una imagen generada. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await params;
    const { userId } = await ownedProduct(id);
    const { action } = await json<{ action: AssetDecision }>(req);
    if (!action || !ACTIONS.includes(action)) throw new ProductApiError("Acción no válida.", 400);
    await decideAsset(userId, id, assetId, action);
    return NextResponse.json(await creativesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
