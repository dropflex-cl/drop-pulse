import { NextResponse } from "next/server";
import { listMediaRows, toAdMedia } from "@/lib/ads/store";
import { errorResponse, ownedProduct, ProductApiError } from "@/lib/products/http";
import { createCarouselExecutor } from "@/lib/product-intelligence/carousel-service";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { parseToolInput, parseToolOutput } from "@/lib/product-intelligence/validation";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, { userId } = await ownedProduct(id);
    const body = await req.json();
    const input = parseToolInput("save_ad_carousel", { ...body, product_id: id, schema_version: "1.0", dry_run: false });
    const execute = createCarouselExecutor(createContextRepository());
    const result = parseToolOutput("save_ad_carousel", await execute({ userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES }, { tool: "save_ad_carousel", input }, AbortSignal.timeout(30000)));
    if (!result.ok) throw new ProductApiError(result.error.message, 422);
    const rows = await listMediaRows(userId, id);
    return NextResponse.json({ media: (await toAdMedia(rows)).find(m => m.id === result.data.carousel_id) });
  } catch (e) { return errorResponse(e, "No pudimos guardar el carrusel. Revisa sus tarjetas e intenta de nuevo."); }
}
