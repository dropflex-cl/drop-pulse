import { z } from "zod";
const uuid = z.string().uuid(), date = z.iso.date();
const window = { from: date, through: date };
export const performanceInput = z.strictObject({ product_id: uuid, ...window }).refine(x => {
  const days = (Date.parse(x.through) - Date.parse(x.from)) / 86400000;
  return days >= 0 && days < 90;
}, "Consulta periodos de hasta 90 días.");
export const getLearningInput = z.strictObject({ product_id: uuid, before_revision: z.number().int().positive().optional() });
export const learningContentSchema = z.strictObject({ strategy_id: uuid, hypothesis: z.string().trim().min(1).max(2000),
  criteria: z.string().trim().min(1).max(2000), observation: z.string().trim().min(1).max(4000),
  outcome: z.enum(["inconclusive", "supports_hypothesis", "contradicts_hypothesis"]),
  limitations: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
  next_action: z.string().trim().min(1).max(2000),
  execution: z.strictObject({ angle_id: uuid, persuasion_plan_id: uuid, plan_revision: z.number().int().positive().safe(),
    experience_id: uuid, experience_revision: z.number().int().positive().safe(), architecture_variant: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
    section_key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).optional(), measurement_attribution: z.literal("product_campaigns_only") }).optional(),
});
export const saveLearningInput = z.strictObject({ product_id: uuid, schema_version: z.enum(["1.0", "1.1"]), ...window,
  expected_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), expected_performance_etag: z.string().regex(/^[a-f0-9]{64}$/),
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false), learning: learningContentSchema,
}).refine(x => Date.parse(x.through) >= Date.parse(x.from) && Date.parse(x.through) - Date.parse(x.from) < 90 * 86400000);
export const learningInputSchemas = { get_product_performance: performanceInput, get_product_learning: getLearningInput, save_product_learning: saveLearningInput };
export const learningTools = Object.keys(learningInputSchemas) as (keyof typeof learningInputSchemas)[];
export function learningOutputs<E extends z.ZodType>(error: E) {
  const failure = z.strictObject({ ok: z.literal(false), request_id: uuid, error });
  const base = { ok: z.literal(true), product_id: uuid, revision: z.number().int().nonnegative(), request_id: uuid };
  const performance = z.strictObject({ performance_etag: z.string(), from: date, through: date, source: z.literal("meta_cached_daily_campaign"),
    groups: z.array(z.strictObject({ currency: z.string(), timezone: z.string(), campaign_count: z.number().int().nonnegative(),
      days_with_data: z.number().int().nonnegative(), spend: z.number().nonnegative(), impressions: z.number().nonnegative(), clicks: z.number().nonnegative(),
      purchases: z.number().nonnegative(), purchase_value: z.number().nonnegative(), initiated_checkouts: z.number().nonnegative(), last_synced_at: z.string().nullable(),
    })).max(50), cod: z.null(), attribution: z.literal("product_campaigns_only"), warnings: z.array(z.string()) });
  return { get_product_performance: z.union([failure, z.strictObject({ ...base, data: performance })]),
    get_product_learning: z.union([failure, z.strictObject({ ...base, data: z.strictObject({ items: z.array(z.unknown()).max(20), has_more: z.boolean(), next_before_revision: z.number().nullable() }) })]),
    save_product_learning: z.union([failure, z.strictObject({ ...base, data: z.strictObject({ applied: z.boolean(), dry_run: z.boolean(), learning_id: uuid.nullable(), next_action: z.string() }) })]) };
}
