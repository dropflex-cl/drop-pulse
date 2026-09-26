import { NextResponse } from "next/server";
import { creativesState } from "@/lib/data/products";
import { createChat } from "@/lib/pipeline/creatives";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

// «Crear chat de WhatsApp» para un ángulo ({ angle, acknowledged }): Claude escribe la conversación
// en la misma solicitud (una llamada chica, sin imágenes) y queda como un concepto más.
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await createChat(userId, id, await json(req));
    return NextResponse.json(await creativesState(userId, id), { status: 201 });
  } catch (e) {
    return errorResponse(e, "No pudimos escribir el chat. Intenta de nuevo en un momento.");
  }
}
