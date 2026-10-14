import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
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
  objection: "¿Cómo se vive el cambio en una situación parecida a la mía?",
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
    ...PDP_COMPONENT_COPY_RULES,
  ],
  forbidden: [],
  examples: [
  {
    "heading": "De buscar cada lápiz a tenerlo al alcance",
    "stories": [
      {
        "title": "Una nota sin perder el hilo",
        "body": "Antes apartaba papeles para encontrar un lápiz. Ahora lo dejo en su compartimento y lo tomo al escribir una nota.",
        "name": "Muestra editorial de organización"
      }
    ]
  },
  {
    "heading": "Una aplicación que cabe en el día",
    "stories": [
      {
        "title": "Sin dejar el cuidado para después",
        "body": "Dejo el frasco junto a mis productos de cuidado. El gotero me permite concentrar la aplicación en uñas y cutículas.",
        "name": "Muestra editorial de cuidado"
      }
    ]
  }
],
});
