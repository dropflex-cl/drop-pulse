import { NextResponse } from "next/server";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { saveBasicContext } from "@/lib/pipeline/product-data";
import { detectTopics } from "@/lib/products/topics";

/** Autoguardado por el mismo comando que el MCP; el texto del proveedor sigue siendo una fuente sin verificar. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { text, expected_context_revision } = await json<{ text: string; expected_context_revision: number }>(req);
    if (typeof text !== "string") throw new ProductApiError("Falta el texto.", 400, "text");
    if (new TextEncoder().encode(text).length > 8192) throw new ProductApiError("El texto es muy largo. Reduce la ficha del proveedor a los datos útiles (hasta 8 KB).", 400, "text");
    const saved = await saveBasicContext(userId, id, { supplier_text: text.trim() || null }, expected_context_revision ?? -1);
    return NextResponse.json({ ...saved, topics: detectTopics(text) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** sendBeacon mantiene el mismo control de concurrencia al cerrar la pestaña. */
export const POST = PATCH;
