import { NextResponse } from "next/server";
import { setBaseImage, setImageExcluded } from "@/lib/products/images";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";

/**
 * Usar o no una imagen como referencia (`excluded`), o elegirla como imagen base (`base: true`).
 * Excluir no borra nada en Shopify.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  try {
    const { id, imageId } = await params;
    const { userId } = await ownedProduct(id);
    const { excluded, base } = await json<{ excluded: boolean; base: true }>(req);
    if (base === true) await setBaseImage(userId, id, imageId);
    else if (typeof excluded === "boolean") await setImageExcluded(userId, id, imageId, excluded);
    else throw new ProductApiError("Falta indicar si se usa la imagen.", 400, "excluded");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
