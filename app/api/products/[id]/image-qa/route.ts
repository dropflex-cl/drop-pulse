import { NextResponse } from "next/server";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { updateImageQa } from "@/lib/products/store";

// Información base › «Revisar cada imagen con IA»: PUT { enabled } enciende o apaga el QA con Claude de
// las imágenes que se generen desde ahora (página, creativos e imágenes clave de video).

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { enabled } = await json<{ enabled: boolean }>(req);
    if (typeof enabled !== "boolean") throw new ProductApiError("Indica si se revisan las imágenes.", 400, "enabled");
    await updateImageQa(userId, id, enabled);
    return NextResponse.json({ enabled });
  } catch (e) {
    return errorResponse(e);
  }
}
