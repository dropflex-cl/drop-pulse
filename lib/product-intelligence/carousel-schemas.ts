import { z } from "zod";
import { carouselContentSchema } from "@/lib/ads/carousel";
import { visualWriteSchema, visualUuid } from "./visual-schemas";

export const carouselInputs = {
  get_ad_carousels: z.strictObject({ product_id: visualUuid, carousel_id: visualUuid.optional(), offset: z.number().int().min(0).max(29).default(0) }),
  save_ad_carousel: z.strictObject({ ...visualWriteSchema.shape, schema_version: z.literal("1.0").default("1.0"), carousel_id: visualUuid.nullable().default(null), content: carouselContentSchema }),
};
export const carouselTools = Object.keys(carouselInputs) as (keyof typeof carouselInputs)[];
export function carouselOutputs<E extends z.ZodType>(error: E) {
  const failure = z.strictObject({ ok: z.literal(false), request_id: visualUuid, error });
  const base = { ok: z.literal(true), product_id: visualUuid, revision: z.number().int().nonnegative(), request_id: visualUuid };
  return {
    get_ad_carousels: z.union([failure, z.strictObject({ ...base, data: z.strictObject({
      carousels: z.array(z.strictObject({ id: visualUuid, content: carouselContentSchema, etag: z.string() })).max(1),
      next_offset: z.number().int().min(1).max(29).nullable(),
      contract: z.record(z.string(), z.unknown()), rules: z.array(z.string()),
    }) })]),
    save_ad_carousel: z.union([failure, z.strictObject({ ...base, data: z.strictObject({
      applied: z.boolean(), dry_run: z.boolean(), carousel_id: visualUuid, etag: z.string(), next_action: z.string(),
    }) })]),
  };
}
