import { NextResponse } from "next/server";
import { writeUsageTip } from "@/lib/pipeline/whatsapp-tip";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// El consejo de uso del mensaje «Entregado» (etapa WhatsApp):
// POST → escribir uno con la IA (u otro, que reemplaza al anterior; una llamada chica, ~10 s)

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const tip = await writeUsageTip(userId, id);
    return NextResponse.json({ tip: { text: tip.text, basis: tip.basis, createdAt: tip.created_at } });
  } catch (e) {
    return errorResponse(e, "No pudimos escribir el consejo. Intenta de nuevo en un momento.");
  }
}
