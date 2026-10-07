import { after, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, ownedProduct, ProductApiError } from "@/lib/products/http";
import { getVisualWorkbench } from "@/lib/data/visual-production";
import { createVisualExecutor, reviewVisualRecord } from "@/lib/product-intelligence/visual-service";
import { runVisualIngestion } from "@/lib/product-intelligence/visual-operations";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { visualTools, visualInputSchemas, type VisualTool } from "@/lib/product-intelligence/visual-schemas";
import { readBoundedJson } from "@/lib/product-intelligence/http";
import { parseToolInput, PI_LIMITS } from "@/lib/product-intelligence/validation";
import type { ToolCommand } from "@/lib/product-intelligence/mcp";

export const maxDuration = 300;
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params, { userId } = await ownedProduct(id);
    const offset = z.coerce.number().int().min(0).max(1000).parse(new URL(request.url).searchParams.get("offset") ?? 0);
    return NextResponse.json(await getVisualWorkbench(userId, id, offset), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return error instanceof z.ZodError ? NextResponse.json({ error: "Revisa el número de página." }, { status: 400 }) : errorResponse(error); }
}
export async function PUT(request: Request, { params }: Params) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ProductApiError("Abre DropFlex para guardar esta decisión.", 403);
    const { id } = await params, { userId } = await ownedProduct(id);
    const raw = z.strictObject({ tool: z.string(), input: z.record(z.string(), z.unknown()) }).parse(await readBoundedJson(request, PI_LIMITS.inputBytes));
    if (raw.input.product_id !== id) throw new ProductApiError("La pieza pertenece a otro producto.", 400);
    const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES }, repository = createContextRepository();
    if (raw.tool === "review_visual_record") return NextResponse.json(await reviewVisualRecord(repository, principal, raw.input, AbortSignal.timeout(25000)));
    if (!visualTools.includes(raw.tool as VisualTool)) throw new ProductApiError("La operación no es válida.", 400);
    const tool = raw.tool as keyof typeof visualInputSchemas;
    const result = await createVisualExecutor(repository, undefined, id => after(() => runVisualIngestion(id)))(principal,
      { tool, input: parseToolInput(tool, raw.input) } as ToolCommand, AbortSignal.timeout(25000));
    return NextResponse.json(result);
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Revisa los campos de la decisión." }, { status: 400 }); return errorResponse(error, "No pudimos guardar la decisión. Recupera el contexto e intenta de nuevo."); }
}
