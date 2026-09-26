import { NextResponse } from "next/server";
import { videosState } from "@/lib/data/products";
import { confirmFinal, decideFinal, prepareFinalUpload, type FinalDecision } from "@/lib/pipeline/video";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

// El video montado en local (docs/spec-video-ugc.md §5.3): URL firmada para subirlo directo a
// Storage, confirmación y decisión (aprobar lo manda a Anuncios).

/** Pide la URL de subida. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; scriptId: string }> }) {
  try {
    const { id, scriptId } = await params;
    const { userId } = await ownedProduct(id);
    const file = await json<{ type: string; size: number }>(req);
    return NextResponse.json(await prepareFinalUpload(userId, id, scriptId, file));
  } catch (e) {
    return errorResponse(e, "No pudimos preparar la subida. Intenta de nuevo.");
  }
}

/** Confirma lo subido (MP4, 9:16, 10–60 s). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string; scriptId: string }> }) {
  try {
    const { id, scriptId } = await params;
    const { userId } = await ownedProduct(id);
    await confirmFinal(userId, id, scriptId, await json<{ path: string; width: number; height: number; durationS: number | null }>(req));
    return NextResponse.json(await videosState(userId, id));
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el video. Intenta de nuevo.");
  }
}

const ACTIONS: FinalDecision[] = ["approve", "reject", "reopen"];

/** Aprobar (pasa a Anuncios), descartar o volver a revisar el video final. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; scriptId: string }> }) {
  try {
    const { id, scriptId } = await params;
    const { userId } = await ownedProduct(id);
    const { action } = await json<{ action: FinalDecision }>(req);
    if (!action || !ACTIONS.includes(action)) throw new ProductApiError("Acción no válida.", 400);
    await decideFinal(userId, id, scriptId, action);
    return NextResponse.json(await videosState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
