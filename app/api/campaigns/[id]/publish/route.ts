import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { publishCampaign } from "@/lib/pipeline/ads-launch";
import { errorResponse, json } from "@/lib/products/http";

/**
 * «Publicar»: activa campaña, conjuntos y anuncios en Meta. Desde aquí la campaña gasta.
 * `{ start: "now" }` adelanta antes el inicio programado a este momento.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await json<{ start: unknown }>(req);
    const c = await publishCampaign(user.id, id, { startNow: body.start === "now" });
    return NextResponse.json({ status: c.status, publishedAt: c.published_at, startsAt: c.starts_at });
  } catch (e) {
    return errorResponse(e, "No pudimos publicar la campaña. Intenta de nuevo.");
  }
}
