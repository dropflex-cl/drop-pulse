import { retiredProductWriter } from "@/lib/products/retired-writer";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { reviewUsageTip } from "@/lib/product-intelligence/content-service";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { NextResponse } from "next/server";
import { z } from "zod";


export const POST = retiredProductWriter("Prepara el consejo de uso en el chat. La redacción automática se retiró.");

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, { userId } = await ownedProduct(id);
    const input = z.strictObject({ action: z.enum(["approve", "reopen"]), expected_etag: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(await json(req));
    if (!input.success) throw new ProductApiError("Actualiza la página y revisa el consejo vigente.", 400);
    await reviewUsageTip(createContextRepository(), { userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES }, id, input.data.action, input.data.expected_etag);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
