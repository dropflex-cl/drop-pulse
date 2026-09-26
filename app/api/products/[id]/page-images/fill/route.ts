import { NextResponse, after } from "next/server";
import { pageImagesState } from "@/lib/data/products";
import { processImages, startFillEmpty, type FillScope } from "@/lib/pipeline/page-images";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// «Generar los vacíos» (las tomas que van solas y quedaron sin imagen viva) y «Generar los beneficios»
// (`{ scope: "benefits" }`). El envío, la espera y el QA siguen después de responder.
export const maxDuration = 300;

const SCOPES: FillScope[] = ["required", "benefits"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const body = (await req.json().catch(() => ({}))) as { scope?: unknown };
    const scope = SCOPES.find((s) => s === body.scope) ?? "required";
    const created = await startFillEmpty(userId, id, scope);
    if (created.length) after(() => processImages(created.map((c) => c.id)));
    return NextResponse.json(await pageImagesState(userId, id), { status: created.length ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a generar las imágenes. Intenta de nuevo en un momento.");
  }
}
