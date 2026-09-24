import { NextResponse, after } from "next/server";
import { expireStaleCreatives } from "@/lib/creatives/store";
import { creativesState } from "@/lib/data/products";
import { runCreatives, startCreatives, syncCreatives } from "@/lib/pipeline/creatives";
import { errorResponse, ownedProduct } from "@/lib/products/http";

// Etapa Creativos (docs/spec-creativos.md): los conceptos del generador de estáticos. La propuesta
// sigue después de responder (after): una llamada a Claude con imágenes, ~40–90 s.
export const maxDuration = 300;

/** Sondeo de la pantalla: conceptos y piezas. De paso, termina las piezas que quedaron esperando. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleCreatives(userId);
    after(() => syncCreatives(userId, id));
    return NextResponse.json(await creativesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/** «Proponer anuncios» y «Reintentar»: crea la corrida del generador y la ejecuta en segundo plano. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { run, created } = await startCreatives(userId, id);
    if (created) after(() => runCreatives(run.id));
    return NextResponse.json(await creativesState(userId, id), { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a proponer los anuncios. Intenta de nuevo en un momento.");
  }
}
