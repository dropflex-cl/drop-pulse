import { NextResponse } from "next/server";
import { deleteTemplate, duplicateTemplate, renameTemplate } from "@/lib/ads/store";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";

type Ctx = { params: Promise<{ templateId: string }> };

/** Renombrar ({ name }) o duplicar ({ duplicate: true }). */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { templateId } = await params;
    const body = await json<{ name: string; duplicate: boolean }>(req);
    const template = body.duplicate ? await duplicateTemplate(user.id, templateId) : await renameTemplate(user.id, templateId, body.name);
    return NextResponse.json({ template });
  } catch (e) {
    return errorResponse(e, "No pudimos cambiar la plantilla. Intenta de nuevo.");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { templateId } = await params;
    await deleteTemplate(user.id, templateId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "No pudimos borrar la plantilla. Intenta de nuevo.");
  }
}
