import { NextResponse } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { chooseReference } from "@/lib/pipeline/page-images";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

/** Elegir una foto de Información base para un espacio ({ slot, referenceId }). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { slot, referenceId, select } = await json<{ slot: string; referenceId: string; select?: boolean }>(req);
    if (typeof slot !== "string" || typeof referenceId !== "string") throw new ProductApiError("Falta el espacio o la foto.", 400);
    await chooseReference(userId, id, slot, referenceId, select !== false);
    return NextResponse.json(await pageImagesState(userId, id));
  } catch (e) {
    return errorResponse(e, "No pudimos elegir la foto. Intenta de nuevo.");
  }
}
