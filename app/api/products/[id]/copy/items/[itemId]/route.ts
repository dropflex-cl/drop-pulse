import { NextResponse } from "next/server";
import { copyState } from "@/lib/data/products";
import { decideItem, type CopyDecision } from "@/lib/pipeline/copy";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";

// Un bloque de la página (la IA propone, tú decides):
// PATCH { action: "approve", text? } → aceptar (con tu versión si traes text: «Guardar y aceptar»)
// PATCH { action: "reject" }         → descartar
// PATCH { action: "reopen" }         → volver a revisión (el «Deshacer»)

type Params = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id, itemId } = await params;
    const { userId } = await ownedProduct(id);
    const { action, text } = await json<{ action: CopyDecision; text?: unknown }>(req);
    if (!action || !["approve", "reject", "reopen"].includes(action)) throw new ProductApiError("Acción desconocida.", 400, "action");
    if (text !== undefined && typeof text !== "string") throw new ProductApiError("El texto no es válido.", 400, "text");
    await decideItem(userId, id, itemId, action, action === "approve" ? text : undefined);
    return NextResponse.json(await copyState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
