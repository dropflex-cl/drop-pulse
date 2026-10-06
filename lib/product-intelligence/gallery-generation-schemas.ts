import { z } from "zod";
const uuid = z.string().uuid();
export const galleryGenerationInputs = {
  generate_gallery_images: z.strictObject({ product_id: uuid, schema_version: z.literal("1.0"), expected_revision: z.number().int().nonnegative().safe(),
    expected_content_etag: z.string().regex(/^[a-f0-9]{64}$/), provider: z.enum(["higgsfield", "gemini"]), shot_ids: z.array(uuid).min(1).max(9).refine(ids => new Set(ids).size === ids.length),
    max_estimated_usd: z.number().positive().max(100), idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false) }),
  get_gallery_generation_status: z.strictObject({ product_id: uuid, operation_id: uuid }),
};
export function galleryGenerationOutputs<E extends z.ZodType>(error: E) {
  const failure = z.strictObject({ ok: z.literal(false), request_id: uuid, error });
  const base = { ok: z.literal(true), product_id: uuid, revision: z.number().int().nonnegative(), request_id: uuid };
  return {
    generate_gallery_images: z.union([failure, z.strictObject({ ...base, data: z.strictObject({ operation_id: uuid.nullable(), dry_run: z.boolean(),
      status: z.enum(["preview", "queued"]), image_ids: z.array(uuid).max(9), estimated_usd: z.number().nonnegative(), requires_review: z.literal(true), warnings: z.array(z.string()) }) })]),
    get_gallery_generation_status: z.union([failure, z.strictObject({ ...base, data: z.strictObject({ operation_id: uuid,
      status: z.enum(["queued", "running", "succeeded", "failed", "reconciling", "cancelled"]), estimated_usd: z.number().nonnegative(),
      images: z.array(z.strictObject({ id: uuid, slot: z.string(), render_status: z.string(), status: z.string(), error_code: z.string().nullable() })).max(9),
      requires_review: z.literal(true), next_action: z.string() }) })]),
  };
}
