import * as z from "zod/v4";

/** Contrato del diferenciador confirmado por el comerciante. */
export const differentiatorSchema = z.object({
  versus: z.string().trim().min(3).max(120),
  claim: z.string().trim().min(10).max(280),
  basis: z.string().trim().max(280).default(""),
});
export type Differentiator = z.infer<typeof differentiatorSchema>;
