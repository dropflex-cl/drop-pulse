import { NextResponse } from "next/server";
import { strategyState } from "@/lib/data/products";
import { confirmStrategy } from "@/lib/pipeline/strategy";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

/** «Usar estos ángulos»: guarda los 2 o 3 elegidos del TOP 5 como los ángulos que leen los pasos siguientes. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { indexes } = await json<{ indexes: number[] }>(req);
    await confirmStrategy(userId, id, indexes);
    return NextResponse.json(await strategyState(userId, id));
  } catch (e) {
    return errorResponse(e, "No pudimos guardar tu elección. Intenta de nuevo en un momento.");
  }
}
