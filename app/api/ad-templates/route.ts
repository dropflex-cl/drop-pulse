import { NextResponse } from "next/server";
import { createTemplate, listTemplates } from "@/lib/ads/store";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, json } from "@/lib/products/http";

/** Plantillas propias: la lista y «Guardar como plantilla». */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ templates: await listTemplates(user.id) });
  } catch (e) {
    return errorResponse(e, "No pudimos leer las plantillas.");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    return NextResponse.json({ template: await createTemplate(user.id, await json(req)) }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "No pudimos guardar la plantilla. Intenta de nuevo.");
  }
}
