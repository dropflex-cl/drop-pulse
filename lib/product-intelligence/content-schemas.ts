import { z } from "zod";
import { FAMILIES, TEXT_ROLES } from "@/lib/creatives/catalog";
import { chatOutputSchema } from "@/lib/creatives/schemas";
import { pagePlanSchema } from "@/lib/page-images/schemas";
import { eventCopySchema } from "@/lib/events/copy";
import { TIP_MAX } from "@/lib/whatsapp/tip";

const uuid = z.string().uuid(), text = z.string().trim().min(1).max(4000);
export const contentCursorSchema = z.strictObject({ offset: z.number().int().positive().max(1000), revision: z.number().int().nonnegative(), content_etag: z.string().regex(/^[a-f0-9]{64}$/) });
export const artifactReadInput = z.strictObject({ product_id: uuid, cursor: contentCursorSchema.optional() });
const write = { product_id: uuid, schema_version: z.literal("1.0"), expected_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expected_content_etag: z.string().regex(/^[a-f0-9]{64}$/), idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false) };
const binding = { strategy_id: uuid, angle_ids: z.array(uuid).min(1).max(3).refine(ids => new Set(ids).size === ids.length),
  fact_ids: z.array(uuid).max(50).default([]).refine(ids => new Set(ids).size === ids.length) };
export const creativeContentSchema = z.strictObject({ ...binding, product_look: text, kit: z.array(text).max(30), concepts: z.array(z.strictObject({
  execution_key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), angle_id: uuid, family: z.enum([...FAMILIES, "whatsapp_chat"]),
  landing_angle_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/), landing_hook_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
  name: text.max(120), idea: text, why: text, look: text, art: z.strictObject({ palette: text, typography: text, mood: text }),
  scene: text, layout: text, product_units: z.number().int().min(1).max(3), kit_parts: z.array(text).max(30),
  texts: z.array(z.strictObject({ role: z.enum(TEXT_ROLES), text: text, placement: text, points_to: text.nullable() })).max(7),
  chat: chatOutputSchema.omit({ name: true, why: true }).nullable(),
})).min(1).max(18).refine(rows => new Set(rows.map(r => r.execution_key)).size === rows.length) });
export const galleryContentSchema = z.strictObject({ ...binding, plan: pagePlanSchema });
export const eventContentSchema = z.strictObject({ event_id: uuid, content: eventCopySchema, fact_ids: binding.fact_ids });
export const usageTipContentSchema = z.strictObject({ text: text.max(TIP_MAX), basis: text.max(1000), fact_ids: binding.fact_ids });
export const contentInputSchemas = {
  get_creative_content: artifactReadInput, save_creative_content: z.strictObject({ ...write, content: creativeContentSchema }),
  get_gallery_content: artifactReadInput, save_gallery_content: z.strictObject({ ...write, content: galleryContentSchema }),
  get_event_content: artifactReadInput, save_event_content: z.strictObject({ ...write, content: eventContentSchema }),
  get_usage_tip: artifactReadInput, save_usage_tip: z.strictObject({ ...write, content: usageTipContentSchema }),
};
export const contentTools = Object.keys(contentInputSchemas) as (keyof typeof contentInputSchemas)[];
export function contentOutputs<E extends z.ZodType>(error: E) {
  const failure = z.strictObject({ ok: z.literal(false), request_id: uuid, error });
  const base = { ok: z.literal(true), product_id: uuid, revision: z.number().int().nonnegative(), request_id: uuid };
  const get = z.union([failure, z.strictObject({ ...base, data: z.strictObject({ content_etag: z.string(), current: z.unknown(),
    contract: z.record(z.string(), z.unknown()), rules: z.array(z.string()), has_more: z.boolean(), next_cursor: contentCursorSchema.nullable(), next_action: z.string() }) })]);
  const save = z.union([failure, z.strictObject({ ...base, data: z.strictObject({ applied: z.boolean(), dry_run: z.boolean(), content_etag: z.string(),
    artifact_ids: z.array(uuid), next_action: z.string() }) })]);
  return { get_creative_content: get, save_creative_content: save, get_gallery_content: get, save_gallery_content: save,
    get_event_content: get, save_event_content: save, get_usage_tip: get, save_usage_tip: save };
}
