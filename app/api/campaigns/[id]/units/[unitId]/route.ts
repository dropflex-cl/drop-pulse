import { NextResponse } from "next/server";
import { ownedCampaign } from "@/lib/ads/campaign-api";
import { applyUnitAction, type UnitAction } from "@/lib/pipeline/ads-engine";
import { errorResponse, json, ProductApiError } from "@/lib/products/http";

/** Pausar, reactivar o fijar el presupuesto a mano de la campaña, un conjunto o un anuncio. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  try {
    const { id, unitId } = await params;
    const { campaign } = await ownedCampaign(id);
    const b = await json<{ level: string; action: string; budget: number }>(req);
    const level = b.level === "campaign" || b.level === "adset" || b.level === "ad" ? b.level : null;
    if (!level) throw new ProductApiError("Nivel no válido.", 400);
    const action: UnitAction | null =
      b.action === "pause" ? { action: "pause" } : b.action === "resume" ? { action: "resume" } : b.action === "set_budget" ? { action: "set_budget", budget: Number(b.budget) } : null;
    if (!action) throw new ProductApiError("Acción no válida.", 400);
    const change = await applyUnitAction(campaign, level, unitId, action, { actor: "merchant" });
    return NextResponse.json({ changeId: change.id });
  } catch (e) {
    return errorResponse(e, "No pudimos hacer el cambio. Intenta de nuevo.");
  }
}
