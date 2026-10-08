import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SLOT_RATIO, slotKind } from "@/lib/page-images/catalog";
import { canonicalHash } from "./concurrency";
import { ProductIntelligenceError } from "./errors";
import { visualIdentitySchema, visualPlanSchema, visualRecordSchema, visualRefSchema, visualValiditySchema, VISUAL_LIMITS,
  type VisualDependency, type VisualPlan, type VisualRecord, type VisualRef, type VisualShot, type VisualTarget, type VisualValidity } from "./visual-schemas";
import type { JsonValue } from "./schemas";

export const visualReadSchema = z.object({ product_id: z.string().uuid(), revision: z.number().int().nonnegative(), etag: z.string(), dependency_stamp: z.string(),
  records: z.array(visualRecordSchema).max(VISUAL_LIMITS.records), history: z.array(visualRecordSchema),
  live: z.record(z.string(), z.object({ hash: z.string(), value: z.unknown(), blocked: z.boolean().default(false) })),
  references: z.array(z.object({ id: z.string().uuid(), storage_path: z.string().nullable(), url: z.string().nullable(), mime_type: z.string().nullable(), is_base: z.boolean() })),
  targets: z.array(z.object({ key: z.string(), etag: z.string(), value: z.unknown() })),
  files: z.array(z.object({ id: z.string().uuid(), bucket: z.string(), storage_path: z.string(), mime_type: z.string(), width: z.number(), height: z.number(), size_bytes: z.number(), sha256: z.string() })),
  knowledge: z.unknown().optional(), snapshot_id: z.string().uuid().optional() });
