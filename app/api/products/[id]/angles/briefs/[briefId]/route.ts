import { NextResponse, after } from "next/server";
import { anglesState } from "@/lib/data/products";
import { decideBrief, editBrief, regenerateBrief, regenerateBriefHooks, runBrief } from "@/lib/pipeline/angles";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";

// Un desarrollo de ángulo (la IA propone, tú decides):
// PATCH { action: "approve" | "reopen" } → aprobar o volver a revisión (el “Deshacer”)
// PUT   { edit, approve?: boolean }      → guardar lo editado (y, si approve, aprobarlo)
// POST                                   → regenerar (uno nuevo; el anterior queda descartado)
// POST ?part=hooks                        → «Otros ganchos»: solo los ganchos, en la misma solicitud

export const maxDuration = 300;

type Params = { params: Promise<{ id: string; briefId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id, briefId } = await params;
    const { userId } = await ownedProduct(id);
    const { action } = await json<{ action: "approve" | "reopen" }>(req);
    if (action !== "approve" && action !== "reopen") throw new ProductApiError("Acción desconocida.", 400, "action");
    await decideBrief(userId, id, briefId, action);
    return NextResponse.json(await anglesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id, briefId } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<{ edit: unknown; approve: boolean }>(req);
    await editBrief(userId, id, briefId, body.edit, body.approve === true);
    return NextResponse.json(await anglesState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { id, briefId } = await params;
    const { userId } = await ownedProduct(id);
    if (new URL(req.url).searchParams.get("part") === "hooks") {
      await regenerateBriefHooks(userId, id, briefId);
      return NextResponse.json(await anglesState(userId, id));
    }
    const created = await regenerateBrief(userId, id, briefId);
    after(() => runBrief(created));
    return NextResponse.json(await anglesState(userId, id), { status: 202 });
  } catch (e) {
    return errorResponse(e, "No pudimos regenerar este desarrollo. Intenta de nuevo en un momento.");
  }
}
