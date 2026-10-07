import { expireStaleCreatives } from "@/lib/creatives/store";
import { creativesState } from "@/lib/data/products";
import { syncCreatives } from "@/lib/pipeline/creatives";
import { errorResponse, ownedProduct } from "@/lib/products/http";
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
