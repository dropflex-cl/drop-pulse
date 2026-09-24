import { NextResponse } from "next/server";
import { deleteMedia } from "@/lib/ads/store";
import { errorResponse, ownedProduct } from "@/lib/products/http";

/** Quitar un creativo (y su archivo) que ninguna campaña lanzada usa. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  try {
    const { id, mediaId } = await params;
    const { userId } = await ownedProduct(id);
    await deleteMedia(userId, id, mediaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "No pudimos quitar el creativo. Intenta de nuevo.");
  }
}
