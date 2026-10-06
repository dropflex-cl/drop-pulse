import { pageImagesState } from "@/lib/data/products";
import { expireStalePageImages } from "@/lib/page-images/store";
import { syncPageImages } from "@/lib/pipeline/page-images";
import { errorResponse, ownedProduct } from "@/lib/products/http";
import { retiredProductWriter } from "@/lib/products/retired-writer";
import { NextResponse, after } from "next/server";

export const maxDuration = 300;

/** Lectura del contenido guardado y conciliación de renders existentes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStalePageImages(userId);
    after(() => syncPageImages(userId, id));
    return NextResponse.json(await pageImagesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Writer retirado: conserva autenticación y responde 410 sin crear una corrida. */
export const POST = retiredProductWriter("Prepara el plan de imágenes en el chat. El director automático se retiró; puedes generar las tomas guardadas o subir imágenes.");
