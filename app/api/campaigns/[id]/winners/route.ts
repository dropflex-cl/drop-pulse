import { NextResponse } from "next/server";
import { ownedCampaign } from "@/lib/ads/campaign-api";
import { createWinnersDraft } from "@/lib/pipeline/ads-winners";
import { errorResponse, json, ProductApiError } from "@/lib/products/http";

/** «Crear CBO con N ganadores»: arma el borrador precargado; se revisa y se lanza en el configurador. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedCampaign(id);
    const { decisionId } = await json<{ decisionId: string }>(req);
    if (typeof decisionId !== "string") throw new ProductApiError("Falta la sugerencia.", 400);
    return NextResponse.json(await createWinnersDraft(userId, id, decisionId), { status: 201 });
  } catch (e) {
    return errorResponse(e, "No pudimos armar la CBO de ganadores. Intenta de nuevo.");
  }
}
