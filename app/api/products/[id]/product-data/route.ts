import { saveProductData } from "@/lib/pipeline/product-data";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { productDataEditSchema } from "@/lib/products/product-data";
import { retiredProductWriter } from "@/lib/products/retired-writer";
import { z } from "zod";
import { NextResponse } from "next/server";

export const maxDuration = 300;

/** Writer retirado: conserva autenticación y responde 410 sin crear una corrida. */
export const POST = retiredProductWriter("Completa los datos del producto aquí o guárdalos desde el chat con save_product_context.");

/** El comerciante edita el nombre o la descripción (autoguardado). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const parsed = productDataEditSchema.extend({ expected_context_revision: z.number().int().nonnegative() }).strict().safeParse(await json<{ name: string; description: string }>(req));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ProductApiError(issue?.message ?? "Revisa los datos del producto.", 400, String(issue?.path[0] ?? ""));
    }
    const productData = await saveProductData(userId, id, { name: parsed.data.name, description: parsed.data.description, source: "merchant", updated_at: new Date().toISOString() }, parsed.data.expected_context_revision);
    return NextResponse.json({ productData });
  } catch (e) {
    return errorResponse(e);
  }
}
