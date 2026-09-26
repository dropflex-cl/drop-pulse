import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { redoCampaign } from "@/lib/pipeline/ads-launch";
import { errorResponse } from "@/lib/products/http";

/** «Rehacer»: una campaña que nunca entregó se borra en Meta y vuelve a ser borrador. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const c = await redoCampaign(user.id, id);
    return NextResponse.json({ productId: c.product_id, sourceCampaignId: c.source_campaign_id });
  } catch (e) {
    return errorResponse(e, "No pudimos rehacer la campaña. Intenta de nuevo.");
  }
}
