import { strategyState } from "@/lib/data/products";
import { expireStaleStrategies } from "@/lib/pipeline/strategy";
import { errorResponse, ownedProduct } from "@/lib/products/http";
import { retiredProductWriter } from "@/lib/products/retired-writer";
import { NextResponse } from "next/server";

export const maxDuration = 300;

/** Writer retirado: conserva autenticación y responde 410 sin crear una corrida. */
export const POST = retiredProductWriter("Escribe el análisis en el chat y guarda la selección con set_product_strategy. La generación anterior se retiró.");

/** Sondeo de la pantalla: la corrida más reciente y los ángulos elegidos. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleStrategies(userId);
    return NextResponse.json(await strategyState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
