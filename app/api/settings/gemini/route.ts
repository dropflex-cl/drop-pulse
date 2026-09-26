import { NextResponse } from "next/server";
import { GeminiError } from "@/lib/integrations/gemini/client";
import { connectGemini, disconnectGemini } from "@/lib/integrations/gemini/connection";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";

// Ajustes › Anuncios con IA › Gemini: la clave propia del comerciante, igual que Higgsfield. Se valida
// contra Google antes de guardarla en Vault; nunca vuelve al navegador.

/** Guardar o reemplazar la clave ({ key }: la API key de Google AI Studio). */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const { key } = await json<{ key: string }>(req);
    const conn = await connectGemini(user.id, typeof key === "string" ? key : "");
    return NextResponse.json({ keyHint: conn.key_hint, status: conn.status });
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message, field: "key" }, { status: ["network", "unavailable", "timeout"].includes(e.code) ? 502 : 400 });
    return errorResponse(e, "No pudimos guardar la clave. Intenta de nuevo.");
  }
}

/** Desconectar: borra la clave de Vault. Las imágenes ya generadas se conservan. */
export async function DELETE() {
  try {
    const user = await requireUser();
    await disconnectGemini(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "No pudimos desconectar Gemini. Intenta de nuevo.");
  }
}
