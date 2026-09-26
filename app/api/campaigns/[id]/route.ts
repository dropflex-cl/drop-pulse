import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { deleteCampaign } from "@/lib/pipeline/ads-launch";
import { errorResponse } from "@/lib/products/http";

/** «Eliminar»: la campaña se pausa en Meta y sale de DropFlex con sus conjuntos, anuncios y métricas. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await deleteCampaign(user.id, id));
  } catch (e) {
    return errorResponse(e, "No pudimos eliminar la campaña. Intenta de nuevo.");
  }
}
