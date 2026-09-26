import { NextResponse, after } from "next/server";
import { RATIOS, type Ratio } from "@/lib/creatives/catalog";
import { isImageProvider, type ImageProvider } from "@/lib/image-provider";
import { creativesState } from "@/lib/data/products";
import { processAsset, startRender } from "@/lib/pipeline/creatives";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

// Generar la imagen de un concepto ({ ratio: "1:1" | "9:16", provider? }; el chat de WhatsApp, solo 9:16). Sin
// `provider`, con el elegido en la pantalla; con él, solo esa pieza («Generar con Higgsfield»). El envío, la espera
// (~20–60 s), el QA y el reintento sin preset siguen después de responder.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string; conceptId: string }> }) {
  try {
    const { id, conceptId } = await params;
    const { userId } = await ownedProduct(id);
    const { ratio, provider } = await json<{ ratio: Ratio; provider?: ImageProvider }>(req);
    if (!ratio || !RATIOS.includes(ratio)) throw new ProductApiError("Elige 1:1 o 9:16.", 400);
    if (provider != null && !isImageProvider(provider)) throw new ProductApiError("Elige Higgsfield o Gemini.", 400);
    const { asset, created } = await startRender(userId, id, conceptId, ratio, provider ?? undefined);
    if (created) after(() => processAsset(asset.id, true));
    return NextResponse.json(await creativesState(userId, id), { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a generar la imagen. Intenta de nuevo en un momento.");
  }
}
