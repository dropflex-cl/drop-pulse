import { z } from "zod";
import { LANDING_COMPONENT_IDS } from "./landing-schemas";
import { imagePickSchema, selectorSchema } from "@/lib/copy/variants";

const uuid = z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    .meta({ format: "uuid" }),
  text = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const ids = z
  .array(uuid)
  .max(50)
  .refine((v) => new Set(v).size === v.length, "No repitas referencias.");
const keys = z
  .array(key)
  .max(20)
  .refine((v) => new Set(v).size === v.length, "No repitas claves.");
export const persuasionJobs = [
  "recognition",
  "desire_activation",
  "problem_visualization",
  "agitation",
  "reframe",
  "solution_logic",
  "product_fit",
  "differentiation",
  "mechanism",
  "demonstration",
  "ease",
  "social_proof",
  "similarity_proof",
  "authority_proof",
  "objection_resolution",
  "value",
  "risk_reversal",
  "urgency",
  "close",
] as const;
export const persuasionJobSchema = z.enum(persuasionJobs);
export type PersuasionJob = z.infer<typeof persuasionJobSchema>;
export const landingComponentSchema = z.enum(
  LANDING_COMPONENT_IDS as [string, ...string[]],
);
const refs = { fact_ids: ids.default([]), evidence_ids: ids.default([]) };
export const persuasionAssetSchema = z.strictObject({
  source: z.enum(["reference", "page_image", "ugc"]),
  id: uuid,
  role: z.enum(["hero", "proof", "demo", "explanation", "comparison"]),
  slot: key.optional(),
  selected: z.boolean().optional(),
});
export const attentionBudgetSchema = z.strictObject({
  max_primary_sections: z.number().int().min(1).max(7).default(6),
  max_support_sections: z
    .number()
    .int()
    .min(0)
    .max(LANDING_COMPONENT_IDS.length - 1)
    .default(LANDING_COMPONENT_IDS.length - 1),
  copy_density: z.enum(["very_low", "low", "medium"]).default("low"),
  max_headline_chars: z.number().int().min(10).max(70).default(70),
  max_subheadline_chars: z.number().int().min(10).max(160).default(150),
  max_body_chars_per_section: z.number().int().min(20).max(400).default(400),
  max_bullets_per_section: z.number().int().min(0).max(3).default(3),
  max_primary_messages_per_section: z.literal(1).default(1),
  preferred_visual_ratio: z.number().min(0).max(1).default(0.65),
  mobile_first: z.literal(true).default(true),
});
export const persuasionBeliefSchema = z.strictObject({
  key,
  type: z.enum([
    "recognition",
    "problem_importance",
    "desire",
    "reframe",
    "solution_logic",
    "product_fit",
    "differentiation",
    "ease",
    "proof",
    "similarity",
    "trust",
    "value",
    "risk",
    "urgency",
  ]),
  current_belief: text,
  target_belief: text,
  mandatory: z.boolean().default(true),
  ...refs,
  objection_ids: ids.default([]),
  resolution_mode: z.enum([
    "section",
    "microcopy",
    "proof",
    "offer",
    "faq",
    "cta_context",
  ]),
  resolution_section_key: key,
});
export const persuasionClaimSchema = z.strictObject({
  key,
  text_intent: text,
  type: z.enum([
    "product_fact",
    "ingredient",
    "performance",
    "comparative",
    "timeline",
    "clinical",
    "testimonial",
    "offer",
    "shipping",
    "guarantee",
    "scarcity",
  ]),
  ...refs,
  review_ids: ids.default([]),
  restrictions: z.array(text).max(10).default([]),
  // El agente declara la intención. La validación nunca acepta un boolean allowed/verified del input.
});
export const persuasionSectionSchema = z.strictObject({
  section_key: key,
  kind: z.enum(["primary", "support"]),
  primary_job: persuasionJobSchema,
  secondary_jobs: z.array(persuasionJobSchema).max(2).default([]),
  belief_keys: keys,
  preferred_medium: z.enum([
    "visual_led",
    "proof_led",
    "copy_led",
    "commerce_led",
    "mixed",
  ]),
  candidate_components: z.array(landingComponentSchema).min(1).max(5),
  selected_component: landingComponentSchema,
  message: z.strictObject({
    headline_intent: text.max(200),
    body_intent: text.optional(),
    takeaway: text.max(300),
  }),
  necessity: text.max(500),
  redundancy_justification: text.max(500).optional(),
  creative_direction: z
    .strictObject({
      objective: text,
      visual_role: z.enum([
        "recognize",
        "explain",
        "demonstrate",
        "prove",
        "compare",
        "aspire",
        "reduce_risk",
      ]),
      format: key,
      scene: text,
      composition: text,
      product_role: z.enum(["hero", "supporting", "absent"]),
      generation_required: z.boolean(),
    })
    .optional(),
  ...refs,
  claim_keys: keys.default([]),
  source_asset_refs: z.array(persuasionAssetSchema).max(20).default([]),
  cta: z.enum(["none", "soft", "primary"]),
});
export const persuasionPlanSchema = z.strictObject({
  schema_version: z.literal("1.0"),
  strategy_id: uuid,
  angle_id: uuid,
  landing_angle_id: selectorSchema,
  status: z.enum(["draft", "review", "approved", "archived"]),
  audience_state: z.strictObject({
    persona_id: uuid,
    awareness_level: z.enum([
      "unaware",
      "problem_aware",
      "solution_aware",
      "product_aware",
      "most_aware",
    ]),
    sophistication: z.enum(["low", "medium", "high", "very_high"]),
    primary_jtbd_ids: ids.max(3),
    primary_pain_ids: ids.max(3),
    primary_desire_ids: ids.max(3),
    primary_objection_ids: ids.max(5),
    entering_context: text,
  }),
  thesis: z.strictObject({
    recognition: text,
    problem: text,
    reframe: text.optional(),
    solution_logic: text,
    product_role: text,
    desired_transformation: text,
    memorable_idea: text.optional(),
    promise_fact_ids: ids.default([]),
    mechanism_fact_ids: ids.default([]),
  }),
  beliefs: z.array(persuasionBeliefSchema).min(4).max(7),
  attention_budget: attentionBudgetSchema,
  sections: z
    .array(persuasionSectionSchema)
    .min(1)
    .max(LANDING_COMPONENT_IDS.length),
  claims: z.array(persuasionClaimSchema).max(40).default([]),
});
export type AnglePersuasionPlan = z.infer<typeof persuasionPlanSchema>;
export const landingExperienceSchema = z.strictObject({
  schema_version: z.literal("1.0"),
  strategy_id: uuid,
  angle_id: uuid,
  persuasion_plan_id: uuid,
  plan_revision: z.number().int().positive().safe(),
  landing_angle_id: selectorSchema,
  landing_hook_id: selectorSchema.nullable().default(null),
  experience_key: selectorSchema,
  architecture_variant: selectorSchema,
  is_default: z.boolean().default(false),
  status: z.enum(["draft", "review", "active", "archived"]),
  sections: z
    .array(
      z.strictObject({
        section_key: key,
        component: landingComponentSchema,
        content_variant_key: selectorSchema,
        persuasion_job: persuasionJobSchema,
        belief_keys: keys,
        enabled: z.boolean(),
        images: z.array(imagePickSchema).max(30).default([]),
        asset_refs: z.array(persuasionAssetSchema).max(20).default([]),
        manual_overrides: z
          .array(z.enum(["order", "enabled", "component", "content", "assets"]))
          .max(5)
          .default([]),
      }),
    )
    .min(1)
    .max(LANDING_COMPONENT_IDS.length),
});
export type LandingExperience = z.infer<typeof landingExperienceSchema>;
export const persuasionIssueSchema = z.strictObject({
  code: key,
  field: z.string().max(256),
  message: z.string().max(2000),
  severity: z.enum(["error", "warning"]),
  section_key: key.optional(),
});
export type PersuasionIssue = z.infer<typeof persuasionIssueSchema>;
const read = { product_id: uuid };
const selection = { strategy_id: uuid, angle_id: uuid };
const write = {
  ...read,
  schema_version: z.literal("1.0"),
  expected_revision: z.number().int().nonnegative().safe(),
  expected_planning_stamp: z.string().regex(/^[a-f0-9]{64}$/),
  expected_etag: z.string().regex(/^[a-f0-9]{64}$/),
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
  dry_run: z.boolean().default(false),
};
export const persuasionInputSchemas = {
  get_pdp_planning_context: z.strictObject({ ...read, ...selection }),
  get_component_catalog: z.strictObject(read),
  get_angle_persuasion_plan: z.strictObject({
    ...read,
    ...selection,
    plan_id: uuid.optional(),
  }),
  validate_angle_persuasion_plan: z.strictObject({
    ...read,
    expected_revision: z.number().int().nonnegative().safe(),
    plan: persuasionPlanSchema,
  }),
  save_angle_persuasion_plan: z.strictObject({
    ...write,
    plan_id: uuid.nullable().default(null),
    plan: persuasionPlanSchema,
  }),
  get_landing_experience: z.strictObject({
    ...read,
    experience_id: uuid.optional(),
  }),
  save_landing_experience: z.strictObject({
    ...write,
    experience_id: uuid.nullable().default(null),
    experience: landingExperienceSchema,
  }),
};
export const persuasionTools = Object.keys(
  persuasionInputSchemas,
) as (keyof typeof persuasionInputSchemas)[];
export const persuasionRecordSchema = z.strictObject({
  id: uuid,
  revision: z.number().int().positive().safe(),
  etag: z.string().regex(/^[a-f0-9]{64}$/),
  payload: persuasionPlanSchema,
});
export const experienceRecordSchema = z.strictObject({
  id: uuid,
  revision: z.number().int().positive().safe(),
  etag: z.string().regex(/^[a-f0-9]{64}$/),
  payload: landingExperienceSchema,
});
const head = {
  id: uuid,
  revision: z.number().int().positive().safe(),
  etag: z.string(),
  strategy_id: uuid,
  angle_id: uuid,
  landing_angle_id: selectorSchema,
};
const planSummarySchema = z.strictObject({
  ...head,
  status: z.enum(["draft", "review", "approved", "archived"]),
  primary_sections: z.number().int().nonnegative(),
});
const experienceSummarySchema = z.strictObject({
  ...head,
  persuasion_plan_id: uuid,
  plan_revision: z.number().int().positive().safe(),
  landing_hook_id: selectorSchema.nullable(),
  experience_key: selectorSchema,
  architecture_variant: selectorSchema,
  is_default: z.boolean(),
  status: z.enum(["draft", "review", "active", "archived"]),
});
const capabilitySchema = z.strictObject({
  component: landingComponentSchema,
  name: z.string(),
  supported_jobs: z.array(persuasionJobSchema),
  placement: z.enum(["hero", "body"]),
  attention_cost: z.number().positive(),
  visual_strength: z.number().min(0).max(5),
  proof_strength: z.number().min(0).max(5),
  copy_density: z.enum(["very_low", "low", "medium"]),
  supports_cta: z.boolean(),
  asset_requirements: z.array(z.string()),
  constraints: z.array(z.string()),
  min_reviews: z.number().int().nonnegative(),
  available: z.boolean(),
  image_slots: z.array(
    z.strictObject({
      key: z.string(),
      label: z.string(),
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
      ratio: z.enum(["1:1", "3:4", "9:16"]),
      hint: z.string(),
    }),
  ),
  rules: z.array(z.string()),
  forbidden: z.array(z.string()),
});
export function persuasionOutputs<E extends z.ZodType>(error: E) {
  const failure = z.strictObject({
    ok: z.literal(false),
    request_id: uuid,
    error,
  });
  const envelope = <T extends z.ZodType>(data: T) =>
    z.union([
      failure,
      z.strictObject({
        ok: z.literal(true),
        product_id: uuid,
        revision: z.number().int().nonnegative().safe(),
        request_id: uuid,
        data,
      }),
    ]);
  const issues = z.array(persuasionIssueSchema).max(100);
  const getPlan = z.strictObject({
    current: persuasionRecordSchema.nullable(),
    etag: z.string(),
    planning_stamp: z.string(),
    issues,
  });
  const save = z.strictObject({
    applied: z.boolean(),
    dry_run: z.boolean(),
    id: uuid.nullable(),
    revision: z.number().int().nonnegative().safe(),
    etag: z.string(),
    issues,
  });
  return {
    get_pdp_planning_context: envelope(
      z.strictObject({
        strategy: z.unknown(),
        angle: z.unknown(),
        context: z.unknown(),
        available_assets: z.array(persuasionAssetSchema).max(500),
        landing: z.unknown(),
        catalog: z.array(capabilitySchema).max(LANDING_COMPONENT_IDS.length),
        plans: z.array(planSummarySchema).max(20),
        experiences: z.array(experienceSummarySchema).max(20),
        planning_stamp: z.string(),
        limitations: z.array(z.string()).max(20),
      }),
    ),
    get_component_catalog: envelope(
      z.strictObject({
        catalog: z.array(capabilitySchema).max(LANDING_COMPONENT_IDS.length),
      }),
    ),
    get_angle_persuasion_plan: envelope(getPlan),
    validate_angle_persuasion_plan: envelope(
      z.strictObject({ valid: z.boolean(), issues }),
    ),
    save_angle_persuasion_plan: envelope(save),
    get_landing_experience: envelope(
      z.strictObject({
        current: experienceRecordSchema.nullable(),
        items: z.array(experienceSummarySchema).max(20),
        etag: z.string(),
        planning_stamp: z.string(),
      }),
    ),
    save_landing_experience: envelope(save),
  };
}
