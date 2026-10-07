import { ensureVisualRenditions } from "./visual-renditions";
import { visualTargetSchema } from "./visual-schemas";
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient } from "@/lib/integrations/admin";
import { commandHash } from "./concurrency";
import { signContextCursor, verifyContextCursor } from "./context-cursor";
import { ProductIntelligenceError } from "./errors";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { requireScopes, toolScopes, type Principal } from "./policy";
import { contextAccess, type VisualRepository } from "./repository";
import { parseToolOutput, PI_LIMITS } from "./validation";
import { visualInputSchemas, visualReviewInput, VISUAL_LIMITS, type VisualRecord, type VisualTool, type VisualDependency } from "./visual-schemas";
import { assetCompatibility, assertCurrent, findVisual, invalidVisual, makeVisualRecord, planShot, prepareBindings, prepareIdentity, prepareIteration,
  prepareVisualPlan, prepareVisualReview, recordRef, recordValidity, visualValidity, vHash, type VisualState } from "./visual-domain";
import { hydrateVisualState } from "./visual-state";
import { visualSignedUrl } from "./visual-media";

export const visualEnabled = () => process.env.VISUAL_PRODUCTION_ENABLED !== "false";
const object = z.record(z.string(), z.unknown());
const operationSchema = z.object({ id: z.string().uuid(), kind: z.string(), iteration_id: z.string().uuid(), status: z.string(), source: object,
  expires_at: z.string(), result: z.unknown().nullable(), error_message: z.string().nullable() });
type Operation = z.infer<typeof operationSchema>;
export const safeOperation = (op: Operation) => ({ operation_id: op.id, kind: op.kind, iteration_id: op.iteration_id, state: op.status,
  expires_at: op.expires_at, result: op.result, error: op.error_message });
