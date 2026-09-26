import { NextResponse, after } from "next/server";
import { videosState } from "@/lib/data/products";
import { approveAllKeyframes, approveScript, editScript, processShots, startClips, startKeyframes } from "@/lib/pipeline/video";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

// Las imágenes clave y los clips se envían a Higgsfield después de responder (after).
export const maxDuration = 300;

type Action = "edit" | "approve" | "unapprove" | "keyframes" | "approve_keyframes" | "clips";
const ACTIONS: Action[] = ["edit", "approve", "unapprove", "keyframes", "approve_keyframes", "clips"];

/** Editar y aprobar el guion; generar las imágenes clave, aprobarlas todas y generar los clips. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; scriptId: string }> }) {
  try {
    const { id, scriptId } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<{ action: Action; edit: unknown }>(req);
    if (!body.action || !ACTIONS.includes(body.action)) throw new ProductApiError("Acción no válida.", 400);
    if (body.action === "edit") await editScript(userId, id, scriptId, body.edit);
    else if (body.action === "approve" || body.action === "unapprove") await approveScript(userId, id, scriptId, body.action === "approve");
    else if (body.action === "approve_keyframes") await approveAllKeyframes(userId, id, scriptId);
    else {
      const ids = body.action === "keyframes" ? await startKeyframes(userId, id, scriptId) : await startClips(userId, id, scriptId);
      if (ids.length) after(() => processShots(ids));
    }
    return NextResponse.json(await videosState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
