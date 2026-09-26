import { NextResponse, after } from "next/server";
import { videosState } from "@/lib/data/products";
import { decideKeyframe, processShot, recoverShot, regenerateShot, syncVideos, type KeyframeDecision } from "@/lib/pipeline/video";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

export const maxDuration = 300;

type Action = KeyframeDecision | "regenerate" | "recover";
const ACTIONS: Action[] = ["approve", "reject", "reopen", "regenerate", "recover"];

/** Aprobar, descartar o volver a revisar una imagen clave; generar de nuevo o recuperar una toma. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
  try {
    const { id, shotId } = await params;
    const { userId } = await ownedProduct(id);
    const { action } = await json<{ action: Action }>(req);
    if (!action || !ACTIONS.includes(action)) throw new ProductApiError("Acción no válida.", 400);
    if (action === "regenerate") {
      const next = await regenerateShot(userId, id, shotId);
      after(() => processShot(next, true));
    } else if (action === "recover") {
      await recoverShot(userId, id, shotId);
      after(() => syncVideos(userId, id));
    } else {
      await decideKeyframe(userId, id, shotId, action);
    }
    return NextResponse.json(await videosState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
