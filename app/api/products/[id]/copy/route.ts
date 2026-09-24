import { NextResponse, after } from "next/server";
import { expireStaleCopy } from "@/lib/copy/store";
import { copyState } from "@/lib/data/products";
import { runCopy, startCopy } from "@/lib/pipeline/copy";
import { errorResponse, json, ownedProduct } from "@/lib/products/http";

// Etapa Página del producto: la ficha y los componentes. La escritura sigue después de responder
// (after): una llamada a Claude, ~1–2 min.
export const maxDuration = 300;

/** Sondeo de la pantalla: la escritura, la ficha y los componentes vigentes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await expireStaleCopy(userId);
    return NextResponse.json(await copyState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * «Escribir la página con IA» y «Reintentar» ({}), y «Reescribir lo no aprobado» ({ redo: true }):
 * crea la escritura y la ejecuta en segundo plano. Lo aprobado nunca se reescribe.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<{ redo: boolean }>(req);
    const { run, created } = await startCopy(userId, id, body.redo === true);
    if (created && run) after(() => runCopy(run.id));
    return NextResponse.json(await copyState(userId, id), { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a escribir la página. Intenta de nuevo en un momento.");
  }
}
