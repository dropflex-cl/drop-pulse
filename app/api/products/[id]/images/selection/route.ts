import { NextResponse } from "next/server";
import { errorResponse, ownedProduct, ProductApiError } from "@/lib/products/http";
import { readBoundedJson } from "@/lib/product-intelligence/http";
import { setProductImageSelection } from "@/lib/product-intelligence/product-image-selection";
import { PI_LIMITS } from "@/lib/product-intelligence/validation";
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ProductApiError("Abre DropFlex para guardar el cambio.", 403);
    const { id } = await params, { userId } = await ownedProduct(id);
    return NextResponse.json(await setProductImageSelection(userId, id, await readBoundedJson(request, PI_LIMITS.inputBytes)));
  } catch (e) { return errorResponse(e, "No pudimos cambiar las imágenes. Actualiza e intenta de nuevo."); }
}
