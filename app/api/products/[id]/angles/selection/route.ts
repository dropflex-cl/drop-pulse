import { NextResponse, after } from "next/server";
import { anglesState } from "@/lib/data/products";
import { confirmSelection, runBrief } from "@/lib/pipeline/angles";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

// Los desarrollos corren en paralelo después de responder: una llamada a Claude por ángulo, ~1–2 minutos.
export const maxDuration = 300;

/** “Confirmar y desarrollar”: guarda los 2 o 3 ángulos elegidos y desarrolla los que falten. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { angles } = await json<{ angles: unknown }>(req);
    const created = await confirmSelection(userId, id, angles);
    if (created.length) after(() => Promise.all(created.map(runBrief)));
    return NextResponse.json(await anglesState(userId, id), { status: created.length ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar tu elección. Intenta de nuevo en un momento.");
  }
}
