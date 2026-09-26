import { NextResponse } from "next/server";
import { creativesState } from "@/lib/data/products";
import { editChat, editConcept } from "@/lib/pipeline/creatives";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

/** Cambiar los textos de un concepto antes de generarlo ({ texts }) o los mensajes de un chat ({ chat }). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; conceptId: string }> }) {
  try {
    const { id, conceptId } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<Record<string, unknown>>(req);
    await (body && "chat" in body ? editChat : editConcept)(userId, id, conceptId, body);
    return NextResponse.json(await creativesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
