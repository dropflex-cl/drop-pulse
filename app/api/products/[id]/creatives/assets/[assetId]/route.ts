import { NextResponse, after } from "next/server";
import { creativesState } from "@/lib/data/products";
import { decideAsset, recoverAsset, syncCreatives, type AssetDecision } from "@/lib/pipeline/creatives";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

const ACTIONS: (AssetDecision | "recover")[] = ["approve", "reject", "reopen", "recover"];

// Recuperar descarga la imagen y corre el QA después de responder (after).
export const maxDuration = 300;

/**
 * Aprobar (pasa a Anuncios), descartar o volver a revisar (Deshacer) una imagen generada; o recuperar
 * una que falló después de llegar a Higgsfield (sin volver a cobrar).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await params;
    const { userId } = await ownedProduct(id);
    const { action } = await json<{ action: AssetDecision | "recover" }>(req);
    if (!action || !ACTIONS.includes(action)) throw new ProductApiError("Acción no válida.", 400);
    if (action === "recover") {
      await recoverAsset(userId, id, assetId);
      after(() => syncCreatives(userId, id));
    } else {
      await decideAsset(userId, id, assetId, action);
    }
    return NextResponse.json(await creativesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
