import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { recreateCampaign } from "@/lib/pipeline/ads-launch";
import { errorResponse } from "@/lib/products/http";

/** «Recrear»: un borrador nuevo con la configuración exacta de la campaña, para editarla y lanzarla otra vez. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const c = await recreateCampaign(user.id, id);
    return NextResponse.json({ productId: c.product_id, sourceCampaignId: c.source_campaign_id });
  } catch (e) {
    return errorResponse(e, "No pudimos recrear la campaña. Intenta de nuevo.");
  }
}
