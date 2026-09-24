import { NextResponse } from "next/server";
import { ownedCampaign } from "@/lib/ads/campaign-api";
import { MANUAL_SYNC_MIN_MS, syncCampaign } from "@/lib/pipeline/ads-sync";
import { errorResponse, ProductApiError } from "@/lib/products/http";

export const maxDuration = 60;

/** «Actualizar ahora»: la misma lectura del job horario para esta campaña, como mucho cada 5 minutos. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { campaign } = await ownedCampaign(id);
    const last = campaign.last_synced_at ? Date.parse(campaign.last_synced_at) : 0;
    if (Date.now() - last < MANUAL_SYNC_MIN_MS) {
      const min = Math.ceil((MANUAL_SYNC_MIN_MS - (Date.now() - last)) / 60_000);
      throw new ProductApiError(`Se actualizó hace poco. Vuelve a intentar en ${min} ${min === 1 ? "minuto" : "minutos"}.`, 429);
    }
    const r = await syncCampaign(campaign);
    if (!r.ok) throw new ProductApiError(r.error ?? "No pudimos leer la campaña en Meta.", 502);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "No pudimos actualizar la campaña. Intenta de nuevo.");
  }
}
