import { pdpBindingSchema } from "./pdp-bindings";
// El contrato de escritura se deriva del mismo catálogo que publica Shopify.
import { z } from "zod";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { storedContentSchema } from "@/lib/copy/variants";
import { listingSchema } from "@/lib/copy/listing";

const uuid = z.string().uuid();
const etag = z.string().regex(/^[a-f0-9]{64}$/);
export const LANDING_COMPONENT_IDS = ["listing", ...CATALOG.map((c) => c.id)];
const entries = [{ id: "listing", schema: listingSchema }, ...CATALOG.filter((c) => c.metafield).map((c) => ({ id: c.id, schema: c.content }))]
  .map(({ id, schema }) => z.strictObject({ component: z.literal(id), content: storedContentSchema(schema), metadata: pdpBindingSchema.optional() }));
export const landingEntrySchema = z.union(entries as [typeof entries[number], typeof entries[number], ...typeof entries[number][]]);
export const getLandingInput = z.strictObject({ product_id: uuid, component: z.enum(LANDING_COMPONENT_IDS as [string, ...string[]]).default("listing"), schema_version: z.enum(["1.0", "1.1", "1.2"]).default("1.1") });
export const saveLandingInput = z.strictObject({
  product_id: uuid, schema_version: z.enum(["1.0", "1.1", "1.2"]), expected_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expected_landing_etag: etag, idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false),
  entries: z.array(landingEntrySchema).min(1).max(17).refine((items) => new Set(items.map((i) => i.component)).size === items.length, "No repitas un componente."),
});

export function landingOutputs<E extends z.ZodType>(error: E) {
  const failure = z.strictObject({ ok: z.literal(false), request_id: uuid, error });
  const base = { ok: z.literal(true), product_id: uuid, revision: z.number().int().nonnegative(), request_id: uuid };
  return {
    get: z.union([failure, z.strictObject({ ...base, data: z.strictObject({
      landing_etag: etag, contract_version: z.enum(["1.1", "1.2"]),
      context_stale: z.boolean(),
      catalog: z.array(z.strictObject({ component: z.string(), name: z.string(), kind: z.string(), min_reviews: z.number().int().nonnegative(), available: z.boolean() })).max(17),
      contract: z.strictObject({ component: z.string(), name: z.string(), placement: z.string(), objection: z.string(),
        schema: z.record(z.string(), z.unknown()), rules: z.array(z.string()), forbidden: z.array(z.string()), real_data: z.array(z.string()),
        image_slots: z.array(z.unknown()), examples: z.array(z.unknown()).max(1) }),
      current: z.union([z.null(), z.strictObject({ metadata: pdpBindingSchema.nullable().optional(), id: uuid, content: z.unknown(), enabled: z.boolean(), status: z.string(), images: z.array(z.unknown()) })]),
      image_catalog: z.array(z.strictObject({ source: z.enum(["reference", "page_image"]), id: uuid })).max(500),
      approved_reviews: z.array(z.strictObject({ id: uuid, body: z.string(), rating: z.number() })).max(30),
      review_count: z.number().int().nonnegative(), pricing: z.unknown(), policies: z.unknown(),
      next_action: z.string(),
    }) })]),
    save: z.union([failure, z.strictObject({ ...base, data: z.strictObject({
      applied: z.boolean(), dry_run: z.boolean(), run_id: uuid.nullable(), landing_etag: etag,
      components: z.array(z.strictObject({ component: z.string(), id: uuid.nullable(), status: z.enum(["generated", "approved"]) })).min(1).max(17),
      next_action: z.string(),
    }) })]),
  };
}
