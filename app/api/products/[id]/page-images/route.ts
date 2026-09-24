import { NextResponse, after } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { expireStalePageImages } from "@/lib/page-images/store";
import { runPageImages, startPageImages, syncPageImages } from "@/lib/pipeline/page-images";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// Etapa Imágenes (docs/spec-imagenes.md): el director de galería y la generación de todas sus tomas
// siguen después de responder (after): ~60–90 s de Claude y ~20–30 s por imagen, de a 4.
export const maxDuration = 300;

/** Sondeo de la pantalla: espacios y opciones. De paso, termina las imágenes que quedaron esperando. */
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

/** «Generar la galería» y «Proponer otra»: crea la corrida del director y la ejecuta en segundo plano. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { run, created } = await startPageImages(userId, id);
    if (created) after(() => runPageImages(run.id));
    return NextResponse.json(await pageImagesState(userId, id), { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a preparar las imágenes. Intenta de nuevo en un momento.");
  }
}
