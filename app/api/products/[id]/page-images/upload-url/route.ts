import { NextResponse } from "next/server";
import { preparePageUpload } from "@/lib/pipeline/page-images";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

/** Subir una imagen (o un GIF) a un espacio, paso 1: valida tipo y peso, y entrega una URL firmada de subida. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { type, size, slot } = await json<{ type: string; size: number; slot?: string }>(req);
    return NextResponse.json(await preparePageUpload(userId, id, { type, size: Number(size) }, typeof slot === "string" ? slot : undefined));
  } catch (e) {
    return errorResponse(e, "No pudimos preparar la subida. Intenta de nuevo.");
  }
}
