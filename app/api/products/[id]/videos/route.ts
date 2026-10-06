import { videosState } from "@/lib/data/products";
import { syncVideos } from "@/lib/pipeline/video";
import { errorResponse, ownedProduct } from "@/lib/products/http";
import { retiredProductWriter } from "@/lib/products/retired-writer";
import { expireStaleVideos } from "@/lib/video/store";
import { NextResponse, after } from "next/server";

// Videos desde el chat; esta ruta revisa y recupera renders existentes.
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

/** El contenido se escribe desde el chat y se guarda con save_ugc_content. */
export const POST = retiredProductWriter("Escribe el guion y las tomas en el chat y guárdalos con save_ugc_content. Después revísalos aquí.");
