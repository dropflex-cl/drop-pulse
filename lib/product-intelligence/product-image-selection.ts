import "server-only";
import { z } from "zod";
import { adminClient } from "@/lib/integrations/admin";
import { PI_SCOPES } from "./policy";
import { contextAccess, createContextRepository } from "./repository";
import { hydrateVisualState } from "./visual-state";
import { checkVisualPreconditions, findVisual, prepareBindings, prepareVisualReview, vHash } from "./visual-domain";
import { visualTargetSchema } from "./visual-schemas";
import { selectMcpBindings } from "./mcp-approval";
import { ensureVisualRenditions } from "./visual-renditions";
import { ProductApiError } from "@/lib/products/http";
import { pageImageRows } from "@/lib/page-images/store";
import { contextDatabaseError } from "./repository";

export const imageSelectionInput = z.strictObject({
  expected_revision: z.number().int().nonnegative(), expected_etag: z.string(), expected_dependency_stamp: z.string(),
  idempotency_key: z.string().uuid(), cover: z.string().uuid().nullable(), gallery: z.array(z.string().uuid()).max(5),
});
/** Decisión manual: un único commit del dominio visual y de sus proyecciones nativas, con historial y CAS. */
export async function setProductImageSelection(userId: string, productId: string, raw: unknown) {
  const input = imageSelectionInput.parse(raw), repo = createContextRepository(), signal = AbortSignal.timeout(25000);
  const access = contextAccess({ userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES });
  const hash = vHash({ action: "product_image_selection", input });
  const loaded = await repo.loadVisual({ p_access: access, p_product_id: productId, p_tool: "review_visual_record", p_key: input.idempotency_key, p_hash: hash }, signal);
  if ((loaded as { replay?: unknown }).replay) return (loaded as { replay: unknown }).replay;
  const state = await hydrateVisualState(loaded, { userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES }, productId);
  checkVisualPreconditions(state, input);
  const rows = await pageImageRows(userId, [productId]);
  const wanted = [...(input.cover ? [{ id: input.cover, slot: "cover", position: 1 }] : []), ...input.gallery.map((id, index) => ({ id, slot: "gallery", position: index + 1 }))];
  if (new Set(wanted.map(r => r.id)).size !== wanted.length) throw new ProductApiError("Usa cada imagen una sola vez en portada y galería.", 400);
  const old = state.records.filter(r => r.kind === "binding" && r.status === "selected" && (r.payload.target as { type: string; slot: string }).type === "gallery_shot" && ["cover", "gallery"].includes((r.payload.target as { slot: string }).slot));
  const records = old.flatMap(r => prepareVisualReview(state, { record_id: r.id, decision: "unselect", reason: "Cambio manual de portada y galería", tags: [] }));
  const staged = { ...state, records: state.records.map(r => records.find(n => n.id === r.id) ?? r) };
  const native: typeof wanted = [];
  for (const choice of wanted) {
    const row = rows.find(r => r.id === choice.id);
    if (!row || row.render_status !== "succeeded" || row.status === "rejected") throw new ProductApiError("Una imagen ya no está disponible. Actualiza la página.", 409);
    if (row.visual_binding_id) {
      const binding = findVisual(state, row.visual_binding_id, "binding"), asset = findVisual(state, String(binding.payload.asset_id), "asset");
      const target = state.targets.find(t => t.key === `gallery:${choice.slot}${choice.slot === "gallery" ? `:${choice.position}` : ""}`);
      if (!target) throw new ProductApiError("Ese espacio cambió. Actualiza la página.", 409);
      const parsed = visualTargetSchema.parse((target.value as { target: unknown }).target);
      const next = selectMcpBindings(staged, prepareBindings(staged, asset.id, [{ target: parsed, target_etag: target.etag, reason: "Selección manual del comerciante" }])).map(r => ({ ...r, payload: { ...r.payload, selection_source: "merchant" } }));
      // Las nuevas entidades empiezan en versión 1; no se crea una versión adicional al marcar su autor.
      for (const r of next) r.etag = vHash({ kind: r.kind, status: r.status, payload: r.payload, version: r.version });
      await ensureVisualRenditions(state, asset, parsed, userId);
      records.push(...next); staged.records.push(...next);
    } else {
      native.push(choice);
    }
  }
  const result = await adminClient().rpc("pi_set_product_gallery", { p_access: access, p_product_id: productId,
    p_expected_revision: input.expected_revision, p_etag: input.expected_etag, p_stamp: input.expected_dependency_stamp,
    p_key: input.idempotency_key, p_hash: hash, p_records: records, p_native: native });
  if (result.error) throw contextDatabaseError(result.error);
  return result.data;
}
