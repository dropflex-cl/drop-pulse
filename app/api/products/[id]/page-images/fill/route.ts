import { NextResponse, after } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { processImages, startFillEmpty } from "@/lib/pipeline/page-images";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// «Generar los vacíos»: una imagen para cada toma sin ninguna viva. El envío, la espera y el QA siguen
// después de responder.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const created = await startFillEmpty(userId, id);
    if (created.length) after(() => processImages(created.map((c) => c.id)));
    return NextResponse.json(await pageImagesState(userId, id), { status: created.length ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a generar las imágenes. Intenta de nuevo en un momento.");
  }
}
