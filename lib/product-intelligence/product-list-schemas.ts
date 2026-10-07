import { z } from "zod";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).meta({ format: "uuid" });
export const listProductsInput = z.strictObject({
  page_size: z.number().int().min(1).max(50).default(20),
  cursor: uuid.optional(),
  include_upsell: z.boolean().default(false),
});
export const productListData = z.strictObject({
  products: z.array(z.strictObject({ product_id: uuid, name: z.string().min(1).max(512), description: z.string().min(1).max(300).nullable() })).max(50),
  next_cursor: uuid.nullable(),
});
export function listProductsOutput<E extends z.ZodType>(error: E) {
  return z.union([
    z.strictObject({ ok: z.literal(true), request_id: uuid, data: productListData }),
    z.strictObject({ ok: z.literal(false), request_id: uuid, error }),
  ]);
}
