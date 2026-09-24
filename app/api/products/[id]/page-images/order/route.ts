import { NextResponse } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { reorderSlot } from "@/lib/pipeline/page-images";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

/** El orden de la galería o de los GIF ({ ids, slot? }: las elegidas, de la primera a la última). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { ids, slot } = await json<{ ids: string[]; slot?: string }>(req);
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) throw new ProductApiError("Falta el orden.", 400);
    if (slot !== undefined && typeof slot !== "string") throw new ProductApiError("Ese espacio no existe.", 400, "slot");
    await reorderSlot(userId, id, ids, slot);
    return NextResponse.json(await pageImagesState(userId, id));
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el orden. Intenta de nuevo.");
  }
}
