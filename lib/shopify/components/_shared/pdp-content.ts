import * as z from "zod/v4";
export const pdpHeading = z
  .string()
  .trim()
  .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
  .min(4)
  .max(70);
export const pdpBody = z
  .string()
  .trim()
  .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
  .min(8)
  .max(160);
export const pdpFact = z
  .string()
  .uuid()
  .describe(
    "ID de un hecho aprobado y verificado de este producto que respalda esta afirmación. No un ID inventado ni una hipótesis.",
  );
export const pdpItem = z.object({
  title: z
    .string()
    .trim()
    .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
    .min(3)
    .max(45),
  body: pdpBody,
  fact_id: pdpFact,
});
