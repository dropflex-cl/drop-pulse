import { NextResponse } from "next/server";
import { ownedCampaign } from "@/lib/ads/campaign-api";
import { engineProblems, engineSchema } from "@/lib/ads/schemas";
import { adminClient } from "@/lib/integrations/admin";
import { committedDaily, campaignUnits } from "@/lib/pipeline/ads-engine";
import { errorResponse, json, ProductApiError } from "@/lib/products/http";

/** Modo, CPA límite y reglas de ESTA campaña (no toca las demás ni la plantilla). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { campaign } = await ownedCampaign(id);
    const parsed = engineSchema.safeParse((await json<{ engine: unknown }>(req)).engine);
    if (!parsed.success) throw new ProductApiError("Revisa los valores de las reglas.", 400, "engine");
    const { sets } = await campaignUnits(campaign.id);
    const problem = engineProblems(parsed.data, committedDaily(campaign, sets))[0];
    if (problem) throw new ProductApiError(problem, 422, "engine");
    const { error } = await adminClient().from("ad_campaigns").update({ engine: parsed.data, sync_error: null, updated_at: new Date().toISOString() }).eq("id", campaign.id);
    if (error) throw new Error(`Guardar el motor: ${error.message}`);
    return NextResponse.json({ engine: parsed.data });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar las reglas. Intenta de nuevo.");
  }
}
