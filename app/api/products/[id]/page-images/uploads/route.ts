import { NextResponse } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { confirmPageUpload } from "@/lib/pipeline/page-images";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

/** Subir una imagen a un espacio, paso 2: el navegador ya la subió; se revisa y se agrega ({ slot, path }). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { slot, path } = await json<{ slot: string; path: string }>(req);
    if (typeof slot !== "string" || typeof path !== "string" || !path) throw new ProductApiError("Falta el archivo subido.", 400, "path");
    await confirmPageUpload(userId, id, slot, path);
    return NextResponse.json(await pageImagesState(userId, id), { status: 201 });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar la imagen. Intenta de nuevo.");
  }
}
