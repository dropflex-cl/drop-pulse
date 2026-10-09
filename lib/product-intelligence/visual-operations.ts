import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient } from "@/lib/integrations/admin";
import { makeVisualRecord, vHash, type VisualState } from "./visual-domain";
import { visualRecordSchema, VISUAL_LIMITS } from "./visual-schemas";
import { createContextRepository } from "./repository";
import { recordServerVisualEvent } from "./visual-transfer";
import { downloadVisual, optimizeVisual, visualByteHash, visualStoredBytes } from "./visual-media";

const opSchema = z.object({ id: z.string().uuid(), product_id: z.string().uuid(), user_id: z.string().uuid(), iteration_id: z.string().uuid(),
  access: z.record(z.string(), z.unknown()), source: z.record(z.string(), z.unknown()), lease_token: z.string().uuid(), expires_at: z.string() });
/** Durable ingestion only; this module never invokes a generative provider. */
export async function runVisualIngestion(id: string) {
  const db = adminClient();
  const initial = await db.from("pi_visual_operations").select("access,product_id").eq("id", id).eq("kind", "ingest").maybeSingle();
  if (initial.error || !initial.data) return;
  const claim = await db.rpc("pi_visual_operation", { p_access: initial.data.access, p_product_id: initial.data.product_id, p_operation_id: id, p_claim: true });
  if (claim.error) { await db.rpc("pi_cancel_revoked_visual_operation", { p_id: id }); return; }
  if (!claim.data) return;
  const op = opSchema.parse(claim.data); let uploaded: string | null = null;
  const started = Date.now(), attempt = op.id;
  const event = (state: "started" | "succeeded" | "failed", error_code?: string) => recordServerVisualEvent(createContextRepository(db), op.access, op.product_id,
    { attempt_id: attempt, stage: "ingestion", state, duration_ms: Math.min(Date.now() - started, 300000), iteration_id: op.iteration_id, operation_id: op.id, ...(error_code ? { error_code } : {}) });
  let failureCode = "TRANSFER_EXPIRED";
  await event("started");
  try {
    if (new Date(op.expires_at).getTime() < Date.now()) throw new Error("La URL o el ticket venció. Prepara otra subida para esta iteración.");
    const fetched = await db.from("pi_visual_records").select("*").eq("id", op.iteration_id).eq("product_id", op.product_id).eq("user_id", op.user_id).single();
    if (fetched.error) throw new Error("La iteración no está disponible. Recupera el plan.");
    const it = visualRecordSchema.parse(fetched.data);
    if (!["prepared", "result_recorded"].includes(it.status)) throw new Error("La iteración terminó. Prepara otra iteración.");
    failureCode = "IMAGE_DOWNLOAD_FAILED";
    const bytes = op.source.type === "remote_url" ? await downloadVisual(String(op.source.url), AbortSignal.timeout(20000), op.source.origin === "chatgpt_file") : await visualStoredBytes("page-media", String(op.source.path));
    if (op.source.type === "upload_ticket" && bytes.length !== op.source.size_bytes) throw new Error("El archivo no coincide con el tamaño del ticket. Prepara una nueva subida.");
    failureCode = "IMAGE_VALIDATION_FAILED";
    const optimized = await optimizeVisual(bytes), hash = visualByteHash(optimized.data);
    const existing = await db.from("pi_visual_files").select("*").eq("product_id", op.product_id).eq("user_id", op.user_id).eq("sha256", hash).maybeSingle();
    if (existing.error) throw new Error("No pudimos comprobar si el archivo ya existe. Reintenta.");
    const path = existing.data?.storage_path ?? `${op.user_id}/${op.product_id}/visual-${hash}.webp`;
    failureCode = "STORAGE_WRITE_FAILED";
    if (!existing.data) {
      const upload = await db.storage.from("page-media").upload(path, optimized.data, { contentType: optimized.mime, upsert: false });
      if (upload.error) {
        // A recovered lease may find bytes written before the previous process died.
        const prior = await visualStoredBytes("page-media", path);
        if (visualByteHash(prior) !== hash) throw new Error("No pudimos guardar el archivo. Reintenta la ingestión.");
      } else uploaded = path;
    }
    const file = existing.data ?? { id: randomUUID(), bucket: "page-media", storage_path: path, sha256: hash, original_sha256: visualByteHash(bytes),
      mime_type: optimized.mime, width: optimized.width, height: optimized.height, size_bytes: optimized.data.length };
    const frozen = it.payload.shot_snapshot as Record<string, unknown>;
    const payload = { file_id: file.id, iteration_id: it.id, plan_ref: it.payload.plan_ref, identity_ref: it.payload.identity_ref, shot_key: it.payload.shot_key,
      shot_family: it.payload.shot_family, shot_hash: frozen.shot_hash, strategy_id: it.payload.strategy_id, angle_id: it.payload.angle_id,
      representation: frozen.representation, dependencies: it.payload.dependencies, source_system: it.payload.source_system, model: it.payload.model,
      instruction_hash: it.payload.instruction_hash, resolved_instruction: it.payload.resolved_instruction, parent_asset_id: it.payload.parent_asset_id,
      ...(op.source.file_id ? { external_file_id_hash: vHash(String(op.source.file_id)) } : {}),
      source_reference_asset_ids: it.payload.reference_asset_ids, source_reference_image_ids: it.payload.reference_image_ids, generated_at: op.source.generated_at ?? null,
      semantic_hash: vHash({ file_sha256: hash, shot_hash: frozen.shot_hash, identity_ref: it.payload.identity_ref, instruction_hash: it.payload.instruction_hash,
        source_system: it.payload.source_system, parent_asset_id: it.payload.parent_asset_id, reference_asset_ids: it.payload.reference_asset_ids, based_on_review_ids: it.payload.based_on_review_ids }) };
    const asset = makeVisualRecord({ records: [] } as unknown as VisualState, "asset", payload, "generated");
    failureCode = "DATABASE_COMMIT_FAILED";
    const saved = await db.rpc("pi_complete_visual_ingestion", { p_operation_id: op.id, p_token: op.lease_token, p_file: file, p_asset: asset });
    if (saved.error) { console.error("[visual-ingestion/database]", saved.error.code, saved.error.message); throw new Error("El permiso o el producto cambió durante la subida. Recupera el contexto antes de reintentar."); }
    uploaded = null;
    await event("succeeded");
    if (op.source.type === "upload_ticket") await db.storage.from("page-media").remove([String(op.source.path)]);
  } catch (error) {
    await event("failed", failureCode);
    if (uploaded) {
      const refs = await db.from("pi_visual_files").select("id").eq("product_id", op.product_id).eq("storage_path", uploaded);
      const active = await db.from("pi_visual_operations").select("id,lease_token").eq("product_id", op.product_id).eq("kind", "ingest").in("status", ["pending", "processing"]);
      const ownsLease = active.data?.some(p => p.id === op.id && p.lease_token === op.lease_token);
      if (!refs.error && !active.error && ownsLease && !refs.data?.length && !active.data?.some(p => p.id !== op.id)) await db.storage.from("page-media").remove([uploaded]);
    }
    // Do not log temporary URLs or tokens. Terminalizing a failed lease never creates content.
    await db.rpc("pi_complete_visual_ingestion", { p_operation_id: op.id, p_token: op.lease_token, p_file: null, p_asset: null,
      p_error: error instanceof Error && !/https?:\/\//.test(error.message) ? error.message : "No pudimos recibir la imagen. Usa otro enlace o prepara una nueva subida." });
  }
}
export async function resumeVisualIngestions() {
  const db = adminClient(), stale = new Date(Date.now() - 2 * 60000).toISOString();
  const { data, error } = await db.from("pi_visual_operations").select("id").eq("kind", "ingest").or(`status.eq.pending,and(status.eq.processing,lease_at.lt.${stale})`).order("created_at").limit(8);
  if (error) throw new Error("No pudimos recuperar las ingestas pendientes.");
  await Promise.all((data ?? []).map(o => runVisualIngestion(o.id)));
  for (const table of ["pi_visual_read_snapshots", "pi_visual_receipts"]) await db.from(table).delete().lt("expires_at", new Date().toISOString());
  const expired = await db.from("pi_visual_operations").select("id,source").eq("kind", "upload").lt("expires_at", new Date().toISOString()).not("source->>path", "is", null).order("expires_at").limit(100);
  for (const ticket of expired.data ?? []) {
    const removed = await db.storage.from("page-media").remove([String(ticket.source.path)]);
    if (!removed.error) await db.from("pi_visual_operations").update({ status: "failed", source: new Date(ticket.source.cleanup_after ?? 0).getTime() <= Date.now() ? {} : ticket.source, error_message: "El ticket venció. Prepara otra subida." }).eq("id", ticket.id);
  }
  return { resumed: data?.length ?? 0, max_upload_bytes: VISUAL_LIMITS.uploadBytes };
}
