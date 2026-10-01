import { NextResponse } from "next/server";
import { AnthropicError } from "@/lib/integrations/anthropic/client";
import { connectAnthropic, disconnectAnthropic } from "@/lib/integrations/anthropic/connection";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";

// Ajustes › Inteligencia artificial › Anthropic: la clave propia del comerciante, igual que Higgsfield y
// Gemini. Se valida contra Anthropic antes de guardarla en Vault; nunca vuelve al navegador.

/** Guardar o reemplazar la clave ({ key }: la API key de la consola de Anthropic). */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const { key } = await json<{ key: string }>(req);
    const conn = await connectAnthropic(user.id, typeof key === "string" ? key : "");
    return NextResponse.json({ keyHint: conn.key_hint, status: conn.status });
  } catch (e) {
    if (e instanceof AnthropicError) return NextResponse.json({ error: e.message, field: "key" }, { status: ["network", "unavailable", "busy"].includes(e.code) ? 502 : 400 });
    return errorResponse(e, "No pudimos guardar la clave. Intenta de nuevo.");
  }
}

/** Desconectar: borra la clave de Vault. Lo ya generado se conserva; la IA se detiene hasta conectar otra. */
export async function DELETE() {
  try {
    const user = await requireUser();
    await disconnectAnthropic(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "No pudimos desconectar Anthropic. Intenta de nuevo.");
  }
}
