import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";
import { PromptError, promptSettings, saveTemplate, type PromptEffort } from "@/lib/prompts/store";
import { isPromptKey } from "@/lib/prompts/tags";

// Ajustes › Prompts: solo el equipo de DropFlex (app_metadata.role = "admin") los ve y los cambia. Cada
// guardado es una versión nueva y queda activa; el texto vive en prompt_templates.

const EFFORTS: PromptEffort[] = ["low", "medium", "high"];

async function admin() {
  const user = await requireUser();
  if (!user.admin) throw new PromptError("Solo un administrador puede ver o cambiar los prompts.", 403);
  return user;
}

function promptError(e: unknown) {
  if (e instanceof PromptError) return NextResponse.json({ error: e.message }, { status: e.status });
  return errorResponse(e, "No pudimos guardar el prompt. Intenta de nuevo en un momento.");
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await admin();
    const { key } = await params;
    if (!isPromptKey(key)) throw new PromptError("No existe ese prompt.", 404);
    return NextResponse.json((await promptSettings()).find((p) => p.key === key));
  } catch (e) {
    return promptError(e);
  }
}

/** Guarda una versión nueva y la deja activa. */
export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const user = await admin();
    const { key } = await params;
    if (!isPromptKey(key)) throw new PromptError("No existe ese prompt.", 404);
    const body = await json<{ body: string; effort: PromptEffort; maxTokens: number; note?: string }>(req);
    if (typeof body.body !== "string") throw new PromptError("Falta el texto del prompt.");
    const effort = EFFORTS.includes(body.effort as PromptEffort) ? (body.effort as PromptEffort) : "high";
    const maxTokens = Math.round(Number(body.maxTokens));
    if (!Number.isFinite(maxTokens) || maxTokens < 1000 || maxTokens > 64000) throw new PromptError("El máximo de tokens va entre 1.000 y 64.000.");
    await saveTemplate(key, { body: body.body, effort, maxTokens, note: body.note }, user.id);
    return NextResponse.json((await promptSettings()).find((p) => p.key === key));
  } catch (e) {
    return promptError(e);
  }
}
