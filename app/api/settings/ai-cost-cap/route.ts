import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";
import { saveAiCostCap } from "@/lib/settings/ai-cost";

/** El tope de gasto en IA por producto (opcional: `null` lo quita). */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const { amount } = await json<{ amount: number | null }>(req);
    const value = amount == null ? null : Number(amount);
    await saveAiCostCap(user.id, value);
    return NextResponse.json({ amount: value });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el tope. Intenta de nuevo.");
  }
}
