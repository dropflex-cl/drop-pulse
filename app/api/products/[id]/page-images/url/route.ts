import { NextResponse } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { importPageGif } from "@/lib/pipeline/page-images";
import { GIFS } from "@/lib/page-images/catalog";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

/** «Desde un enlace» en el espacio GIFs ({ slot, url }): el servidor descarga el GIF y lo agrega. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { slot, url } = await json<{ slot: string; url: string }>(req);
    if (slot !== GIFS) throw new ProductApiError("Desde un enlace solo se agregan GIF.", 400, "slot");
    if (typeof url !== "string" || !url.trim()) throw new ProductApiError("Pega el enlace del GIF.", 400, "url");
    await importPageGif(userId, id, url);
    return NextResponse.json(await pageImagesState(userId, id), { status: 201 });
  } catch (e) {
    return errorResponse(e, "No pudimos traer el GIF. Intenta de nuevo o súbelo desde tu equipo.");
  }
}
