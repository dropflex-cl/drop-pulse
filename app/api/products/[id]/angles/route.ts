import { NextResponse, after } from "next/server";
import { expireStaleAngles } from "@/lib/angles/store";
import { anglesState } from "@/lib/data/products";
import { runRanking, startRanking } from "@/lib/pipeline/angles";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// Etapa Ángulos. La evaluación sigue después de responder (after): una llamada a Claude, ~30–60 s.
export const maxDuration = 300;

/** Sondeo de la pantalla: el cliente ideal, la evaluación y los 2 desarrollos. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleAngles(userId);
    return NextResponse.json(await anglesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** “Elegir ángulos con IA” y “Volver a evaluar”: crea la evaluación y la ejecuta en segundo plano. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { ranking, created } = await startRanking(userId, id);
    if (created) after(() => runRanking(ranking.id));
    return NextResponse.json(await anglesState(userId, id), { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar la evaluación. Intenta de nuevo en un momento.");
  }
}