async function signedUpload(op: Operation) {
  if (op.kind !== "upload" || new Date(op.expires_at).getTime() < Date.now()) invalidVisual("El ticket venció. Prepara una nueva subida.", "VALIDATION_ERROR");
  const { data, error } = await adminClient().storage.from("page-media").createSignedUploadUrl(String(op.source.path));
  if (error || !data) throw new Error("No pudimos preparar la subida. Reintenta con la misma clave.");
  return { ...safeOperation(op), upload: { url: data.signedUrl, token: data.token, path: data.path, mime_type: op.source.mime_type, size_bytes: op.source.size_bytes,
    protocol: "supabase_signed_upload", expires_at: op.expires_at } };
}
export async function visualRecordView(r: VisualRecord, state: VisualState) {
  const file = r.kind === "asset" ? state.files.find(f => f.id === r.payload.file_id) : undefined;
  return { ...r, validity: recordValidity(r, state), ...(r.kind === "plan" ? { shot_validity: Object.fromEntries((r.payload.shots as { shot_key: string; dependencies: VisualDependency[] }[]).map(s => [s.shot_key, visualValidity(s.dependencies, state)])) } : {}), ...(file ? { file: { ...file, url: await visualSignedUrl(file.bucket, file.storage_path) } } : {}),
    reviews: state.records.filter(f => f.kind === "review" && f.payload.subject_id === r.id).slice(-10) };
}
export function createVisualExecutor(repository: VisualRepository, identity?: DelegatedIdentity, wake?: (id: string) => void, secret = process.env.OAUTH_STATE_SECRET ?? ""): DomainExecutor {
  return async (principal, command, signal) => {
    const tool = command.tool as VisualTool, schema = visualInputSchemas[tool];
    if (!schema || !visualEnabled()) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "La producción visual no está habilitada.");
    requireScopes(principal, toolScopes[tool]);
    const input = schema.parse(command.input), writing = "expected_revision" in input, access = contextAccess(principal, identity);
    const queryHash = vHash({ tool, user: principal.userId, actor: principal.actorId, input: Object.fromEntries(Object.entries(input).filter(([k]) => k !== "cursor")) });
    let snapshotId: string | null = null, offset = 0;
    if ("cursor" in input && input.cursor) {
      const cut = input.cursor.indexOf("."), sid = input.cursor.slice(0, cut);
      if (!z.string().uuid().safeParse(sid).success) throw new ProductIntelligenceError("CURSOR_INVALID", "Recupera esta lista desde el inicio.");
      const cursor = verifyContextCursor(input.cursor.slice(cut + 1), vHash({ queryHash, sid }), secret);
      snapshotId = sid; offset = cursor.offset;
    }
    const hash = writing ? commandHash(tool, input) : null;
    const raw = await repository.loadVisual({ p_access: access, p_product_id: input.product_id, p_tool: writing ? tool : null,
      p_key: writing ? input.idempotency_key : null, p_hash: hash, p_dry_run: writing && input.dry_run, p_snapshot_id: snapshotId }, signal);
    const replay = object.safeParse(raw);
    if (replay.success && replay.data.replay) {
      const result = parseToolOutput(tool, replay.data.replay);
      if (result.ok && "operation_id" in result.data && typeof result.data.operation_id === "string") {
        const op = operationSchema.parse(await repository.visualOperation({ p_access: access, p_product_id: input.product_id, p_operation_id: result.data.operation_id }, signal));
        if (tool === "prepare_visual_asset_upload") return parseToolOutput(tool, { ...result, data: { ...result.data, ...await signedUpload(op) } });
        if (op.kind === "ingest" && op.status === "pending") wake?.(op.id);
      }
      return result;
    }
    const state = await hydrateVisualState(raw, principal, input.product_id);
    const base = { ok: true as const, request_id: randomUUID(), product_id: input.product_id, revision: state.revision };
    const common = { etag: state.etag, dependency_stamp: state.dependency_stamp };
    const cursorAt = (next: number) => `${state.snapshot_id!}.${signContextCursor({ binding: vHash({ queryHash, sid: state.snapshot_id! }), revision: state.revision, offset: next,
      expires: Math.floor(Date.now() / 1000) + VISUAL_LIMITS.snapshotSeconds - 5 }, secret)}`;
    const output = (data: Record<string, unknown>) => {
      const value = { ...base, data: { ...common, ...data } };
      // Fit the whole response, not just the page, preserving a resumable cursor.
      const pages = [value.data, ...Object.values(data)].filter((v): v is Record<string, unknown> => Boolean(v && typeof v === "object" && "items" in v && "next_cursor" in v));
      while (Buffer.byteLength(JSON.stringify(value)) > PI_LIMITS.outputBytes - 2000) {
        const p = pages.find(p => Array.isArray(p.items) && p.items.length > 1);
        if (p) { (p.items as unknown[]).pop(); p.next_cursor = cursorAt(offset + (p.items as unknown[]).length); continue; }
        const extra = ["assets", "targets"].map(k => data[k]).find((a): a is unknown[] => Array.isArray(a) && a.length > 0);
        if (extra) { extra.pop(); continue; }
        break; // A single non-pageable record fails explicitly, never loses brief fields.
      }
      return parseToolOutput(tool, value);
    };
    const page = <T,>(rows: T[]) => {
      const items: T[] = []; let bytes = 0;
      for (const row of rows.slice(offset, offset + VISUAL_LIMITS.pageSize)) {
        const item = row as Record<string, unknown>;
        const reviews = item.kind === "asset" ? state.records.filter(r => r.kind === "review" && r.payload.subject_id === item.id).slice(-10) : [];
        const size = Buffer.byteLength(JSON.stringify(row)) + Buffer.byteLength(JSON.stringify(reviews)) + 1500; if (items.length && bytes + size > 60000) break;
        items.push(row); bytes += size;
      }
      const next = offset + items.length;
      const sid = state.snapshot_id!;
      return { items, total: rows.length, next_cursor: next < rows.length ? `${sid}.${signContextCursor({ binding: vHash({ queryHash, sid }), revision: state.revision, offset: next,
        expires: Math.floor(Date.now() / 1000) + VISUAL_LIMITS.snapshotSeconds - 5 }, secret)}` : null };
    };
    if (!writing) {
      if (tool === "get_visual_ingestion_status") {
        const q = visualInputSchemas[tool].parse(input);
        return output(safeOperation(operationSchema.parse(await repository.visualOperation({ p_access: access, p_product_id: q.product_id, p_operation_id: q.operation_id }, signal))));
      }
      if (tool === "get_visual_generation_context") {
        const q = visualInputSchemas[tool].parse(input), k = object.parse(state.knowledge), strategy = object.nullable().parse(k.strategy);
        if (q.strategy_id && strategy?.id !== q.strategy_id) invalidVisual("Usa la estrategia seleccionada vigente.");
        if (q.angle_id && !state.live[`angle:${q.angle_id}`]) invalidVisual("El ángulo no pertenece al producto.");
        const groups = Object.entries(object.parse(k.graph)).flatMap(([kind, rows]) => (rows as unknown[]).map(value => ({ kind, value })));
        const contextRows = [...groups, ...(k.persuasion_plans as unknown[]).map(value => ({ kind: "persuasion_plan", value })),
          ...(k.landing_experiences as unknown[]).map(value => ({ kind: "landing_experience", value })), ...(k.gallery_requirements as unknown[]).map(value => ({ kind: "gallery_requirement", value })),
          ...(k.creative_concepts as unknown[]).map(value => ({ kind: "creative_concept", value })), ...state.records.filter(r => r.kind !== "review").map(record => ({ kind: record.kind, value: record.kind === "plan" ? { ...record, payload: { name: record.payload.name, strategy_id: record.payload.strategy_id, identity_ref: record.payload.identity_ref, shot_keys: (record.payload.shots as { shot_key: string }[]).map(s => s.shot_key) } } : record })), ...state.targets.map(t => ({ kind: "target", value: { key: t.key, etag: t.etag, value: { target: object.parse(t.value).target } } }))];
        const contextPage = page(contextRows);
        const canonical = state.references.find(r => r.is_base), referenceInfo = canonical ? state.live[`reference:${canonical.id}`]?.value : null;
        return output({ product: k.product, context: k.context, pricing: k.pricing, policies: k.policies,
          selected_strategy: strategy ? { id: strategy.id, state: strategy.state, readiness: strategy.readiness, positioning: object.parse(strategy.snapshot).positioning, rationale: object.parse(strategy.snapshot).rationale } : null,
          canonical_reference: canonical ? { ...canonical, ...object.parse(referenceInfo) } : null, identity: state.records.find(r => r.kind === "identity" && r.status !== "archived") ?? null,
          context_records: contextPage, targets: state.targets.slice(0, 50).map(t => ({ key: t.key, etag: t.etag, value: { target: object.parse(t.value).target } })), capabilities: { generation: "external_only", ingestion: ["remote_url", "upload_ticket"], approval: "merchant_ui", reuse: true, max_upload_bytes: VISUAL_LIMITS.uploadBytes, max_pixels: VISUAL_LIMITS.maxPixels, max_plans: VISUAL_LIMITS.plans, max_shots: VISUAL_LIMITS.shots, max_assets: VISUAL_LIMITS.assets },
          next_steps: ["Lee las páginas de context_records antes de crear el brief.", "Aprueba identidad y plan en DropFlex; prepare_visual_iteration congela la toma y la referencia.", "Si el chat no entrega una URL, transfiere sus bytes al ticket firmado. El file_id de una conversación no es accesible por DropFlex."] });
      }
      if (tool === "get_visual_identity" || tool === "get_visual_generation_plan") {
        const q = tool === "get_visual_identity" ? visualInputSchemas.get_visual_identity.parse(input) : visualInputSchemas.get_visual_generation_plan.parse(input);
        const id = "identity_id" in q ? q.identity_id : "plan_id" in q ? q.plan_id : undefined, kind = tool === "get_visual_identity" ? "identity" : "plan";
        const rows = q.version ? state.history : state.records, current = id ? rows.find(r => r.id === id && r.kind === kind && (!q.version || r.version === q.version)) : state.records.filter(r => r.kind === kind && r.status !== "archived").at(-1);
        if (id && !current) invalidVisual("No encontramos esa versión en este producto.");
        const shots = current?.kind === "plan" ? current.payload.shots as Record<string, unknown>[] : [];
        const shotKey = "shot_key" in q ? q.shot_key : null;
        const currentShots = shots.filter(s => !shotKey || s.shot_key === shotKey).map(s => ({ ...s, validity: visualValidity(s.dependencies as VisualDependency[], state) }));
        const refs = current?.payload.identity_ref;
        return output({ current: current ? { ...await visualRecordView(current, state), payload: current.kind === "plan" ? Object.fromEntries(Object.entries(current.payload).filter(([k]) => k !== "shots")) : current.payload } : null, etag: current?.etag ?? state.etag, shots: page(currentShots),
          identity: refs ? findVisual(state, object.parse(refs).id as string, "identity", refs as { id: string; version: number; etag: string }) : null,
          canonical_reference: state.references.find(r => r.is_base) ?? null, assets: await Promise.all(state.records.filter(r => r.kind === "asset" && object.parse(r.payload.plan_ref).id === current?.id && (!shotKey || r.payload.shot_key === shotKey)).slice(-3).map(r => visualRecordView(r, state))), items: state.records.filter(r => r.kind === kind && r.status !== "archived").map(r => ({ ...recordRef(r), name: r.payload.name ?? r.payload.identity_description, status: r.status })) });
      }
      if (tool === "get_visual_reconciliation_context") {
        const q = visualInputSchemas[tool].parse(input), plan = findVisual(state, q.plan_id, "plan");
        return output({ plan, shots: (plan.payload.shots as Record<string, unknown>[]).map(s => ({ shot_key: s.shot_key, validity: visualValidity(s.dependencies as VisualDependency[], state) })),
          bindings: page(state.records.filter(r => r.kind === "binding").map(r => ({ ...r, validity: recordValidity(r, state) }))), identity: state.records.filter(r => r.kind === "identity") });
      }
      if (tool === "get_visual_comparison") {
        const q = visualInputSchemas[tool].parse(input);
        return output({ items: await Promise.all(q.asset_ids.map(async id => { const view = await visualRecordView(findVisual(state, id, "asset"), state); return { ...view, reviews: view.reviews.slice(-3) }; })) });
      }
      if (tool === "get_visual_reuse_candidates") {
        const q = visualInputSchemas[tool].parse(input), { shot, plan } = planShot(state, q.plan_ref, q.shot_key);
        const candidates = state.records.filter(r => r.kind === "asset" && r.payload.shot_family === shot.shot_family && !r.payload.archived_at);
        const selected = page(candidates);
        return output({ ...selected, items: await Promise.all(selected.items.map(async r => ({ ...await visualRecordView(r, state), reuse: assetCompatibility(r, shot, state, plan.visual_system) }))) });
      }
      if (tool === "get_visual_iteration_history") {
        const q = visualInputSchemas[tool].parse(input);
        const rows = state.records.filter(r => r.kind === "iteration" && (!q.plan_id || object.parse(r.payload.plan_ref).id === q.plan_id) && (!q.shot_key || r.payload.shot_key === q.shot_key) && (!q.shot_family || r.payload.shot_family === q.shot_family));
        return output(page(rows.map(r => ({ ...r, reviews: state.records.filter(v => v.kind === "review" && (r.payload.result_asset_ids as string[]).includes(String(v.payload.subject_id))).slice(-10) }))));
      }
      const q = visualInputSchemas.list_visual_assets.parse(input), assets = state.records.filter(r => r.kind === "asset" && (!q.shot_family || r.payload.shot_family === q.shot_family) && (!q.angle_id || r.payload.angle_id === q.angle_id) &&
        (!q.review_status || r.status === q.review_status) && (q.include_archived || !r.payload.archived_at)).reverse();
      const selected = page(assets);
      return output({ ...selected, items: await Promise.all(selected.items.map(r => visualRecordView(r, state))) });
    }
    if (input.expected_revision !== state.revision || input.expected_dependency_stamp !== state.dependency_stamp) throw new ProductIntelligenceError("REVISION_CONFLICT", "El contexto cambió. Recupéralo antes de guardar.");
    const mutation = input as Record<string, unknown>;
    const subjectId = mutation.identity_id ?? mutation.plan_id ?? mutation.asset_id ?? mutation.iteration_id ?? (tool === "save_visual_identity" ? state.records.find(r => r.kind === "identity")?.id : null) ?? (mutation.plan_ref && object.parse(mutation.plan_ref).id);
    const subject = subjectId ? state.records.find(r => r.id === subjectId) : null;
    if (input.expected_etag !== state.etag && input.expected_etag !== subject?.etag) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "La propuesta cambió. Recupérala antes de guardar.");
    let records: VisualRecord[] = [], operation: Record<string, unknown> | null = null;
    switch (tool) {
      case "save_visual_identity": { const q = visualInputSchemas[tool].parse(input); records = [prepareIdentity(state, q.identity, q.identity_id)]; break; }
      case "save_visual_generation_plan": { const q = visualInputSchemas[tool].parse(input); records = [prepareVisualPlan(state, q.plan, q.plan_id)]; break; }
      case "save_visual_reconciliation": {
        const q = visualInputSchemas[tool].parse(input), old = findVisual(state, q.plan_id, "plan"), prior = old.payload.shots as Record<string, unknown>[];
        if (new Set(q.resolutions.map(r => r.shot_key)).size !== q.resolutions.length) invalidVisual("No repitas tomas al reconciliar.", "VALIDATION_ERROR");
        for (const s of prior) {
          const resolution = q.resolutions.find(r => r.shot_key === s.shot_key), next = q.plan.shots.find(n => n.shot_key === s.shot_key);
          if (visualValidity(s.dependencies as VisualDependency[], state).state !== "current" && !resolution) invalidVisual("Explica cómo resolver cada toma que cambió.", "VALIDATION_ERROR");
          if (!next && resolution?.action !== "remove" || next && resolution?.action === "remove") invalidVisual("La resolución y las tomas del plan no coinciden.", "VALIDATION_ERROR");
          if (resolution?.action === "retain" && next && vHash(next) !== vHash(Object.fromEntries(Object.entries(s).filter(([k]) => !["dependencies", "shot_id", "shot_version", "shot_hash"].includes(k))))) invalidVisual("Una toma retenida conserva su intención; usa replace para cambiarla.", "VALIDATION_ERROR");
        }
        const p = prepareVisualPlan(state, q.plan, q.plan_id); p.payload.reconciliation = { from: recordRef(old), resolutions: q.resolutions }; p.etag = vHash({ kind: p.kind, version: p.version, status: p.status, payload: p.payload }); records = [p]; break;
      }
      case "prepare_visual_iteration": { const q = visualInputSchemas[tool].parse(input); records = [prepareIteration(state, q)]; break; }
      case "record_visual_iteration_result": { const q = visualInputSchemas[tool].parse(input), it = findVisual(state, q.iteration_id, "iteration");
        if (it.status !== "prepared") invalidVisual("Este intento ya tiene un resultado. Crea otro intento.", "VALIDATION_ERROR");
        records = [makeVisualRecord(state, "iteration", { ...it.payload, failure_detail: q.detail }, q.state, it.id)]; break; }
      case "bind_visual_asset": case "save_visual_binding_suggestions": {
        const q = tool === "bind_visual_asset" ? visualInputSchemas.bind_visual_asset.parse(input) : visualInputSchemas.save_visual_binding_suggestions.parse(input);
        records = prepareBindings(state, q.asset_id, q.bindings).flatMap(r => {
          const old = state.records.find(old => old.kind === "binding" && old.status !== "archived" && old.payload.asset_id === r.payload.asset_id && old.payload.target_key === r.payload.target_key);
          if (!old) return [r];
          if (old.status === "selected") { if (old.payload.target_etag !== r.payload.target_etag) invalidVisual("Quita el uso seleccionado antes de actualizar su destino.", "VALIDATION_ERROR"); return []; }
          return [makeVisualRecord(state, "binding", r.payload, "proposed", old.id)];
        }); break;
      }
      case "unbind_visual_asset": { const q = visualInputSchemas[tool].parse(input);
        records = q.binding_ids.map(id => { const b = findVisual(state, id, "binding"); if (b.status === "selected") invalidVisual("Quita la selección en DropFlex antes de archivar el uso.", "VALIDATION_ERROR"); return makeVisualRecord(state, "binding", { ...b.payload, archived_at: new Date().toISOString() }, "archived", id); }); break; }
      case "prepare_visual_asset_upload": { const q = visualInputSchemas[tool].parse(input), it = findVisual(state, q.iteration_id, "iteration"); assertCurrent(it, state);
        operation = { id: randomUUID(), kind: "upload", iteration_id: it.id, source: { path: `${principal.userId}/${q.product_id}/visual-upload-${randomUUID()}.${q.mime_type.split("/")[1]}`, mime_type: q.mime_type, size_bytes: q.size_bytes, cleanup_after: new Date(Date.now() + 3 * 60 * 60000).toISOString() } }; break; }
      case "ingest_external_visual_asset": { const q = visualInputSchemas[tool].parse(input), it = findVisual(state, q.iteration_id, "iteration");
        if (!["prepared", "result_recorded"].includes(it.status)) invalidVisual("Este intento terminó. Prepara una iteración nueva.", "VALIDATION_ERROR");
        let source: Record<string, unknown> = { ...q.source, generated_at: q.generated_at };
        if (q.source.type === "upload_ticket") {
          const ticket = operationSchema.parse(await repository.visualOperation({ p_access: access, p_product_id: q.product_id, p_operation_id: q.source.ticket_id }, signal));
          if (ticket.iteration_id !== it.id || ticket.kind !== "upload" || new Date(ticket.expires_at).getTime() <= Date.now()) invalidVisual("El ticket venció o pertenece a otra iteración.", "VALIDATION_ERROR");
          source = { type: "upload_ticket", ...ticket.source, generated_at: q.generated_at };
        }
        operation = { id: randomUUID(), kind: "ingest", iteration_id: it.id, source }; break;
      }
      default: throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no guarda propuestas.");
    }
    const result = parseToolOutput(tool, await repository.commitVisual({ p_access: access, p_product_id: input.product_id, p_tool: tool, p_expected_revision: input.expected_revision,
      p_etag: input.expected_etag, p_stamp: input.expected_dependency_stamp, p_key: input.idempotency_key, p_hash: hash, p_records: records, p_dry_run: input.dry_run, p_operation: operation }, signal));
    if (result.ok && !input.dry_run && "operation_id" in result.data && typeof result.data.operation_id === "string") {
      if (tool === "prepare_visual_asset_upload") return parseToolOutput(tool, { ...result, data: { ...result.data, ...await signedUpload(operationSchema.parse(await repository.visualOperation({ p_access: access, p_product_id: input.product_id, p_operation_id: result.data.operation_id }, signal))) } });
      wake?.(result.data.operation_id);
    }
    if (result.ok && tool === "prepare_visual_iteration") return parseToolOutput(tool, { ...result, data: { ...result.data, canonical_reference: state.references.find(r => r.is_base) ?? null } });
    return result;
  };
}

