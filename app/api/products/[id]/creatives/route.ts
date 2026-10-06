import { expireStaleCreatives } from "@/lib/creatives/store";
import { creativesState } from "@/lib/data/products";
import { syncCreatives } from "@/lib/pipeline/creatives";
import { errorResponse, ownedProduct } from "@/lib/products/http";
import { retiredProductWriter } from "@/lib/products/retired-writer";
import { NextResponse, after } from "next/server";

export const maxDuration = 300;

/** Lectura del contenido guardado y conciliación de renders existentes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleCreatives(userId);
    after(() => syncCreatives(userId, id));
    return NextResponse.json(await creativesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Writer retirado: conserva autenticación y responde 410 sin crear una corrida. */
export const POST = retiredProductWriter("Prepara los conceptos y sus textos en el chat. La propuesta automática de anuncios se retiró; puedes renderizar y revisar los conceptos guardados.");
