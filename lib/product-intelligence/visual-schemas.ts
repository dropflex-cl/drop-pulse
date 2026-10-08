import { z } from "zod";
import { GALLERY_MAX } from "@/lib/page-images/catalog";
import { persuasionJobSchema } from "./persuasion-schemas";

export const VISUAL_LIMITS = { plans: 20, shots: 30, assets: 200, records: 1000, pageSize: 12, uploadBytes: 15 * 1024 * 1024,
  minSide: 600, maxPixels: 40_000_000, snapshotSeconds: 900, uploadSeconds: 900 } as const;
export const visualUuid = z.string().uuid(), visualHash = z.string().regex(/^[a-f0-9]{64}$/);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), text = z.string().trim().min(1).max(2000);
const strings = z.array(text).max(30), ids = z.array(visualUuid).max(50).refine(v => new Set(v).size === v.length);
export const visualRefSchema = z.strictObject({ id: visualUuid, version: z.number().int().positive().safe(), etag: visualHash });
export const visualDependencySchema = z.strictObject({ kind: z.enum(["reference", "identity", "strategy", "angle", "persuasion_plan", "persuasion_section", "fact", "evidence", "pricing", "policy", "content_variant", "landing_experience"]),
  key: z.string().min(1).max(200), content_hash: visualHash, usage: z.enum(["identity", "message", "visual_result", "overlay", "binding"]) });
export const visualValiditySchema = z.strictObject({ state: z.enum(["current", "needs_review", "blocked"]),
  reasons: z.array(z.strictObject({ code: key, dependency_key: z.string().max(200), message: text })).max(100) });
export const visualIdentitySchema = z.strictObject({ canonical_reference_image_id: visualUuid, reference_content_hash: visualHash,
  reference_mode: z.enum(["strict_product_identity", "guided_reference"]), identity_description: text,
  preserve: strings.min(1), allowed_variations: strings, forbidden_variations: strings });
export const visualShotSchema = z.strictObject({ shot_key: key, shot_family: key, name: text.max(120),
  priority: z.enum(["must_have", "recommended", "optional"]), channel: z.enum(["pdp", "gallery", "ad", "ugc", "email", "general"]),
  angle_id: visualUuid.nullable(), landing_angle_id: key.nullable(), landing_hook_id: key.nullable(),
  persuasion_plan_ref: visualRefSchema.nullable(), section_key: key.nullable(), persuasion_job: z.union([persuasionJobSchema, z.enum(["proof", "trust"])]),
  belief_keys: z.array(key).max(20), fact_ids: ids, evidence_ids: ids, claim_keys: z.array(key).max(40),
  objective: text, product_identity: z.literal("inherit"), product_role: z.enum(["hero", "supporting", "absent"]),
  representation: z.enum(["product_depiction", "illustrative_demo", "real_evidence"]),
  scene: z.strictObject({ environment: text, location: text, surface: text.nullable(), action: text, props: strings, lighting: text,
    result: text.nullable(), people: z.strictObject({ allowed: z.boolean(), face_visible: z.boolean(), description: text.nullable() }) }),
  composition: z.strictObject({ aspect_ratio: z.enum(["1:1", "3:4", "4:5", "9:16", "16:9"]), camera: text, framing: text,
    product_prominence: z.enum(["low", "medium", "high", "hero"]), negative_space: text.nullable(), focus: text.nullable() }),
  message: z.strictObject({ takeaway: text, overlay_text: text.max(500).nullable() }), avoid: strings, generation_required: z.boolean(),
});
export const visualPlanSchema = z.strictObject({ name: text.max(120), strategy_id: visualUuid, identity_ref: visualRefSchema,
  visual_system: z.strictObject({ world: z.enum(["real_home", "studio_color", "studio", "native_phone", "clean_explainer"]),
    palette: text, lighting: text, photography_style: text, typography: text.nullable(), mood: text, consistency_notes: text }),
  shots: z.array(visualShotSchema).min(1).max(VISUAL_LIMITS.shots).refine(v => new Set(v.map(s => s.shot_key)).size === v.length) });
