import "server-only";
import { adminClient } from "@/lib/integrations/admin";
import { requireUser } from "@/lib/integrations/session";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { contextAccess, createContextRepository } from "@/lib/product-intelligence/repository";
import { hydrateVisualState } from "@/lib/product-intelligence/visual-state";
import { visualEnabled, visualRecordView } from "@/lib/product-intelligence/visual-service";
import { VISUAL_LIMITS, visualTargetSchema } from "@/lib/product-intelligence/visual-schemas";
import type { VisualWorkbench } from "@/lib/types";

export async function getVisualWorkbench(userId: string, productId: string, offset = 0): Promise<VisualWorkbench | null> {
  if (!visualEnabled()) return null;
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const raw = await createContextRepository().loadVisual({ p_access: contextAccess(principal), p_product_id: productId }, AbortSignal.timeout(20000));
  const state = await hydrateVisualState(raw, principal, productId), canonical = state.references.find(r => r.is_base);
  const value = canonical ? state.live[`reference:${canonical.id}`]?.value as { content_hash: string | null } : null;
  const assets = state.records.filter(r => r.kind === "asset").reverse();
  const operations = await adminClient().from("pi_visual_operations").select("id,iteration_id,status").eq("user_id", userId).eq("product_id", productId).eq("kind", "ingest").in("status", ["pending", "processing"]).order("created_at").limit(8);
  if (operations.error) throw new Error("No pudimos recuperar las subidas pendientes. Actualiza la página.");
  const visible = new Set(assets.slice(offset, offset + VISUAL_LIMITS.pageSize).map(r => r.id));
  return { product_id: productId, revision: state.revision, etag: state.etag, dependency_stamp: state.dependency_stamp,
    canonical_reference: canonical ? { id: canonical.id, url: canonical.url, content_hash: value?.content_hash ?? null } : null,
    records: await Promise.all(state.records.filter(r => r.kind !== "asset" || visible.has(r.id)).map(r => visualRecordView(r, state))),
    targets: state.targets.map(t => ({ key: t.key, etag: t.etag, target: visualTargetSchema.parse((t.value as { target: unknown }).target) })),
    asset_total: assets.length, asset_offset: offset, pending_ingestions: (operations.data ?? []).map(o => ({ id: o.id, iteration_id: o.iteration_id, state: o.status })) };
}
export async function getProductVisualWorkbench(productId: string) {
  const user = await requireUser();
  return getVisualWorkbench(user.id, productId);
}
