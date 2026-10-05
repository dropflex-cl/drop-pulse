import { NextResponse } from "next/server";
import { identifyProduct, saveProductData } from "@/lib/pipeline/product-data";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { productDataEditSchema } from "@/lib/products/product-data";

// La IA mira las imágenes: ~20 a 60 s con la pantalla esperando.
export const maxDuration = 300;

/** «Identificar con IA»: la IA escribe el nombre y la descripción del producto y los guarda. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    return NextResponse.json({ productData: await identifyProduct(userId, id) });
  } catch (e) {
    return errorResponse(e, "No pudimos identificar el producto. Intenta de nuevo en un momento.");
  }
}

/** El comerciante edita el nombre o la descripción (autoguardado). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const parsed = productDataEditSchema.safeParse(await json<{ name: string; description: string }>(req));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ProductApiError(issue?.message ?? "Revisa los datos del producto.", 400, String(issue?.path[0] ?? ""));
    }
    const productData = await saveProductData(userId, id, { ...parsed.data, source: "merchant", updated_at: new Date().toISOString() });
    return NextResponse.json({ productData });
  } catch (e) {
    return errorResponse(e);
  }
}