export const visualTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("gallery_shot"), shot_key: key, slot: z.string().regex(/^(cover|gallery|benefit-[a-z0-9_-]{1,64})$/), position: z.number().int().min(1).max(GALLERY_MAX).nullable() }),
  z.strictObject({ type: z.literal("landing_section"), experience_id: visualUuid, content_variant_key: key, section_key: key, component: key, slot: key }),
  z.strictObject({ type: z.literal("creative_concept"), concept_id: visualUuid, ratio: z.enum(["1:1", "9:16"]), slot: z.literal("image") }),
  z.strictObject({ type: z.literal("ugc_shot"), script_id: visualUuid, video_shot_id: visualUuid, slot: z.enum(["keyframe", "b_roll"]) }),
]);
const read = { product_id: visualUuid };
const cursor = z.string().min(1).max(1000).optional();
export const visualWriteSchema = z.strictObject({ ...read, schema_version: z.literal("1.0"), expected_revision: z.number().int().nonnegative().safe(),
  expected_etag: visualHash, expected_dependency_stamp: visualHash, idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false) });
const write = visualWriteSchema.shape;
export const visualInputSchemas = {
  get_visual_generation_context: z.strictObject({ ...read, strategy_id: visualUuid.optional(), angle_id: visualUuid.optional(), channel: z.enum(["pdp", "gallery", "ad", "ugc"]).optional(), cursor }),
  get_visual_reference_image: z.strictObject({ ...read, reference_image_id: visualUuid, reference_content_hash: visualHash, iteration_id: visualUuid.optional() }),
  get_visual_identity: z.strictObject({ ...read, identity_id: visualUuid.optional(), version: z.number().int().positive().optional() }),
  save_visual_identity: z.strictObject({ ...write, identity_id: visualUuid.nullable().default(null), identity: visualIdentitySchema }),
  get_visual_generation_plan: z.strictObject({ ...read, plan_id: visualUuid.optional(), version: z.number().int().positive().optional(), shot_key: key.optional(), cursor }),
  save_visual_generation_plan: z.strictObject({ ...write, plan_id: visualUuid.nullable().default(null), plan: visualPlanSchema }),
  prepare_visual_iteration: z.strictObject({ ...write, plan_ref: visualRefSchema, shot_key: key, parent_asset_id: visualUuid.nullable().default(null),
    reference_asset_ids: ids.default([]), based_on_review_ids: ids.default([]), resolved_instruction: text.max(8000).nullable().default(null), source_system: z.enum(["chatgpt", "manual", "other"]), model: text.max(120).nullable().default(null) }),
  record_visual_iteration_result: z.strictObject({ ...write, iteration_id: visualUuid, state: z.enum(["failed", "abandoned"]), detail: text }),
  prepare_visual_asset_upload: z.strictObject({ ...write, iteration_id: visualUuid, mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]), size_bytes: z.number().int().positive().max(VISUAL_LIMITS.uploadBytes) }),
  ingest_external_visual_asset: z.strictObject({ ...write, iteration_id: visualUuid, source: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("remote_url"), url: z.string().url().max(4000).refine(v => new URL(v).protocol === "https:") }),
    z.strictObject({ type: z.literal("upload_ticket"), ticket_id: visualUuid }),
  ]), generated_at: z.string().datetime().nullable().default(null) }),
  get_visual_ingestion_status: z.strictObject({ ...read, operation_id: visualUuid }),
  bind_visual_asset: z.strictObject({ ...write, asset_id: visualUuid, bindings: z.array(z.strictObject({ target: visualTargetSchema, target_etag: visualHash })).min(1).max(10) }),
  unbind_visual_asset: z.strictObject({ ...write, binding_ids: ids.min(1) }),
  list_visual_assets: z.strictObject({ ...read, shot_family: key.optional(), angle_id: visualUuid.optional(), review_status: z.enum(["generated", "in_review", "approved", "rejected"]).optional(), include_archived: z.boolean().default(false), cursor }),
  get_visual_reconciliation_context: z.strictObject({ ...read, plan_id: visualUuid, cursor }),
  save_visual_reconciliation: z.strictObject({ ...write, plan_id: visualUuid, plan: visualPlanSchema, resolutions: z.array(z.strictObject({ shot_key: key, action: z.enum(["retain", "replace", "remove"]), reason: text })).min(1).max(VISUAL_LIMITS.shots) }),
  get_visual_reuse_candidates: z.strictObject({ ...read, plan_ref: visualRefSchema, shot_key: key, cursor }),
  save_visual_binding_suggestions: z.strictObject({ ...write, asset_id: visualUuid, bindings: z.array(z.strictObject({ target: visualTargetSchema, target_etag: visualHash, reason: text })).min(1).max(10) }),
  get_visual_iteration_history: z.strictObject({ ...read, plan_id: visualUuid.optional(), shot_key: key.optional(), shot_family: key.optional(), cursor }),
  get_visual_comparison: z.strictObject({ ...read, asset_ids: ids.min(2).max(4) }),
} as const;
export type VisualTool = keyof typeof visualInputSchemas;
export const visualTools = Object.keys(visualInputSchemas) as VisualTool[];
export const visualDescriptions: Record<VisualTool, string> = {
  get_visual_reference_image: "Entrega la imagen base como contenido de imagen MCP, con ID y hash verificados. Llámala antes de generar y adjunta la imagen devuelta al generador; una URL o descripción no basta. Si el cliente no puede usarla como entrada, pide adjuntar la foto original y no generes. No llama a proveedores.",
  get_visual_generation_context: "Lee contexto visual, referencia canónica consumible, contratos, destinos y capacidades para generar desde el chat; DropFlex no genera.",
  get_visual_identity: "Lee identidad visual vigente o histórica y sus restricciones.", save_visual_identity: "Guarda identidad física con referencia y CAS. Con automatización Shopify autorizada queda aprobada; no cambia la foto base.",
  get_visual_generation_plan: "Recupera plan, tomas y versiones exactas para continuar la producción visual.", save_visual_generation_plan: "Guarda intención visual versionada. Con automatización autorizada aprueba planes exclusivos de PDP/galería; no llama a proveedores.",
  prepare_visual_iteration: "Congela una toma, referencias e instrucción antes de generar externamente. Devuelve referencias temporales; no despacha generación.",
  record_visual_iteration_result: "Registra un intento externo fallido o abandonado sin inventar gasto ni reintentar.",
  prepare_visual_asset_upload: "Prepara una URL firmada de subida para los bytes del chat; luego confirma con ingest_external_visual_asset.",
  ingest_external_visual_asset: "Copia y optimiza una imagen externa con su procedencia; acepta HTTPS o ticket de subida. Crea una pieza por revisar, sin aprobar ni publicar.",
  get_visual_ingestion_status: "Lee estado y resultado persistido de la ingestión, sin llamar al generador.", bind_visual_asset: "Propone usos tipados de una pieza. Con automatización Shopify autorizada, review_visual_record selecciona destinos de galería/PDP; anuncios y UGC conservan revisión manual.",
  unbind_visual_asset: "Archiva propuestas de uso con CAS. No retira lo publicado.", list_visual_assets: "Lista piezas, versiones, vigencia y feedback con paginación consistente.",
  get_visual_reconciliation_context: "Muestra dependencias visuales que cambiaron y destinos afectados.", save_visual_reconciliation: "Propone una nueva versión reconciliada por toma sin reescribir procedencia ni heredar aprobación.",
  get_visual_reuse_candidates: "Busca candidatos por familia, identidad y destino, explicando incompatibilidades; no selecciona automáticamente.",
  save_visual_binding_suggestions: "Guarda sugerencias de reutilización justificadas sin reemplazar decisiones manuales.",
  get_visual_iteration_history: "Recupera iteraciones, padres, instrucciones, fallos y feedback históricos.", get_visual_comparison: "Compara previews, procedencia, reviews y dependencias sin puntajes IA.",
};
export const visualRecordSchema = z.object({ id: visualUuid, kind: z.enum(["identity", "plan", "iteration", "asset", "binding", "review"]), version: z.number().int().positive(),
  etag: visualHash, status: z.string(), payload: z.record(z.string(), z.unknown()), created_at: z.string(), updated_at: z.string() });
