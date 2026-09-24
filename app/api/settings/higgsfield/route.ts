import { NextResponse } from "next/server";
import { HiggsfieldError } from "@/lib/integrations/higgsfield/client";
import { connectHiggsfield, disconnectHiggsfield } from "@/lib/integrations/higgsfield/connection";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";

// Ajustes › Conexiones › Higgsfield (docs/spec-creativos.md §6.3): la clave propia del comerciante.
// Se valida contra Higgsfield antes de guardarla en Vault; nunca vuelve al navegador.

/** Guardar o reemplazar la clave ({ key: "KEY_ID:KEY_SECRET" }). */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const { key } = await json<{ key: string }>(req);
    const conn = await connectHiggsfield(user.id, typeof key === "string" ? key : "");
    return NextResponse.json({ keyHint: conn.key_hint, status: conn.status });
  } catch (e) {
    if (e instanceof HiggsfieldError) return NextResponse.json({ error: e.message, field: "key" }, { status: e.code === "network" || e.code === "unavailable" ? 502 : 400 });
    return errorResponse(e, "No pudimos guardar la clave. Intenta de nuevo.");
  }
}

/** Desconectar: borra la clave de Vault. Las piezas ya generadas se conservan. */
export async function DELETE() {
  try {
    const user = await requireUser();
    await disconnectHiggsfield(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "No pudimos desconectar Higgsfield. Intenta de nuevo.");
  }
}
