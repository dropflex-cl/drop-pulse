import { NextResponse, after } from "next/server";
import { videosState } from "@/lib/data/products";
import { approveAllKeyframes, processShots, startClips, startKeyframes } from "@/lib/pipeline/video";
import { generateReviewedUgc, reviewUgc } from "@/lib/product-intelligence/ugc-service";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { getScriptRow } from "@/lib/video/store";
import { runUgcOperation } from "@/lib/video/operations";
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
    const body = await json<{ action: Action; edit: unknown; expected_artifact_etag: string; idempotency_key: string }>(req);
    if (!body.action || !ACTIONS.includes(body.action)) throw new ProductApiError("Acción no válida.", 400);
    const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
    const repository = createContextRepository();
    if (body.action === "edit" || body.action === "approve" || body.action === "unapprove") await reviewUgc(repository, principal, id, scriptId, body.action, body.expected_artifact_etag, body.edit);
    else if (body.action === "approve_keyframes") await approveAllKeyframes(userId, id, scriptId, body.expected_artifact_etag);
    else {
      const script = await getScriptRow(userId, id, scriptId);
      if (script?.source === "mcp_chat") {
        const operation = await generateReviewedUgc(repository, principal, id, scriptId, body.action, body.expected_artifact_etag, undefined, false, body.idempotency_key);
        if (operation) after(() => runUgcOperation(operation));
        return NextResponse.json(await videosState(userId, id));
      }
      const ids = body.action === "keyframes" ? await startKeyframes(userId, id, scriptId) : await startClips(userId, id, scriptId);
      if (ids.length) after(() => processShots(ids));
    }
    return NextResponse.json(await videosState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