export type VisualRecord = z.infer<typeof visualRecordSchema>;
export type VisualRef = z.infer<typeof visualRefSchema>;
export type VisualShot = z.infer<typeof visualShotSchema>;
export type VisualPlan = z.infer<typeof visualPlanSchema>;
export type VisualIdentity = z.infer<typeof visualIdentitySchema>;
export type VisualDependency = z.infer<typeof visualDependencySchema>;
export type VisualValidity = z.infer<typeof visualValiditySchema>;
export type VisualTarget = z.infer<typeof visualTargetSchema>;
export const visualReviewInput = z.strictObject({ ...write, record_id: visualUuid, decision: z.enum(["approve", "reject", "reopen", "archive", "select", "unselect"]),
  reason: z.string().trim().max(2000).default(""), tags: z.array(z.enum(["wrong_product_shape", "wrong_color", "too_fake", "too_dirty", "bad_composition", "bad_text", "bad_reference_fidelity", "good_product_fidelity", "good_demo", "good_composition"])).max(10).default([]) });

const visualFileView = z.object({ id: visualUuid, bucket: z.string(), storage_path: z.string(), mime_type: z.string(), width: z.number().positive(), height: z.number().positive(), size_bytes: z.number().positive(), sha256: visualHash, url: z.string().url() });
const visualRecordViewSchema = visualRecordSchema.extend({ validity: visualValiditySchema, reviews: z.array(visualRecordSchema).max(10), file: visualFileView.optional(), shot_validity: z.record(z.string(), visualValiditySchema).optional() });
const canonicalView = z.object({ id: visualUuid, storage_path: z.string().nullable(), url: z.string().url().nullable(), mime_type: z.string().nullable(), is_base: z.boolean(),
  content_hash: visualHash.nullable().optional(), width: z.number().positive().optional(), height: z.number().positive().optional() }).nullable();
