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
            .max(100),
        }),
      )
      .min(1)
      .max(4),
  }),
  realData: [
    "Hechos aprobados y verificados; referencias reales, reseñas aprobadas, políticas y precios publicados.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "No envíes contenido ficticio para rellenar: sin evidencia se publica el estado vacío.",
    "Todos los fact_id deben pertenecer a hechos aprobados y verificados del producto.",
    "Solo selecciona reseñas aprobadas con review_id. La tienda muestra el texto, autor y fotos reales; no reescribe testimonios.",
  ],
  forbidden: [
    "Testimonios, expertos, estudios, resultados, escasez o plazos inventados.",
    "Imágenes generadas usadas como evidencia.",
    "Regalos que no se entregan ni garantías que la tienda no ofrece.",
  ],
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
