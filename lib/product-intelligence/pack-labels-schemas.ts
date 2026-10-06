// Contrato del chat basado en la forma y límites del editor existente.
import { z } from "zod";
import { packLabelSchema } from "@/lib/ai/schemas";
import { LABEL_CHARS, SUPPORT_CHARS, BADGE_CHARS } from "@/lib/pricing/labels";
const uuid = z.string().uuid(), etag = z.string().regex(/^[a-f0-9]{64}$/);
export const chatPackLabelSchema = packLabelSchema.strict().extend({
  units: z.number().int().min(1).max(3), label: z.string().trim().min(1).max(LABEL_CHARS.max),
  support: z.string().trim().min(1).max(SUPPORT_CHARS.max).nullable(), badge: z.string().trim().min(1).max(BADGE_CHARS.max).nullable(),
  reason: z.string().trim().min(1).max(1000),
});
export const chatPackLabelsSchema = z.array(chatPackLabelSchema).min(1).max(3)
  .refine((ls) => new Set(ls.map((l) => l.units)).size === ls.length, "No repitas un pack.")
  .refine((ls) => ls.filter((l) => l.badge).length <= 1, "Usa un distintivo en un solo pack.");
export const getPackLabelsInput = z.strictObject({ product_id: uuid });
export const savePackLabelsInput = z.strictObject({ product_id: uuid, schema_version: z.literal("1.0"),
  expected_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), expected_pack_labels_etag: etag,
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false),
  labels: chatPackLabelsSchema, duration_fact_ids: z.array(uuid).max(20).default([]).refine((ids) => new Set(ids).size === ids.length),
});
export function packLabelsOutputs<E extends z.ZodType>(error: E) {
  const failure = z.strictObject({ ok: z.literal(false), request_id: uuid, error });
  const base = { ok: z.literal(true), product_id: uuid, revision: z.number().int().nonnegative(), request_id: uuid };
  return {
    get: z.union([failure, z.strictObject({ ...base, data: z.strictObject({ pack_labels_etag: etag,
      pricing: z.unknown().nullable(), current: z.unknown().nullable(), pricing_stale: z.boolean(), evidence_stale: z.boolean(),
      duration_facts_has_more: z.boolean(),
      duration_facts: z.array(z.strictObject({ id: uuid, statement: z.string(), value: z.unknown(), unit: z.string().nullable() })).max(50),
      contract: z.record(z.string(), z.unknown()), rules: z.array(z.string()), next_action: z.string(),
    }) })]),
    save: z.union([failure, z.strictObject({ ...base, data: z.strictObject({ applied: z.boolean(), dry_run: z.boolean(),
      proposal_id: uuid.nullable(), status: z.string(), pack_labels_etag: etag, next_action: z.string(),
    }) })]),
  };
}
