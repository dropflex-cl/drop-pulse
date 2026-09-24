import { NextResponse } from "next/server";
import { ownedCampaign } from "@/lib/ads/campaign-api";
import { decide } from "@/lib/pipeline/ads-engine";
import { errorResponse, json, ProductApiError } from "@/lib/products/http";

/** Una decisión pendiente: `apply` (Pausar conjunto · Subir a $X) o `ignore` (Mantener · Ignorar). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; decisionId: string }> }) {
  try {
    const { id, decisionId } = await params;
    const { userId } = await ownedCampaign(id);
    const { action } = await json<{ action: string }>(req);
    if (action !== "apply" && action !== "ignore") throw new ProductApiError("Acción no válida.", 400);
    const { decision, change } = await decide(userId, id, decisionId, action);
    return NextResponse.json({ decision: { id: decision.id, disposition: decision.disposition }, changeId: change?.id ?? null });
  } catch (e) {
    return errorResponse(e, "No pudimos aplicar la decisión. Intenta de nuevo.");
  }
}
