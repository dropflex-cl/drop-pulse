import { NextResponse } from "next/server";
import { errorResponse, ownedProduct, ProductApiError } from "@/lib/products/http";
import { getPdpWorkbench } from "@/lib/data/pdp-persuasion";
import { createProductIntelligenceExecutor } from "@/lib/product-intelligence/knowledge-service";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { parseToolInput } from "@/lib/product-intelligence/validation";
import { PI_LIMITS } from "@/lib/product-intelligence/validation";
import { readBoundedJson } from "@/lib/product-intelligence/http";

type Params = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Params) {
  try { const { id } = await params, { userId } = await ownedProduct(id); return NextResponse.json(await getPdpWorkbench(userId, id)); }
  catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request, { params }: Params) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ProductApiError("Abre DropFlex para guardar esta decisión.", 403);
    const { id } = await params, { userId } = await ownedProduct(id);
    let raw: unknown;
    try { raw = await readBoundedJson(request, PI_LIMITS.inputBytes); }
    catch (error) {
      const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 400;
      throw new ProductApiError("Envía JSON válido dentro del tamaño permitido.", status);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => !["tool", "input"].includes(k))) throw new ProductApiError("La operación no es válida.", 400);
    const body = raw as { tool?: unknown; input?: unknown };
    if (body.tool !== "save_angle_persuasion_plan" && body.tool !== "save_landing_experience") throw new ProductApiError("La operación no es válida.", 400);
    const input = parseToolInput(body.tool, body.input);
    if (input.product_id !== id) throw new ProductApiError("El plan pertenece a otro producto.", 400);
    const result = await createProductIntelligenceExecutor(createContextRepository())({ userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES },
      { tool: body.tool, input } as Parameters<ReturnType<typeof createProductIntelligenceExecutor>>[1], AbortSignal.timeout(10000));
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error, "No pudimos guardar el recorrido de la página. Revisa el contexto e intenta de nuevo."); }
}
