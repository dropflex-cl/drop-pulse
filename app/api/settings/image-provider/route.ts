import { NextResponse } from "next/server";
import { isImageProvider, isImageStage } from "@/lib/image-provider";
import { ImageProviderUnavailable, saveImageProvider } from "@/lib/integrations/image-provider";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";

// El proveedor de imágenes que eligió el comerciante en una pantalla que genera ({ stage, provider }).
// Queda guardado por etapa: la próxima vez la pantalla abre con el mismo.
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const { stage, provider } = await json<{ stage: unknown; provider: unknown }>(req);
    if (!isImageStage(stage) || !isImageProvider(provider)) return NextResponse.json({ error: "Elige Higgsfield o Gemini." }, { status: 400 });
    return NextResponse.json(await saveImageProvider(user.id, stage, provider));
  } catch (e) {
    if (e instanceof ImageProviderUnavailable) return NextResponse.json({ error: e.message }, { status: 409 });
    return errorResponse(e, "No pudimos guardar tu elección. Intenta de nuevo.");
  }
}
