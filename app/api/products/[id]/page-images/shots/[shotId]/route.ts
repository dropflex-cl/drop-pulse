import { NextResponse, after } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { processImage, startShotRender } from "@/lib/pipeline/page-images";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// «Generar otra»: una imagen más de la misma toma del director (~20–30 s, más el QA).
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
  try {
    const { id, shotId } = await params;
    const { userId } = await ownedProduct(id);
    const image = await startShotRender(userId, id, shotId);
    after(() => processImage(image.id, true));
    return NextResponse.json(await pageImagesState(userId, id), { status: 202 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a generar la imagen. Intenta de nuevo en un momento.");
  }
}
