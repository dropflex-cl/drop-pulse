import { adminClient } from "@/lib/integrations/admin";
import { requireUser } from "@/lib/integrations/session";
import { errorResponse, ProductApiError } from "@/lib/products/http";
import { NextResponse } from "next/server";

async function admin() {
  const user = await requireUser();
  if (!user.admin) throw new ProductApiError("Solo un administrador puede consultar el historial de prompts.", 403);
}

/** Solo historial; ninguna versión se ejecuta en la app. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await admin();
    const { key } = await params;
    if (!["strategy", "product_data"].includes(key)) throw new ProductApiError("No existe ese prompt.", 404);
    const { data, error } = await adminClient().from("prompt_templates").select("id, key, version, body, created_at").eq("key", key).order("version", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ retired: true, versions: data });
  } catch (error) { return errorResponse(error); }
}

export async function PUT() {
  try {
    await admin();
    throw new ProductApiError("El editor de prompts se retiró. El contenido se prepara desde el chat.", 410);
  } catch (error) { return errorResponse(error); }
}
