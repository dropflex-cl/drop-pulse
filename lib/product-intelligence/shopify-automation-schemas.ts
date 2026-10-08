import { z } from "zod";
import { visualReviewInput, visualOutputs } from "./visual-schemas";

const uuid = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/);
// La publicación existente usa MD5 para identificar su payload; no es una credencial.
const publicationFingerprint = z.string().regex(/^[a-f0-9]{32}$/);
const read = { product_id: uuid };
const write = { ...read, expected_revision: z.number().int().nonnegative().safe(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false) };
export const confirmedHooksSchema = z.array(z.strictObject({ angle_id: uuid, hook: z.string().min(1).max(8192) }))
  .min(1).max(3).refine(rows => new Set(rows.map(r => r.angle_id)).size === rows.length, "No repitas un ángulo.");
export const automationStateSchema = z.object({ enabled: z.boolean(), active: z.boolean(), authorization_id: uuid.nullable(),
  strategy_id: uuid.nullable(), confirmed_hooks: confirmedHooksSchema.nullable(), dependency_hash: hash.nullable(),
  revision: z.number().int().nonnegative().safe(), next_action: z.string() });
export const shopifyAutomationInputs = {
  get_shopify_automation: z.strictObject(read),
  authorize_shopify_automation: z.strictObject({ ...write, strategy_id: uuid, confirmed_hooks: confirmedHooksSchema,
    auto_approve_and_publish: z.literal(true).describe("El comerciante eligió estos hooks y autorizó aprobar el contenido y publicar en Shopify desde el chat.") }),
  disable_shopify_automation: z.strictObject(write),
  publish_product: z.strictObject({ ...write, expected_fingerprint: publicationFingerprint }),
  review_visual_record: visualReviewInput,
};
export const shopifyAutomationTools = Object.keys(shopifyAutomationInputs) as (keyof typeof shopifyAutomationInputs)[];
export function shopifyAutomationOutputs<E extends z.ZodType>(error: E) {
  const envelope = <T extends z.ZodType>(data: T) => z.union([
    z.strictObject({ ok: z.literal(false), request_id: uuid, error }),
    z.strictObject({ ok: z.literal(true), product_id: uuid, revision: z.number().int().nonnegative().safe(), request_id: uuid, data }),
  ]);
  const policy = envelope(automationStateSchema);
  return {
    get_shopify_automation: envelope(automationStateSchema.extend({ publication: z.object({ status: z.string(), product_url: z.string().nullable(), error_message: z.string().nullable() }).nullable(),
      publish_ready: z.boolean(), missing: z.array(z.string()), fingerprint: publicationFingerprint.nullable() })),
    authorize_shopify_automation: policy, disable_shopify_automation: policy,
    publish_product: envelope(z.strictObject({ applied: z.boolean(), dry_run: z.boolean(), operation_id: uuid.nullable(), status: z.string() })),
    review_visual_record: visualOutputs(error).save_visual_identity,
  };
}
