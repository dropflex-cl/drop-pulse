import { NextResponse, after } from "next/server";
import { strategyState } from "@/lib/data/products";
import { expireStaleStrategies, runStrategy, startStrategy } from "@/lib/pipeline/strategy";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// El informe del mega prompt es largo (40 hooks, ángulos, conceptos, objeciones): 3 a 8 minutos con Opus.
// La corrida sigue después de responder (after) dentro del tiempo máximo de la función (Fluid compute).
export const maxDuration = 800;

/** «Generar estrategia»: crea la corrida y la ejecuta en segundo plano. Devuelve el estado de la etapa. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { run, created } = await startStrategy(userId, id);
    if (created) after(() => runStrategy(run.id));
    return NextResponse.json(await strategyState(userId, id), { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar la estrategia. Intenta de nuevo en un momento.");
  }
}

/** Sondeo de la pantalla: la corrida más reciente y los ángulos elegidos. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleStrategies(userId);
    return NextResponse.json(await strategyState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