export type VisualState = z.infer<typeof visualReadSchema>;
export const vHash = (value: unknown): string => canonicalHash(value as JsonValue);
export function invalidVisual(message: string, code = "INVALID_REFERENCE"): never {
  throw new ProductIntelligenceError(code as "INVALID_REFERENCE" | "VALIDATION_ERROR", message);
}
export const recordRef = (r: VisualRecord): VisualRef => ({ id: r.id, version: r.version, etag: r.etag });
export function findVisual(state: VisualState, id: string, kind?: VisualRecord["kind"], ref?: VisualRef): VisualRecord {
  const r = [...state.records, ...state.history].find(r => r.id === id && (!kind || r.kind === kind) && (!ref || r.version === ref.version && r.etag === ref.etag));
  if (!r) invalidVisual("La versión no pertenece a este producto o ya no está disponible.");
  return r;
}
export function makeVisualRecord(state: VisualState, kind: VisualRecord["kind"], payload: Record<string, unknown>, status: string, id?: string): VisualRecord {
  const old = id ? findVisual(state, id, kind) : undefined;
  const same = old && old.status === status && vHash(old.payload) === vHash(payload);
  const now = new Date().toISOString();
  return same ? old : { id: old?.id ?? id ?? randomUUID(), kind, payload, status, version: (old?.version ?? 0) + 1,
    etag: vHash({ kind, status, payload, version: (old?.version ?? 0) + 1 }), created_at: old?.created_at ?? now, updated_at: now };
}
function dep(state: VisualState, kind: VisualDependency["kind"], key: string, usage: VisualDependency["usage"]): VisualDependency {
  const entry = state.live[`${kind}:${key}`];
  if (!entry || entry.blocked) invalidVisual("Una dependencia falta o no tiene permiso de uso: " + kind + ":" + key);
  return { kind, key, usage, content_hash: entry.hash };
}
export function visualValidity(dependencies: readonly VisualDependency[], state: VisualState): VisualValidity {
  const reasons: VisualValidity["reasons"] = [];
  let blocked = false;
  for (const d of dependencies) {
    const current = state.live[`${d.kind}:${d.key}`];
    if (!current || current.blocked) {
      blocked = true; reasons.push({ code: "dependency_unavailable", dependency_key: `${d.kind}:${d.key}`, message: "La dependencia falta o su uso fue revocado. Revisa el contexto." });
    } else if (current.hash !== d.content_hash) reasons.push({ code: "dependency_changed", dependency_key: `${d.kind}:${d.key}`, message: "La dependencia cambió. Revisa la pieza antes de usarla." });
  }
  return visualValiditySchema.parse({ state: blocked ? "blocked" : reasons.length ? "needs_review" : "current", reasons: reasons.slice(0, 100) });
}
export function recordValidity(r: VisualRecord, state: VisualState): VisualValidity {
  const ds = (r.payload.validity_dependencies ?? r.payload.dependencies) as VisualDependency[] | undefined;
  return visualValidity(ds ?? [], state);
}
export function assertCurrent(r: VisualRecord, state: VisualState) {
  if (recordValidity(r, state).state !== "current") invalidVisual("El contenido cambió o necesita revisión antes de usarlo.", "VALIDATION_ERROR");
}
export function prepareIdentity(state: VisualState, raw: unknown, id?: string | null): VisualRecord {
  id ??= state.records.find(r => r.kind === "identity")?.id;
  const identity = visualIdentitySchema.parse(raw), base = state.references.find(r => r.is_base);
  if (!base || base.id !== identity.canonical_reference_image_id) invalidVisual("Elige la imagen base actual como referencia canónica.", "VALIDATION_ERROR");
  const d = dep(state, "reference", base.id, "identity");
  // Content hash is returned by the server after reading bytes, never accepted from the client alone.
  const bytesHash = state.live[`reference:${base.id}`]?.value as { content_hash?: string } | undefined;
  if (!bytesHash?.content_hash || bytesHash.content_hash !== identity.reference_content_hash) invalidVisual("La imagen base cambió. Recupera su huella antes de guardar.", "VALIDATION_ERROR");
  const payload = { ...identity, dependencies: [d], identity_hash: vHash(identity) };
  if (Buffer.byteLength(JSON.stringify(payload)) > 24000) invalidVisual("La identidad supera 24 KB. Resume las restricciones antes de guardar.", "VALIDATION_ERROR");
  return makeVisualRecord(state, "identity", payload, "review", id ?? undefined);
}
export function shotDependencies(state: VisualState, plan: VisualPlan, shot: VisualShot): VisualDependency[] {
  const identity = findVisual(state, plan.identity_ref.id, "identity", plan.identity_ref);
  const ds: VisualDependency[] = [{ kind: "identity", key: identity.id, content_hash: state.live[`identity:${identity.id}`]?.hash ?? vHash(identity.payload), usage: "identity" },
    ...(identity.payload.dependencies as VisualDependency[]), dep(state, "strategy", plan.strategy_id, "message")];
  if (shot.angle_id) ds.push(dep(state, "angle", shot.angle_id, "message"));
  if (shot.persuasion_plan_ref) {
    dep(state, "persuasion_plan", shot.persuasion_plan_ref.id, "message");
    const value = state.live[`persuasion_plan:${shot.persuasion_plan_ref.id}`]?.value as { version: number; etag: string; payload: { sections: { section_key: string; belief_keys: string[]; claim_keys: string[]; fact_ids: string[]; evidence_ids: string[] }[]; claims: { key: string; fact_ids: string[]; evidence_ids: string[] }[]; beliefs: { key: string; fact_ids: string[]; evidence_ids: string[] }[] } };
    if (value.version !== shot.persuasion_plan_ref.version || value.etag !== shot.persuasion_plan_ref.etag) invalidVisual("El plan persuasivo cambió.");
    const section = value.payload.sections.find(s => s.section_key === shot.section_key);
    if (!section || shot.belief_keys.some(k => !section.belief_keys.includes(k)) || shot.claim_keys.some(k => !section.claim_keys.includes(k))) invalidVisual("Vincula la toma a la sección, creencias y claims de su plan persuasivo.");
    for (const linked of [section, ...value.payload.claims.filter(c => shot.claim_keys.includes(c.key)), ...value.payload.beliefs.filter(b => shot.belief_keys.includes(b.key))]) {
      linked.fact_ids.forEach(id => ds.push(dep(state, "fact", id, "visual_result")));
      linked.evidence_ids.forEach(id => ds.push(dep(state, "evidence", id, "visual_result")));
    }
    ds.push(dep(state, "persuasion_section", `${shot.persuasion_plan_ref.id}:${shot.section_key}`, "message"));
  } else if (shot.belief_keys.length || shot.claim_keys.length || shot.section_key) invalidVisual("Las creencias y la sección requieren un plan persuasivo.");
  shot.fact_ids.forEach(id => ds.push(dep(state, "fact", id, "visual_result")));
  shot.evidence_ids.forEach(id => ds.push(dep(state, "evidence", id, "visual_result")));
  if (shot.representation === "real_evidence" && !shot.evidence_ids.length) invalidVisual("Una prueba real necesita evidencia verificable.", "VALIDATION_ERROR");
  if (shot.landing_hook_id && !shot.landing_angle_id || shot.landing_angle_id && !shot.angle_id) invalidVisual("El gancho y selector público requieren un ángulo.");
  const overlay = shot.message.overlay_text ?? "";
  // La oferta y las condiciones COD pueden ir en cualquier imagen; sus cambios requieren revisión.
  if (/\$|\d+\s*%|precio|oferta|descuento|gratis|regalo|\bpack\b|\b\d\s*x\s*\d\b|\blleva\s+\d|\bpaga\s+\d/i.test(overlay)) ds.push(dep(state, "pricing", "current", "overlay"));
  if (/env[ií]o|garant[ií]a|entrega|paga|pago|devoluci[oó]n/i.test(overlay)) ds.push(dep(state, "policy", "current", "overlay"));
  return [...new Map(ds.map(d => [`${d.kind}:${d.key}:${d.usage}`, d])).values()];
}
export function prepareVisualPlan(state: VisualState, raw: unknown, id?: string | null): VisualRecord {
  const plan = visualPlanSchema.parse(raw), identity = findVisual(state, plan.identity_ref.id, "identity", plan.identity_ref);
  assertCurrent(identity, state);
  dep(state, "strategy", plan.strategy_id, "message");
  if (!id && state.records.filter(r => r.kind === "plan" && r.status !== "archived").length >= VISUAL_LIMITS.plans) invalidVisual("Archiva un plan antes de crear otro.", "VALIDATION_ERROR");
  const old = id ? findVisual(state, id, "plan") : undefined;
  const prior = old?.payload.shots as (VisualShot & { shot_id: string; shot_version: number; shot_hash: string })[] | undefined;
  const shots = plan.shots.map(shot => {
    const dependencies = shotDependencies(state, plan, shot), hash = vHash({ shot, dependencies, visual_system: plan.visual_system }), previous = prior?.find(s => s.shot_key === shot.shot_key);
    return { ...shot, dependencies, shot_id: previous?.shot_id ?? randomUUID(), shot_hash: hash, shot_version: (previous?.shot_version ?? 0) + (previous?.shot_hash === hash ? 0 : 1) };
  });
  const payload = { ...plan, shots, dependencies: [...new Map(shots.flatMap(s => s.dependencies).map(d => [`${d.kind}:${d.key}:${d.usage}`, d])).values()] };
  if (Buffer.byteLength(JSON.stringify(payload)) > 64000) invalidVisual("El plan supera 64 KB. Divide las tomas en planes más pequeños.", "VALIDATION_ERROR");
  return makeVisualRecord(state, "plan", payload, "review", id ?? undefined);
}
export function planShot(state: VisualState, ref: VisualRef, key: string) {
  const record = findVisual(state, ref.id, "plan", ref), plan = visualPlanSchema.parse({ name: record.payload.name, strategy_id: record.payload.strategy_id, identity_ref: record.payload.identity_ref, visual_system: record.payload.visual_system, shots: (record.payload.shots as Record<string, unknown>[]).map(s => Object.fromEntries(Object.entries(s).filter(([k]) => !["dependencies", "shot_id", "shot_hash", "shot_version"].includes(k)))) });
  const shot = (record.payload.shots as (VisualShot & { dependencies: VisualDependency[]; shot_id: string; shot_hash: string; shot_version: number })[]).find(s => s.shot_key === key);
  if (!shot) invalidVisual("La toma no pertenece a esta versión del plan.");
  return { record, plan, shot };
}
export function prepareIteration(state: VisualState, input: { plan_ref: VisualRef; shot_key: string; parent_asset_id: string | null; reference_asset_ids: string[]; based_on_review_ids: string[]; resolved_instruction: string | null; source_system: string; model: string | null }): VisualRecord {
  const { record, plan, shot } = planShot(state, input.plan_ref, input.shot_key), identity = findVisual(state, plan.identity_ref.id, "identity", plan.identity_ref);
  if (record.status !== "approved" || identity.status !== "approved") invalidVisual("Aprueba la identidad y el plan en DropFlex antes de generar.", "VALIDATION_ERROR");
  if (state.records.find(r => r.id === record.id)?.etag !== record.etag || state.records.find(r => r.id === identity.id)?.etag !== identity.etag) invalidVisual("Usa la versión aprobada vigente del plan y la identidad.");
  if (visualValidity(shot.dependencies, state).state !== "current") invalidVisual("Revisa las dependencias de la toma antes de generar.", "VALIDATION_ERROR");
  if (shot.representation === "real_evidence" && input.source_system !== "manual") invalidVisual("Una imagen sintética no acredita resultados reales. Sube material real para esta toma.", "VALIDATION_ERROR");
  for (const id of input.reference_asset_ids) findVisual(state, id, "asset");
  if (input.parent_asset_id) findVisual(state, input.parent_asset_id, "asset");
  input.based_on_review_ids.forEach(id => findVisual(state, id, "review"));
  return makeVisualRecord(state, "iteration", { ...input, identity_ref: plan.identity_ref, strategy_id: plan.strategy_id, angle_id: shot.angle_id,
    shot_family: shot.shot_family, shot_snapshot: shot, visual_system: plan.visual_system, identity_snapshot: identity.payload,
    dependencies: shot.dependencies, instruction_hash: vHash(input.resolved_instruction), reference_image_ids: [String(identity.payload.canonical_reference_image_id)],
    result_asset_ids: [] }, "prepared");
}
export const targetKey = (target: VisualTarget): string => target.type === "gallery_shot" ? `gallery:${target.slot}${target.slot === "gallery" ? ":" + target.position : ""}` : target.type === "landing_section" ?
  `landing:${target.experience_id}:${target.content_variant_key}:${target.section_key}:${target.component}:${target.slot}` : target.type === "creative_concept" ?
  `creative:${target.concept_id}:${target.ratio}` : `ugc:${target.script_id}:${target.video_shot_id}:${target.slot}`;
