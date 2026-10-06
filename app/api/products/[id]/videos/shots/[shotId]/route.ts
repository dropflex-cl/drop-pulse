import { NextResponse, after } from "next/server";
import { videosState } from "@/lib/data/products";
import { decideKeyframe, reconcileShot, processShot, recoverShot, regenerateShot, syncVideos, type KeyframeDecision } from "@/lib/pipeline/video";
import { generateReviewedUgc } from "@/lib/product-intelligence/ugc-service";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { getShotRow, getScriptRow } from "@/lib/video/store";
import { runUgcOperation } from "@/lib/video/operations";
import { ProductApiError, errorResponse, json, ownedProduct } from "@/lib/products/http";

export const maxDuration = 300;

type Action = KeyframeDecision | "regenerate" | "recover" | "reconcile";
const ACTIONS: Action[] = ["approve", "reject", "reopen", "regenerate", "recover", "reconcile"];

/** Aprobar, descartar o volver a revisar una imagen clave; generar de nuevo o recuperar una toma. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
  try {
    const { id, shotId } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<{ action: Action; expected_artifact_etag?: string; expected_shot_updated_at?: string; idempotency_key?: string; request_id?: string; confirm_not_sent?: boolean }>(req);
    const { action, expected_artifact_etag, expected_shot_updated_at, idempotency_key } = body;
    if (!action || !ACTIONS.includes(action)) throw new ProductApiError("Acción no válida.", 400);
    if (action === "regenerate") {
      const shot = await getShotRow(userId, shotId);
      const script = shot && await getScriptRow(userId, id, shot.script_id);
      if (script?.source === "mcp_chat" && shot && shot.product_id === id) {
        const operation = await generateReviewedUgc(createContextRepository(), { userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES }, id, script.id, shot.kind === "keyframe" ? "keyframes" : "clips", expected_artifact_etag, shot.key, true, idempotency_key);
        if (operation) after(() => runUgcOperation(operation));
        return NextResponse.json(await videosState(userId, id));
      }
      const next = await regenerateShot(userId, id, shotId);
      after(() => processShot(next, true));
    } else if (action === "reconcile") {
      await reconcileShot(userId, id, shotId, body);
      after(() => syncVideos(userId, id));
    } else if (action === "recover") {
      await recoverShot(userId, id, shotId);
      after(() => syncVideos(userId, id));
    } else {
      await decideKeyframe(userId, id, shotId, action, expected_artifact_etag, expected_shot_updated_at);
    }
    return NextResponse.json(await videosState(userId, id));
  } catch (e) {
    return errorResponse(e);
  }
}
