import { NextResponse, after } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { decideOption, syncPageImages, type OptionAction } from "@/lib/pipeline/page-images";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

const ACTIONS: OptionAction[] = ["choose", "unchoose", "discard", "reopen", "recover"];

// Recuperar descarga la imagen y corre el QA después de responder (after).
export const maxDuration = 300;

/**
 * Elegir una opción para su espacio, quitarla, descartarla (se borra pasado el plazo de Deshacer),
 * deshacer el descarte o recuperar una que falló después de llegar a Higgsfield (sin volver a cobrar).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; optionId: string }> }) {
  try {
    const { id, optionId } = await params;
    const { userId } = await ownedProduct(id);
    const { action } = await json<{ action: OptionAction }>(req);
    if (!action || !ACTIONS.includes(action)) throw new ProductApiError("Acción no válida.", 400);
    await decideOption(userId, id, optionId, action);
    if (action === "recover") after(() => syncPageImages(userId, id));
    return NextResponse.json(await pageImagesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
