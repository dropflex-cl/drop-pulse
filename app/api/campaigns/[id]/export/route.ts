import { ownedCampaign } from "@/lib/ads/campaign-api";
import { campaignExport } from "@/lib/pipeline/ads-export";
import { errorResponse } from "@/lib/products/http";

/** «Exportar CSV»: la campaña, cada conjunto y sus anuncios con lo acumulado desde el inicio. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { campaign } = await ownedCampaign(id);
    const { filename, csv } = await campaignExport(campaign);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e, "No pudimos exportar la campaña. Intenta de nuevo.");
  }
}
