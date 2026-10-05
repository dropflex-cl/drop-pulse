import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";
import { activateTemplate, listTemplates, PromptError, promptSettings } from "@/lib/prompts/store";
import { isPromptKey } from "@/lib/prompts/tags";

/** «Usar esta versión»: vuelve a una versión guardada de un prompt (solo admin). */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireUser();
    if (!user.admin) throw new PromptError("Solo un administrador puede cambiar los prompts.", 403);
    const { key } = await params;
    if (!isPromptKey(key)) throw new PromptError("No existe ese prompt.", 404);
    const { id } = await json<{ id: string }>(req);
    if (!id || !(await listTemplates(key)).some((t) => t.id === id)) throw new PromptError("No existe esa versión.", 404);
    await activateTemplate(id);
    return NextResponse.json((await promptSettings()).find((p) => p.key === key));
  } catch (e) {
    if (e instanceof PromptError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e, "No pudimos cambiar la versión. Intenta de nuevo en un momento.");
  }
}
