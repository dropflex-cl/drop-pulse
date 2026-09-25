import { NextResponse, after } from "next/server";
import { expireStaleCopy } from "@/lib/copy/store";
import { copyState } from "@/lib/data/products";
import { runCopy, startCopy, type CopyMode } from "@/lib/pipeline/copy";
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
 * Crea la escritura y la ejecuta en segundo plano (docs/spec-angulos-testeo.md §5.8):
 * - {} «Escribir la página con IA» y «Reintentar»; { redo: true } «Reescribir lo no aprobado»:
 *   lo aprobado no se toca.
 * - { mode: "all" } «Reescribir toda la página»: también lo aprobado (queda guardado como anterior).
 * - { mode: { component } } «Volver a escribir con IA» en la hoja de un componente: solo ese.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<{ redo?: boolean; mode?: "all" | { component?: unknown } }>(req);
    const mode: CopyMode =
      body.mode === "all" ? { kind: "all" } : body.mode && typeof body.mode === "object" && typeof body.mode.component === "string" ? { kind: "only", component: body.mode.component } : { kind: "missing" };
    const { run, created } = await startCopy(userId, id, body.redo === true, mode);
    if (created && run) after(() => runCopy(run.id));
    return NextResponse.json(await copyState(userId, id), { status: created ? 202 : 200 });
  } catch (e) {
    return errorResponse(e, "No pudimos empezar a escribir la página. Intenta de nuevo en un momento.");
  }
}
