import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { PI_SCOPES } from "./policy";
import { contextAccess, createContextRepository } from "./repository";
import { hydrateVisualState } from "./visual-state";
import { assertCurrent, findVisual } from "./visual-domain";
import { ProductIntelligenceError } from "./errors";

/** Existing publications remain intact; each new publish validates selected visual uses. */
export async function assertVisualBindingsPublishable(userId: string, productId: string, ids: string[]) {
  if (!ids.length) return;
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES }, repo = createContextRepository();
  const state = await hydrateVisualState(await repo.loadVisual({ p_access: contextAccess(principal), p_product_id: productId }, AbortSignal.timeout(20000)), principal, productId);
  for (const id of new Set(ids)) {
    const binding = findVisual(state, id, "binding"), asset = findVisual(state, String(binding.payload.asset_id), "asset");
    if (binding.status !== "selected" || asset.status !== "approved" || asset.payload.archived_at) throw new ProductIntelligenceError("VALIDATION_ERROR", "Revisa y selecciona las piezas visuales antes de publicar.");
    assertCurrent(binding, state); assertCurrent(asset, state);
  }
}
export async function assertVisualMediaPublishable(userId: string, productId: string, mediaIds: string[]) {
  if (!mediaIds.length) return;
  const { data, error } = await adminClient().from("ad_media").select("visual_binding_id").eq("user_id", userId).eq("product_id", productId).in("id", mediaIds).not("visual_binding_id", "is", null);
  if (error) throw new Error("No pudimos comprobar las piezas antes de publicar.");
  await assertVisualBindingsPublishable(userId, productId, (data ?? []).map(r => r.visual_binding_id as string));
}