export function targetDependency(state: VisualState, target: VisualTarget, etag: string): VisualDependency {
  const key = targetKey(target), found = state.targets.find(t => t.key === key);
  if (!found || found.etag !== etag) invalidVisual("El destino cambió. Recupera sus espacios antes de vincular.");
  return { kind: "content_variant", key, content_hash: etag, usage: "binding" };
}
export function assetCompatibility(asset: VisualRecord, shot: VisualShot, state: VisualState, visualSystem?: unknown): { compatible: boolean; reasons: string[]; transformation: string | null } {
  const reasons: string[] = [], validity = recordValidity(asset, state);
  if (asset.status !== "approved" || asset.payload.archived_at) reasons.push("Revisa y aprueba la pieza.");
  if (validity.state !== "current") reasons.push(...validity.reasons.map(r => r.message));
  if (asset.payload.representation !== shot.representation) reasons.push("La representación no coincide: una ilustración no sirve como evidencia.");
  if (asset.payload.shot_family !== shot.shot_family) reasons.push("La intención visual pertenece a otra familia.");
  const iteration = state.records.find(r => r.kind === "iteration" && r.id === asset.payload.iteration_id);
  if (visualSystem && iteration && vHash(iteration.payload.visual_system) !== vHash(visualSystem)) reasons.push("El sistema visual es distinto. Revisa el estilo antes de reutilizar.");
  const file = state.files.find(f => f.id === asset.payload.file_id);
  const [w, h] = shot.composition.aspect_ratio.split(":").map(Number);
  const crop = Boolean(file && Math.abs(file.width / file.height - w / h) > 0.02);
  if (!file) reasons.push("El archivo no está disponible.");
  if (crop) reasons.push("Necesita un encuadre nuevo y revisión.");
  return { compatible: !reasons.length, reasons, transformation: crop ? "crop" : null };
}
export function prepareBindings(state: VisualState, assetId: string, bindings: { target: VisualTarget; target_etag: string; reason?: string }[]): VisualRecord[] {
  const asset = findVisual(state, assetId, "asset");
  const keys = bindings.map(b => targetKey(b.target));
  if (new Set(keys).size !== keys.length) invalidVisual("No repitas destinos en la misma propuesta.", "VALIDATION_ERROR");
  return bindings.map(b => makeVisualRecord(state, "binding", { asset_id: asset.id, target: b.target, target_key: targetKey(b.target), target_etag: b.target_etag,
    reason: b.reason ?? "", dependencies: [...((asset.payload.validity_dependencies ?? asset.payload.dependencies) as VisualDependency[]), targetDependency(state, b.target, b.target_etag)] }, "proposed"));
}
export function prepareVisualReview(state: VisualState, input: { record_id: string; decision: string; reason: string; tags: string[] }): VisualRecord[] {
  const record = findVisual(state, input.record_id);
  if (["iteration", "review"].includes(record.kind)) invalidVisual("Esta entidad no se revisa con esta operación.", "VALIDATION_ERROR");
  let status = record.status, payload = { ...record.payload };
  if (input.decision === "approve") {
    if (record.payload.archived_at) invalidVisual("Vuelve a revisar la pieza archivada antes de aprobarla.", "VALIDATION_ERROR");
    if (record.kind === "binding") invalidVisual("Selecciona el uso después de aprobar la imagen.", "VALIDATION_ERROR");
    const validity = recordValidity(record, state);
    if (record.kind === "asset" && validity.state === "needs_review" && input.reason.trim()) {
      payload.validity_dependencies = (record.payload.dependencies as VisualDependency[]).map(d => ({ ...d, content_hash: state.live[`${d.kind}:${d.key}`].hash }));
    } else assertCurrent(record, state);
    status = "approved";
  } else if (input.decision === "select") {
    if (record.kind !== "binding") invalidVisual("Solo se seleccionan usos.", "VALIDATION_ERROR");
    const asset = findVisual(state, String(record.payload.asset_id), "asset");
    if (asset.status !== "approved" || asset.payload.archived_at) invalidVisual("Aprueba la imagen antes de usarla.", "VALIDATION_ERROR");
    assertCurrent(asset, state);
    const target = record.payload.target as VisualTarget, found = state.targets.find(t => t.key === targetKey(target));
    if (!found || found.etag !== record.payload.target_etag) invalidVisual("El destino cambió. Propón el uso de nuevo.", "VALIDATION_ERROR");
    const file = state.files.find(f => f.id === asset.payload.file_id);
    const ratio = target.type === "creative_concept" ? target.ratio : target.type === "gallery_shot" ? SLOT_RATIO[slotKind(target.slot)!] : null;
    if (!file) invalidVisual("El archivo no está disponible.", "VALIDATION_ERROR");
    if (ratio) { const [w, h] = ratio.split(":").map(Number); if (Math.abs(file.width / file.height - w / h) > 0.02) invalidVisual("Crea y revisa un encuadre con el formato del destino antes de usarlo.", "VALIDATION_ERROR"); }
    // Acknowledged asset validity advances this use, preserving original asset provenance.
    payload.dependencies = [...((asset.payload.validity_dependencies ?? asset.payload.dependencies) as VisualDependency[]), targetDependency(state, target, String(record.payload.target_etag))];
    status = "selected";
  } else if (input.decision === "unselect") {
    if (record.kind !== "binding") invalidVisual("Solo se quitan selecciones de uso.", "VALIDATION_ERROR");
    status = "proposed";
  } else if (["reject", "archive", "reopen"].includes(input.decision)) {
    if (state.records.some(b => b.kind === "binding" && b.status === "selected" && b.payload.asset_id === record.id)) invalidVisual("Quita los usos seleccionados antes de descartar o archivar la pieza.", "VALIDATION_ERROR");
    if (input.decision === "archive") { payload = { ...payload, archived_at: new Date().toISOString() }; status = "archived"; }
    else { delete payload.archived_at; status = input.decision === "reject" ? "rejected" : "review"; }
  } else invalidVisual("La decisión no es válida.", "VALIDATION_ERROR");
  if (record.kind === "asset" && status === "review") status = "in_review";
  const updated = makeVisualRecord(state, record.kind, payload, status, record.id);
  if (updated === record) return [];
  const review = makeVisualRecord(state, "review", { subject_id: record.id, subject_version: record.version, result_version: updated.version,
    decision: input.decision, reason: input.reason, tags: input.tags }, "recorded");
  const displaced = status === "selected" ? state.records.filter(r => r.kind === "binding" && r.id !== record.id && r.status === "selected" && r.payload.target_key === record.payload.target_key).map(r => makeVisualRecord(state, "binding", r.payload, "proposed", r.id)) : [];
  return [...displaced, updated, review];
}
export function checkVisualPreconditions(state: VisualState, input: { expected_revision: number; expected_etag: string; expected_dependency_stamp: string }, current?: VisualRecord) {
  if (input.expected_revision !== state.revision || input.expected_dependency_stamp !== state.dependency_stamp) throw new ProductIntelligenceError("REVISION_CONFLICT", "El contexto cambió. Recupera la propuesta antes de guardar.");
  if (input.expected_etag !== (current?.etag ?? state.etag)) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "La propuesta cambió. Recupera su versión antes de guardar.");
}
export const isVisualRef = (value: unknown): value is VisualRef => visualRefSchema.safeParse(value).success;
