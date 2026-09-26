import { NextResponse } from "next/server";
import { adsContext, parseDraft, saveDraft, type DraftInput } from "@/lib/ads/store";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

/** «Guardar borrador» (y el guardado en segundo plano del configurador): la configuración de ESTA campaña. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, product } = await ownedProduct(id);
    const body = await json<DraftInput & { sync_angles?: unknown }>(req);
    const input = parseDraft(body);
    const from = new URL(req.url).searchParams.get("from");
    const row = await saveDraft(userId, product, input, await adsContext(userId, product), from && /^[0-9a-f-]{36}$/.test(from) ? from : null, body.sync_angles === true);
    return NextResponse.json({ id: row.id, updatedAt: row.updated_at });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el borrador. Intenta de nuevo.");
  }
}
