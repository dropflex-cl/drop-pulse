import { z } from "zod";
import { scriptLinesSchema, ugcPlanSchema, mascotPlanSchema } from "@/lib/video/schemas";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).meta({ format: "uuid" }), etag = z.string().regex(/^[a-f0-9]{64}$/);
const selector = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
export const getUgcInput = z.strictObject({ product_id: uuid, script_id: uuid.optional(), execution_key: selector.optional(), include_contract: z.boolean().default(false), page_size: z.number().int().min(1).max(24).default(12), cursor: z.string().max(200).optional() });
/** K1, A1… y B1… se construyen en código. El chat aporta redacción y planificación. */
export const chatUgcContent = z.discriminatedUnion("format", [
  z.strictObject({ format: z.literal("ugc"), lines: scriptLinesSchema.strict(), plan: ugcPlanSchema.strict() }),
  z.strictObject({ format: z.literal("mascot"), lines: scriptLinesSchema.strict(), plan: mascotPlanSchema.strict() }),
]);
export const saveUgcInput = z.strictObject({ product_id: uuid, schema_version: z.literal("1.0"),
  expected_revision: z.number().int().nonnegative().safe(), expected_ugc_etag: etag,
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false),
  execution_key: selector, strategy_id: uuid, angle_id: uuid, angle_slot: z.number().int().min(1).max(3),
  landing_angle_id: selector, landing_hook_id: selector,
  hook: z.strictObject({ spoken: z.string().trim().min(1).max(256), screen: z.string().trim().min(1).max(160),
    delivery: z.enum(["confiding", "intrigued", "surprised", "indignant", "deadpan", "playful"]),
    opening_shot: z.enum(["selfie_talk", "pov_hands", "problem_scene", "product_in_place", "mirror", "mascot_scene"]),
    first_motion: z.string().trim().min(1).max(1000) }),
  content: chatUgcContent.refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= 20 * 1024, "El guion y plan superan 20 KiB; acórtalos para poder recuperarlos completos desde el chat."),
});
export const getUgcMontageInput = z.strictObject({ product_id: uuid, script_id: uuid, expected_artifact_etag: etag });
export function ugcOutputs<E extends z.ZodType>(error: E) {
  const fail = z.strictObject({ ok: z.literal(false), request_id: uuid, error });
  const base = { ok: z.literal(true), product_id: uuid, revision: z.number().int().nonnegative(), request_id: uuid };
  return {
    get: z.union([fail, z.strictObject({ ...base, data: z.strictObject({ ugc_etag: etag, scripts: z.array(z.record(z.string(), z.unknown())).max(24), next_cursor: z.string().nullable(), truncated: z.boolean(),
      contract: z.record(z.string(), z.unknown()).nullable(), rules: z.array(z.string()), next_action: z.string() }) })]),
    save: z.union([fail, z.strictObject({ ...base, data: z.strictObject({ applied: z.boolean(), dry_run: z.boolean(), script_id: uuid.nullable(),
      ugc_etag: etag, artifact_etag: etag.nullable(), status: z.literal("in_review"), next_action: z.string() }) })]),
    montage: z.union([fail, z.strictObject({ ...base, data: z.strictObject({ package: z.record(z.string(), z.unknown()), next_action: z.string() }) })]),
  };
}