/** Deliberately excluded from MCP: authenticated merchant UI decisions only. */
export async function reviewVisualRecord(repository: VisualRepository, principal: Principal, raw: unknown, signal: AbortSignal) {
  if (principal.actorKind !== "merchant") throw new ProductIntelligenceError("FORBIDDEN", "Revisa y selecciona las piezas desde DropFlex.");
  const input = visualReviewInput.parse(raw), access = contextAccess(principal), hash = vHash({ tool: "review_visual_record", input });
  const loaded = await repository.loadVisual({ p_access: access, p_product_id: input.product_id, p_tool: "review_visual_record", p_key: input.idempotency_key, p_hash: hash, p_dry_run: input.dry_run }, signal);
  const replay = object.parse(loaded); if (replay.replay) return replay.replay;
  const state = await hydrateVisualState(loaded, principal, input.product_id), current = findVisual(state, input.record_id);
  if (input.expected_etag !== current.etag && input.expected_etag !== state.etag) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "La propuesta cambió. Recupérala antes de decidir.");
  if (input.expected_revision !== state.revision || input.expected_dependency_stamp !== state.dependency_stamp) throw new ProductIntelligenceError("REVISION_CONFLICT", "El contexto cambió. Recupéralo antes de decidir.");
  const records = prepareVisualReview(state, input);
  if (input.decision === "select" && !input.dry_run) await ensureVisualRenditions(state, findVisual(state, String(current.payload.asset_id), "asset"), visualTargetSchema.parse(current.payload.target), principal.userId);
  return repository.commitVisual({ p_access: access, p_product_id: input.product_id, p_tool: "review_visual_record", p_expected_revision: input.expected_revision,
    p_etag: input.expected_etag, p_stamp: input.expected_dependency_stamp, p_key: input.idempotency_key, p_hash: hash, p_records: records, p_dry_run: input.dry_run }, signal);
}
