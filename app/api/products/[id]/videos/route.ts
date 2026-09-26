import { NextResponse, after } from "next/server";
import { videosState } from "@/lib/data/products";
import { runScript, startScript, syncVideos } from "@/lib/pipeline/video";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";
import { formatOf } from "@/lib/video/catalog";
import { expireStaleVideos } from "@/lib/video/store";

// Pestaña Videos de Creativos (docs/spec-video-ugc.md): un video UGC por ángulo. El guion sigue
// después de responder (after): una llamada a Claude con la foto base, ~40–90 s.
export const maxDuration = 300;

/** Sondeo de la pestaña. De paso, termina las tomas que quedaron esperando en Higgsfield. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleVideos(userId);
    after(() => syncVideos(userId, id));
    return NextResponse.json(await videosState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** «Escribir guion», «Otro guion» y «Reintentar» de un ángulo, en su formato (UGC o mascota). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { slot, format } = await json<{ slot: number; format?: string }>(req);
    if (slot !== 1 && slot !== 2 && slot !== 3) throw new ProductApiError("Ángulo no válido.", 400);
    if (format !== undefined && format !== "ugc" && format !== "mascot") throw new ProductApiError("Formato no válido.", 400);
    const { script, created } = await startScript(userId, id, slot, formatOf(format));
    if (created) after(() => runScript(script.id));
    return NextResponse.json(await videosState(userId, id), { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a escribir el guion. Intenta de nuevo en un momento.");
  }
}
