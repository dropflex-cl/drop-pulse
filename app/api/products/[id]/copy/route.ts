import { expireStaleCopy } from "@/lib/copy/store";
import { copyState } from "@/lib/data/products";
import { errorResponse, ownedProduct } from "@/lib/products/http";
import { retiredProductWriter } from "@/lib/products/retired-writer";
import { NextResponse } from "next/server";

export const maxDuration = 300;

/** Lectura del contenido guardado y conciliación de renders existentes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleCopy(userId);
    return NextResponse.json(await copyState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Writer retirado: conserva autenticación y responde 410 sin crear una corrida. */
export const POST = retiredProductWriter("Escribe la página en el chat y guárdala con save_landing_content. Después revísala aquí.");
