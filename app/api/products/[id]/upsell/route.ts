import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { updateUpsell } from "@/lib/products/store";

// Upsell del checkout (menú ⋯ de Productos): PUT { upsell } lo saca de Productos y de Hoy, o lo
// devuelve. No cambia nada del producto ni de Shopify.

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { upsell } = await json<{ upsell: boolean }>(req);
    if (typeof upsell !== "boolean") throw new ProductApiError("Indica si el producto es upsell.", 400, "upsell");
    await updateUpsell(userId, id, upsell);
    // El número de Hoy (en caché 30 s) cambia con esto: que lo recalcule ya.
    revalidateTag(`today:${userId}`, { expire: 0 });
    return NextResponse.json({ upsell });
  } catch (e) {
    return errorResponse(e);
  }
}
