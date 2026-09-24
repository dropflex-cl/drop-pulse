import { NextResponse } from "next/server";
import { ownedCampaign } from "@/lib/ads/campaign-api";
import { undoChange } from "@/lib/pipeline/ads-engine";
import { errorResponse } from "@/lib/products/http";

/** Deshacer un cambio del motor o del comerciante: vuelve al presupuesto o estado anterior. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; changeId: string }> }) {
  try {
    const { id, changeId } = await params;
    const { userId } = await ownedCampaign(id);
    const change = await undoChange(userId, id, changeId);
    return NextResponse.json({ changeId: change.id });
  } catch (e) {
    return errorResponse(e, "No pudimos deshacer el cambio. Intenta de nuevo.");
  }
}
