import { NextResponse } from "next/server";
import { saveSpendCap } from "@/lib/ads/store";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";

/** El tope de gasto diario de la cuenta publicitaria (obligatorio antes del primer lanzamiento). */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const { amount } = await json<{ amount: number }>(req);
    await saveSpendCap(user.id, Number(amount));
    return NextResponse.json({ amount: Number(amount) });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar el tope. Intenta de nuevo.");
  }
}
