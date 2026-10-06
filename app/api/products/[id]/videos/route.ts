import { NextResponse, after } from "next/server";
import { videosState } from "@/lib/data/products";
import { syncVideos } from "@/lib/pipeline/video";
import { ProductApiError, errorResponse, ownedProduct } from "@/lib/products/http";
import { expireStaleVideos } from "@/lib/video/store";

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
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await ownedProduct(id);
    throw new ProductApiError("Propón el guion y las tomas en el chat y guárdalos por MCP. Después revísalos en Creativos > Videos.", 410);
  } catch (e) { return errorResponse(e); }
}
