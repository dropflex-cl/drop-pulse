import { NextResponse } from "next/server";
import { confirmMedia } from "@/lib/ads/store";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";

/**
 * Subir un creativo, paso 2: el navegador ya subió el archivo con la URL firmada. Aquí se revisa el
 * tipo real por los primeros bytes y la proporción (el navegador manda el ancho, el alto y la duración).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const b = await json<{ path: string; name: string; width: number; height: number; durationS: number | null }>(req);
    if (typeof b.path !== "string" || !b.path) throw new ProductApiError("Falta el archivo subido.", 400, "path");
    const media = await confirmMedia(userId, id, { path: b.path, name: typeof b.name === "string" ? b.name : "Creativo", width: Number(b.width), height: Number(b.height), durationS: b.durationS == null ? null : Number(b.durationS) });
    return NextResponse.json({ media }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el creativo. Intenta de nuevo.");
  }
}
