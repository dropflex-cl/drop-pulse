import { NextResponse } from "next/server";
import { creativesState } from "@/lib/data/products";
import { editConcept } from "@/lib/pipeline/creatives";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

/** Cambiar los textos de un concepto antes de generarlo ({ texts }). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; conceptId: string }> }) {
  try {
    const { id, conceptId } = await params;
    const { userId } = await ownedProduct(id);
    await editConcept(userId, id, conceptId, await json(req));
    return NextResponse.json(await creativesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
