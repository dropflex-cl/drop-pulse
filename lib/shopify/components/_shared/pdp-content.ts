import * as z from "zod/v4";

/** Infografías completas: la primera imagen del destino contiene el mensaje de la sección. */
export function imageOnlyPdpSlot(component: string, content: unknown): string | undefined {
  if ((content as { display_mode?: string } | null)?.display_mode !== "image_only") return undefined;
  return component === "use-cases" ? "cases" : component === "usage-steps" ? "steps" : undefined;
}
export const pdpImageAlt = z.string().trim().regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.").min(8).max(500)
  .describe("Describe el mensaje y las instrucciones de la imagen para lectores de pantalla.");
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
    "Referencia opcional a un hecho del producto para conservar procedencia.",
  ).optional();
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
