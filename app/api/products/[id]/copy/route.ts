import { expireStaleCopy } from "@/lib/copy/store";
import { copyState } from "@/lib/data/products";
import { errorResponse, ownedProduct } from "@/lib/products/http";
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