const targetView = z.strictObject({ key: z.string(), etag: visualHash, value: z.strictObject({ target: visualTargetSchema }) });
const uploadView = z.strictObject({ url: z.string().url(), token: z.string(), path: z.string(), mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]), size_bytes: z.number().positive().max(VISUAL_LIMITS.uploadBytes), protocol: z.literal("supabase_signed_upload"), expires_at: z.string().datetime({ offset: true }) });
const operationView = { operation_id: visualUuid, kind: z.enum(["upload", "ingest"]), iteration_id: visualUuid, state: z.enum(["pending", "processing", "succeeded", "failed"]), expires_at: z.string().datetime({ offset: true }),
  result: z.strictObject({ asset_id: visualUuid, file_id: visualUuid, revision: z.number().int().nonnegative() }).nullable(), error: z.string().nullable() };
const commonVisualOutput = { etag: visualHash, dependency_stamp: visualHash };
const pageFields = { total: z.number().int().nonnegative(), next_cursor: z.string().nullable() };
const visualPage = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item).max(VISUAL_LIMITS.pageSize), ...pageFields });
export function visualOutputs<E extends z.ZodType>(error: E) {
  const envelope = <T extends z.ZodType>(data: T) => z.union([z.strictObject({ ok: z.literal(false), request_id: visualUuid, error }), z.strictObject({ ok: z.literal(true), request_id: visualUuid, product_id: visualUuid, revision: z.number().int().nonnegative(), data })]);
  const write = envelope(z.strictObject({ ...commonVisualOutput, applied: z.boolean(), dry_run: z.boolean(), records: z.array(visualRecordSchema).max(40), operation_id: visualUuid.nullable().optional(),
    canonical_reference: canonicalView.optional(), upload: uploadView.optional(), ...Object.fromEntries(Object.entries(operationView).filter(([k]) => k !== "operation_id").map(([k, v]) => [k, v.optional()])) }));
  const plans = envelope(z.strictObject({ ...commonVisualOutput, current: visualRecordViewSchema.nullable(), shots: visualPage(z.looseObject({ shot_key: z.string(), validity: visualValiditySchema })), identity: visualRecordSchema.nullable(), canonical_reference: canonicalView,
    assets: z.array(visualRecordViewSchema).max(3), items: z.array(z.strictObject({ id: visualUuid, version: z.number().int().positive(), etag: visualHash, name: z.string(), status: z.string() })).max(VISUAL_LIMITS.plans) }));
  return {
    get_visual_reference_image: envelope(z.strictObject({ ...commonVisualOutput, canonical_reference: canonicalView.unwrap(),
      image: z.strictObject({ mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]), width: z.number().int().positive(), height: z.number().int().positive(), content_hash: visualHash, derived: z.boolean(), delivery: z.literal("mcp_image_content") }),
      next_action: z.string() })),
    get_visual_generation_context: envelope(z.strictObject({ ...commonVisualOutput, product: z.unknown(), context: z.unknown(), pricing: z.unknown(), policies: z.unknown(), selected_strategy: z.unknown(), canonical_reference: canonicalView,
      identity: visualRecordSchema.nullable(), context_records: visualPage(z.strictObject({ kind: z.string(), value: z.unknown() })), targets: z.array(targetView).max(50), capabilities: z.strictObject({ generation: z.literal("external_only"), ingestion: z.array(z.enum(["remote_url", "upload_ticket"])), approval: z.literal("merchant_ui"), reuse: z.boolean(), max_upload_bytes: z.number(), max_pixels: z.number(), max_plans: z.number(), max_shots: z.number(), max_assets: z.number() }), next_steps: z.array(z.string()) })),
    get_visual_identity: plans, get_visual_generation_plan: plans,
    save_visual_identity: write, save_visual_generation_plan: write, prepare_visual_iteration: write, record_visual_iteration_result: write, prepare_visual_asset_upload: write, ingest_external_visual_asset: write,
    bind_visual_asset: write, unbind_visual_asset: write, save_visual_reconciliation: write, save_visual_binding_suggestions: write,
    get_visual_ingestion_status: envelope(z.strictObject({ ...commonVisualOutput, ...operationView })),
    list_visual_assets: envelope(z.strictObject({ ...commonVisualOutput, items: z.array(visualRecordViewSchema).max(VISUAL_LIMITS.pageSize), ...pageFields })),
    get_visual_reconciliation_context: envelope(z.strictObject({ ...commonVisualOutput, plan: visualRecordSchema, shots: z.array(z.strictObject({ shot_key: z.string(), validity: visualValiditySchema })).max(VISUAL_LIMITS.shots), bindings: visualPage(visualRecordSchema.extend({ validity: visualValiditySchema })), identity: z.array(visualRecordSchema) })),
    get_visual_reuse_candidates: envelope(z.strictObject({ ...commonVisualOutput, ...pageFields, items: z.array(visualRecordViewSchema.extend({ reuse: z.strictObject({ compatible: z.boolean(), reasons: z.array(z.string()), transformation: z.literal("crop").nullable() }) })).max(VISUAL_LIMITS.pageSize) })),
    get_visual_iteration_history: envelope(z.strictObject({ ...commonVisualOutput, ...pageFields, items: z.array(visualRecordSchema.extend({ reviews: z.array(visualRecordSchema) })).max(VISUAL_LIMITS.pageSize) })),
    get_visual_comparison: envelope(z.strictObject({ ...commonVisualOutput, items: z.array(visualRecordViewSchema).min(2).max(4) })),
  };
}
