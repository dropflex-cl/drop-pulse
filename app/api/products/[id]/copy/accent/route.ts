import { NextResponse } from "next/server";
import { DEFAULT_ACCENT, normalizeHex } from "@/lib/copy/accent";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { updatePageAccent } from "@/lib/products/store";

// Color de acento de la página del producto. PUT { color } → { accent }, en hex de 6 dígitos.
// Se guarda en minúsculas; lo usará la etapa Publicar.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { color } = await json<{ color: unknown }>(req);
    const hex = typeof color === "string" ? normalizeHex(color) : null;
    if (!hex) throw new ProductApiError(`Escribe un color en formato hex, por ejemplo ${DEFAULT_ACCENT}.`, 400, "color");
    await updatePageAccent(userId, id, hex);
    return NextResponse.json({ accent: hex });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el color. Intenta de nuevo.");
  }
}
