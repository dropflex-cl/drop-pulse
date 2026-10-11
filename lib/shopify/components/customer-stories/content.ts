import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading } from "../_shared/pdp-content";
export const customerStories = defineComponent({
  id: "customer-stories",
  name: "DropFlex · Historias",
  kind: "section",
  file: "sections/df-customer-stories.liquid",
  metafield: { namespace: "dropflex", key: "customer_stories", type: "json" },
  media: [],
  imageSlots: [],
  placement:
    "Experiencias de compradores: después de la demostración y antes del cierre de compra.",
  objection: "Todavía no hay experiencias de compradores publicadas.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    stories: z
      .array(
        z.object({
          title: z
            .string()
            .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
            .min(3)
            .max(45),
          review_id: z
            .string()
            .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
            .min(1)
            .max(100)
            .optional()
            .describe("Referencia opcional para reutilizar una reseña del producto."),
          body: z.string().regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.").min(8).max(400).optional(),
          name: z.string().regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.").min(1).max(70).optional(),
        }),
      )
      .min(1)
      .max(4),
  }),
  realData: [
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
  ],
  forbidden: [],
  examples: [
    {
      heading: "Lo que cuentan quienes lo usan",
      stories: [
        { title: "En la rutina diaria", review_id: "rv_8812" },
        { title: "Una compra para la familia", review_id: "rv_1244" },
      ],
    },
    {
      heading: "Conoce otras experiencias de compradores",
      stories: [
        { title: "En la rutina diaria", review_id: "rv_8812" },
        { title: "Una compra para la familia", review_id: "rv_1244" },
      ],
    },
  ],
});
