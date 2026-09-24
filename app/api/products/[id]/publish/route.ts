import { NextResponse } from "next/server";
import { publishState } from "@/lib/data/publish";
import { expireStalePublications, startPublish } from "@/lib/pipeline/publish";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// Etapa Publicar: lleva lo aprobado del producto a Shopify. Sigue después de responder (after):
// subir imágenes y escribir el producto tarda hasta un par de minutos.
export const maxDuration = 300;

/** Sondeo de la pantalla: conexión, tema, lo que falta, lo que se publica y la última publicación. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStalePublications(userId);
    return NextResponse.json(await publishState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** «Publicar en mi tienda» y «Publicar cambios»: empieza en segundo plano. Idempotente. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await startPublish(userId, id);
    return NextResponse.json(await publishState(userId, id), { status: 202 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a publicar. Intenta de nuevo en un momento.");
  }
}
