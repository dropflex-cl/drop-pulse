import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { publishCampaign } from "@/lib/pipeline/ads-launch";
import { errorResponse } from "@/lib/products/http";

/** «Publicar»: activa campaña, conjuntos y anuncios en Meta. Desde aquí la campaña gasta. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const c = await publishCampaign(user.id, id);
    return NextResponse.json({ status: c.status, publishedAt: c.published_at });
  } catch (e) {
    return errorResponse(e, "No pudimos publicar la campaña. Intenta de nuevo.");
  }
}
